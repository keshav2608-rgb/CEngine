import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { UserService } from './user.service.js';

export interface CreateAttachmentInput {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export class MessageService {
  /**
   * Send a new message in a room
   */
  static async sendMessage(
    senderId: string,
    roomId: string,
    data: {
      content?: string;
      messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
      replyToId?: string;
      attachments?: CreateAttachmentInput[];
      metadata?: Record<string, unknown>;
    }
  ) {
    // 1. Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: senderId } },
      include: { room: { include: { members: true } } },
    });

    if (!membership) {
      throw new AppError('You are not a member of this chat room.', 403);
    }

    // 2. If 1:1 chat, check block status
    if (!membership.room.isGroup) {
      const otherMember = membership.room.members.find((m) => m.userId !== senderId);
      if (otherMember) {
        const isBlocked = await UserService.isBlocked(senderId, otherMember.userId);
        if (isBlocked) {
          throw new AppError('Cannot send message: user is blocked or has blocked you.', 403);
        }
      }
    }

    const cleanContent = data.content ? sanitizeInput(data.content) : '';
    const hasAttachments = data.attachments && data.attachments.length > 0;

    if (!cleanContent && !hasAttachments) {
      throw new AppError('Message cannot be empty.', 400);
    }

    // 3. Verify replyTo message if present
    if (data.replyToId) {
      const replyTarget = await prisma.message.findUnique({
        where: { id: data.replyToId },
      });
      if (!replyTarget || replyTarget.roomId !== roomId) {
        data.replyToId = undefined; // clear invalid reply
      }
    }

    // 4. Create message in database
    const message = await prisma.message.create({
      data: {
        roomId,
        senderId,
        content: cleanContent,
        messageType: data.messageType || (hasAttachments ? 'IMAGE' : 'TEXT'),
        replyToId: data.replyToId,
        metadata: data.metadata ? (data.metadata as object) : undefined,
        attachments: hasAttachments
          ? {
              create: data.attachments!.map((att) => ({
                fileUrl: att.fileUrl,
                fileName: sanitizeInput(att.fileName),
                fileSize: att.fileSize,
                mimeType: att.mimeType,
                width: att.width,
                height: att.height,
              })),
            }
          : undefined,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        attachments: true,
      },
    });

    // 5. Create initial receipts for all other members (SENT status)
    const otherMembers = membership.room.members.filter((m) => m.userId !== senderId);
    if (otherMembers.length > 0) {
      await prisma.messageReceipt.createMany({
        data: otherMembers.map((m) => ({
          messageId: message.id,
          userId: m.userId,
          status: 'SENT',
        })),
      });
    }

    // 6. Update room updatedAt timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    // Fetch receipts for response
    const receipts = await prisma.messageReceipt.findMany({
      where: { messageId: message.id },
    });

    return {
      ...message,
      receipts,
    };
  }

  /**
   * Get messages for a room with cursor-based pagination (scrolling up)
   */
  static async getRoomMessages(
    roomId: string,
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
    }
  ) {
    const isMember = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!isMember) {
      throw new AppError('You are not a member of this chat room.', 403);
    }

    const take = options.limit ? Math.min(options.limit, 50) : 30;

    const messages = await prisma.message.findMany({
      where: { roomId },
      take: take + 1, // +1 to check hasMore
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1, // skip cursor item itself
          }
        : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        attachments: true,
        receipts: true,
      },
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;

    // Return in chronological order (oldest first in list)
    return {
      messages: items.reverse(),
      hasMore,
      nextCursor: hasMore ? items[0]?.id : null,
    };
  }

  /**
   * Edit a sent message
   */
  static async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new AppError('Message not found.', 404);
    }

    if (message.senderId !== userId) {
      throw new AppError('You can only edit your own messages.', 403);
    }

    if (message.isDeleted) {
      throw new AppError('Cannot edit a deleted message.', 400);
    }

    const cleanContent = sanitizeInput(newContent.trim());
    if (!cleanContent) {
      throw new AppError('Message content cannot be empty.', 400);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: cleanContent,
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        attachments: true,
        receipts: true,
      },
    });

    return updated;
  }

  /**
   * Delete a message (soft delete)
   */
  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        room: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!message) {
      throw new AppError('Message not found.', 404);
    }

    const member = message.room.members[0];
    const isSender = message.senderId === userId;
    const isOwnerOrAdmin = member && (member.role === 'OWNER' || member.role === 'ADMIN');

    if (!isSender && !isOwnerOrAdmin) {
      throw new AppError('You do not have permission to delete this message.', 403);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: 'This message was deleted',
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        receipts: true,
      },
    });

    return updated;
  }

  /**
   * Mark messages as DELIVERED for a user
   */
  static async markDelivered(userId: string, messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return;

    await prisma.messageReceipt.updateMany({
      where: {
        userId,
        messageId: { in: messageIds },
        status: 'SENT',
      },
      data: {
        status: 'DELIVERED',
      },
    });
  }

  /**
   * Mark all unread messages in a room as READ for a user
   */
  static async markRoomAsRead(userId: string, roomId: string) {
    // 1. Update all receipts in room for this user
    await prisma.messageReceipt.updateMany({
      where: {
        userId,
        message: { roomId },
        status: { in: ['SENT', 'DELIVERED'] },
      },
      data: {
        status: 'READ',
      },
    });

    // 2. Update member's lastReadMessageId
    const latestMessage = await prisma.message.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (latestMessage) {
      await prisma.roomMember.update({
        where: { roomId_userId: { roomId, userId } },
        data: { lastReadMessageId: latestMessage.id },
      });
    }
  }

  /**
   * Search messages across user's rooms
   */
  static async searchMessages(userId: string, query: string, limit = 20) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    });
    const roomIds = memberships.map((m) => m.roomId);

    return prisma.message.findMany({
      where: {
        roomId: { in: roomIds },
        isDeleted: false,
        content: { contains: cleanQuery, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
            isGroup: true,
          },
        },
      },
    });
  }
}
