import { Prisma } from '@prisma/client';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { MessageService } from './message.service.js';
import { UserService } from './user.service.js';
import { parseEnvelope } from '../utils/e2ee.js';

interface ScheduledAttachment {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
}

interface ScheduleInput {
  content?: string;
  attachments?: ScheduledAttachment[];
  replyToId?: string;
  scheduledFor: string | Date;
  /** End-to-end encrypted payload (encrypted by the author's browser at schedule time). */
  e2ee?: unknown;
}

const MIN_LEAD_MS = 60 * 1000;
const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;
const TICK_MS = 10 * 1000;
/** A row stuck in SENDING this long (e.g. the server crashed mid-send) is retried. */
const STALE_SENDING_MS = 2 * 60 * 1000;
const BATCH_SIZE = 50;

let io: SocketIOServer | null = null;
let timer: NodeJS.Timeout | null = null;
let ticking = false;
let warnedMissingTable = false;

function parseWhen(value: string | Date): Date {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) throw new AppError('Invalid schedule time.', 400);
  const lead = when.getTime() - Date.now();
  if (lead < MIN_LEAD_MS) throw new AppError('Pick a time at least a minute from now.', 400);
  if (lead > MAX_LEAD_MS) throw new AppError('Messages can be scheduled up to a year ahead.', 400);
  return when;
}

/** Tell the author's open clients to refresh their scheduled list for a room. */
function notifyAuthor(senderId: string, roomId: string) {
  io?.to(`user:${senderId}`).emit('scheduled:changed', { roomId });
}

