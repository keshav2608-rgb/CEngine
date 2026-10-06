import { EventEmitter } from 'events';
import { prisma } from '../db/prisma.js';

export interface PresenceEvent {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date;
}

export class PresenceService extends EventEmitter {
  private static instance: PresenceService;

  // In-memory store: userId -> Set of active socket IDs
  private userSockets: Map<string, Set<string>> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  /**
   * Handle socket connection for a user
   */
  async userConnected(userId: string, socketId: string): Promise<boolean> {
    const existingSockets = this.userSockets.get(userId) || new Set();
    const wasOffline = existingSockets.size === 0;

    existingSockets.add(socketId);
    this.userSockets.set(userId, existingSockets);

    if (wasOffline) {
      const now = new Date();
      // Update last seen in DB asynchronously
      prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: now },
      }).catch((err) => console.error('Error updating lastSeenAt:', err));

      this.emit('presence_change', {
        userId,
        isOnline: true,
        lastSeenAt: now,
      } as PresenceEvent);

      return true; // Status changed to online
    }

    return false;
  }

  /**
   * Handle socket disconnect for a user
   */
  async userDisconnected(userId: string, socketId: string): Promise<boolean> {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      const now = new Date();

      prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: now },
      }).catch((err) => console.error('Error updating lastSeenAt:', err));

      this.emit('presence_change', {
        userId,
        isOnline: false,
        lastSeenAt: now,
      } as PresenceEvent);

      return true; // Status changed to offline
    }

    return false;
  }

  /**
   * Check if a specific user is currently online
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Get online status for a list of user IDs
   */
  getPresenceMap(userIds: string[]): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const id of userIds) {
      result[id] = this.isUserOnline(id);
    }
    return result;
  }

  /**
   * Get all active socket IDs for a given user
   */
  getUserSockets(userId: string): string[] {
    const sockets = this.userSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }
}

export const presenceService = PresenceService.getInstance();
