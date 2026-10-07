import webpush from 'web-push';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { presenceService } from './presence.service.js';
import { AppError } from '../utils/errors.js';

const enabled = !!(config.push.publicKey && config.push.privateKey);
if (enabled) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
} else {
  console.warn('Push notifications are disabled: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
}

interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class PushService {
  static get enabled() {
    return enabled;
  }

  static get publicKey() {
    return config.push.publicKey;
  }

  /** Save (or move to this user) a browser's push subscription and its muted rooms. */
  static async subscribe(userId: string, sub: SubscriptionInput, mutedRoomIds: string[] = []) {
    // A subscription belongs to the account that created it; it can't be moved to another one
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
    if (existing && existing.userId !== userId) {
      throw new AppError('This push subscription belongs to another account.', 409);
    }
    return prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        mutedRoomIds,
      },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, mutedRoomIds },
    });
  }

  static async unsubscribe(userId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /**
   * Notify members who aren't connected right now. The payload never includes message
   * content (encrypted messages can't be read by the server anyway): only who wrote and where.
   */
  static async notifyNewMessage(params: {
    roomId: string;
    roomName: string | null;
    isGroup: boolean;
    senderId: string;
    senderName: string;
    memberIds: string[];
  }) {
    if (!enabled) return;
    const offline = params.memberIds.filter(
      (id) => id !== params.senderId && !presenceService.isUserOnline(id)
    );
    if (!offline.length) return;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: offline }, NOT: { mutedRoomIds: { has: params.roomId } } },
    });
    if (!subs.length) return;

    const payload = JSON.stringify({
      title: params.isGroup ? params.roomName || 'Group' : params.senderName,
      body: params.isGroup ? `${params.senderName} sent a message` : 'Sent you a message',
      roomId: params.roomId,
      url: `/chat?room=${params.roomId}`,
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60, urgency: 'high', topic: params.roomId.replace(/-/g, '').slice(0, 32) }
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser revoked or expired this subscription
          if (status === 404 || status === 410) {
            await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          } else {
            console.error('Push failed:', status ?? err);
          }
        }
      })
    );
  }
}