export class ScheduledMessageService {
  static async create(userId: string, roomId: string, input: ScheduleInput) {
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: { select: { isGroup: true, members: { select: { userId: true } } } } },
    });
    if (!membership) throw new AppError('You are not a member of this chat room.', 403);
    // Fail now rather than at send time if this is a direct chat with a block in place
    if (!membership.room.isGroup) {
      const peer = membership.room.members.find((m) => m.userId !== userId);
      if (peer && (await UserService.isBlocked(userId, peer.userId))) {
        throw new AppError('You can’t message this person.', 403);
      }
    }

    const envelope = parseEnvelope(input.e2ee);
    if (!envelope) {
      throw new AppError('Scheduled messages must be end-to-end encrypted.', 400);
    }
    // Encrypted messages carry everything inside the envelope; never keep plaintext with them
    const content = envelope ? null : input.content?.trim() || null;
    const attachments = !envelope && input.attachments?.length ? input.attachments : null;
    if (!envelope && !content && !attachments) throw new AppError('Message cannot be empty.', 400);

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        roomId,
        senderId: userId,
        content,
        attachments: attachments ? (attachments as unknown as Prisma.InputJsonValue) : undefined,
        e2ee: envelope ?? undefined,
        replyToId: input.replyToId || null,
        scheduledFor: parseWhen(input.scheduledFor),
      },
    });
    notifyAuthor(userId, roomId);
    return scheduled;
  }

  /** Pending and failed scheduled messages for the user, optionally limited to one room. */
  static async list(userId: string, roomId?: string) {
    return prisma.scheduledMessage.findMany({
      where: {
        senderId: userId,
        status: { in: ['PENDING', 'FAILED'] },
        ...(roomId ? { roomId } : {}),
      },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  private static async getOwnEditable(userId: string, id: string) {
    const scheduled = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!scheduled || scheduled.senderId !== userId) {
      throw new AppError('Scheduled message not found.', 404);
    }
    if (scheduled.status !== 'PENDING' && scheduled.status !== 'FAILED') {
      throw new AppError('This message has already been sent.', 409);
    }
    return scheduled;
  }

  static async update(
    userId: string,
    id: string,
    patch: { content?: string; scheduledFor?: string | Date; e2ee?: unknown }
  ) {
    const scheduled = await this.getOwnEditable(userId, id);
    const envelope = parseEnvelope(patch.e2ee);
    if (scheduled.e2ee && patch.content !== undefined && !envelope) {
      throw new AppError('Encrypted messages must be edited with an encrypted payload.', 400);
    }
    const content = envelope
      ? null
      : patch.content !== undefined
        ? patch.content.trim() || null
        : scheduled.content;
    if (!envelope && !scheduled.e2ee && !content && !scheduled.attachments) {
      throw new AppError('Message cannot be empty.', 400);
    }

    // A failed message only goes back in the queue when it gets a new time; editing its
    // text alone must not silently send it. Only update rows the dispatcher hasn't claimed.
    const requeue = !!patch.scheduledFor || scheduled.status === 'PENDING';
    const result = await prisma.scheduledMessage.updateMany({
      where: { id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        content,
        ...(envelope ? { e2ee: envelope } : {}),
        ...(patch.scheduledFor ? { scheduledFor: parseWhen(patch.scheduledFor) } : {}),
        ...(requeue ? { status: 'PENDING' as const, error: null } : {}),
      },
    });
    if (result.count === 0) throw new AppError('This message has already been sent.', 409);
    notifyAuthor(userId, scheduled.roomId);
    return prisma.scheduledMessage.findUnique({ where: { id } });
  }

  static async cancel(userId: string, id: string) {
    const scheduled = await this.getOwnEditable(userId, id);
    const result = await prisma.scheduledMessage.deleteMany({
      where: { id, status: { in: ['PENDING', 'FAILED'] } },
    });
    if (result.count === 0) throw new AppError('This message has already been sent.', 409);
    notifyAuthor(userId, scheduled.roomId);
  }

  static async sendNow(userId: string, id: string) {
    await this.getOwnEditable(userId, id);
    await prisma.scheduledMessage.updateMany({
      where: { id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PENDING', scheduledFor: new Date(), error: null },
    });
    const outcome = await this.dispatch(id);
    if (outcome.status === 'FAILED') throw new AppError(outcome.error, 422);
  }

  /**
   * Post one scheduled message. The row is claimed atomically (PENDING -> SENDING) so it is
   * sent once even with several server instances; the message carries a stable clientId so a
   * retry after a crash is de-duplicated by MessageService.sendMessage.
   */
  static async dispatch(
    id: string
  ): Promise<{ status: 'SENT' | 'SKIPPED' } | { status: 'FAILED'; error: string }> {
    // Claim only if still due: a reschedule between the tick's query and here wins
    const claimed = await prisma.scheduledMessage.updateMany({
      where: { id, status: 'PENDING', scheduledFor: { lte: new Date() } },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 0) return { status: 'SKIPPED' };

    const scheduled = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!scheduled) return { status: 'SKIPPED' };

    try {
      const message = await MessageService.sendMessage(scheduled.senderId, scheduled.roomId, {
        content: scheduled.content ?? undefined,
        e2ee: scheduled.e2ee ?? undefined,
        replyToId: scheduled.replyToId ?? undefined,
        attachments: (scheduled.attachments as unknown as ScheduledAttachment[] | null) ?? undefined,
        metadata: { clientId: `sched_${scheduled.id}`, scheduled: true },
      });
      // updateMany: the row may have been reset or cancelled meanwhile; that's fine
      await prisma.scheduledMessage.updateMany({
        where: { id, status: 'SENDING' },
        data: { status: 'SENT', sentMessageId: message.id, error: null },
      });
      const { isDuplicate, ...stored } = message;
      if (!isDuplicate) io?.to(`room:${scheduled.roomId}`).emit('message:new', stored);
      return { status: 'SENT' };
    } catch (err) {
      const reason = err instanceof AppError ? err.message : 'Could not send this message.';
      await prisma.scheduledMessage.updateMany({
        where: { id, status: 'SENDING' },
        data: { status: 'FAILED', error: reason },
      });
      if (!(err instanceof AppError)) console.error(`Scheduled message ${id} failed:`, err);
      return { status: 'FAILED', error: reason };
    } finally {
      notifyAuthor(scheduled.senderId, scheduled.roomId);
    }
  }

  /** Send everything that is due. Runs on an interval; overlapping ticks are skipped. */
  static async tick() {
    if (ticking) return;
    ticking = true;
    try {
      await prisma.scheduledMessage.updateMany({
        where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
        data: { status: 'PENDING' },
      });

      const due = await prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
        orderBy: { scheduledFor: 'asc' },
        select: { id: true },
        take: BATCH_SIZE,
      });
      for (const { id } of due) await this.dispatch(id);
      warnedMissingTable = false;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021') {
        if (!warnedMissingTable) {
          console.warn(
            'Scheduled messages are disabled: the ScheduledMessage table does not exist yet. ' +
              'Run `npm run prisma:push` (or prisma migrate) in server/ to create it.'
          );
          warnedMissingTable = true;
        }
      } else {
        console.error('Scheduled message dispatcher error:', err);
      }
    } finally {
      ticking = false;
    }
  }

  static start(socketServer: SocketIOServer) {
    io = socketServer;
    if (timer) return;
    timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  static stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
}
