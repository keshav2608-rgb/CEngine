import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { presenceService } from '../services/presence.service.js';
import { MessageService } from '../services/message.service.js';
import { prisma } from '../db/prisma.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Authentication Middleware for Socket.IO
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization
          ? socket.handshake.headers.authorization.split(' ')[1]
          : null);

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, config.jwt.accessSecret) as {
        userId: string;
        email: string;
      };

      socket.userId = decoded.userId;
      socket.email = decoded.email;
      next();
    } catch {
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  // Listen to presence events emitted by PresenceService
  presenceService.on('presence_change', (event) => {
    // Broadcast status change to all connected clients
    io.emit('presence:change', {
      userId: event.userId,
      isOnline: event.isOnline,
      lastSeenAt: event.lastSeenAt,
    });
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    // 1. Join user to their personal room (for targeted notifications / updates)
    socket.join(`user:${userId}`);

    // 2. Track connection in presence service
    await presenceService.userConnected(userId, socket.id);

    // 3. Automatically join user to all their chat rooms
    try {
      const memberships = await prisma.roomMember.findMany({
        where: { userId },
        select: { roomId: true },
      });
      memberships.forEach((m) => {
        socket.join(`room:${m.roomId}`);
      });
    } catch (err) {
      console.error(`Error loading rooms for socket ${socket.id}:`, err);
    }

    // Explicit room join (e.g. after newly joining a group)
    socket.on('room:join', (roomId: string) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('room:leave', (roomId: string) => {
      socket.leave(`room:${roomId}`);
    });

    // 4. Send Message via Socket
    socket.on(
      'message:send',
      async (
        data: {
          roomId: string;
          content?: string;
          messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
          replyToId?: string;
          attachments?: any[];
          metadata?: Record<string, unknown>;
        },
        callback?: (res: { success: boolean; data?: any; error?: string }) => void
      ) => {
        try {
          const message = await MessageService.sendMessage(userId, data.roomId, {
            content: data.content,
            messageType: data.messageType,
            replyToId: data.replyToId,
            attachments: data.attachments,
            metadata: data.metadata,
          });

          // Broadcast message to everyone in the room (including sender)
          io.to(`room:${data.roomId}`).emit('message:new', message);

          if (callback) {
            callback({ success: true, data: message });
          }
        } catch (err: any) {
          if (callback) {
            callback({ success: false, error: err.message || 'Failed to send message' });
          }
        }
      }
    );

    // 5. Message Delivered Event
    socket.on('message:delivered', async (data: { roomId: string; messageIds: string[] }) => {
      try {
        if (data.messageIds && data.messageIds.length > 0) {
          await MessageService.markDelivered(userId, data.messageIds);
          io.to(`room:${data.roomId}`).emit('message:delivered', {
            roomId: data.roomId,
            userId,
            messageIds: data.messageIds,
          });
        }
      } catch (err) {
        console.error('Error handling message:delivered:', err);
      }
    });

    // 6. Message Read Event
    socket.on('message:read', async (data: { roomId: string }) => {
      try {
        await MessageService.markRoomAsRead(userId, data.roomId);
        io.to(`room:${data.roomId}`).emit('message:read', {
          roomId: data.roomId,
          userId,
        });
      } catch (err) {
        console.error('Error handling message:read:', err);
      }
    });

    // 7. Message Edit Event
    socket.on('message:edit', async (data: { messageId: string; roomId: string; content: string }, callback) => {
      try {
        const updated = await MessageService.editMessage(data.messageId, userId, data.content);
        io.to(`room:${data.roomId}`).emit('message:updated', updated);
        if (callback) callback({ success: true, data: updated });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 8. Message Delete Event
    socket.on('message:delete', async (data: { messageId: string; roomId: string }, callback) => {
      try {
        const deleted = await MessageService.deleteMessage(data.messageId, userId);
        io.to(`room:${data.roomId}`).emit('message:deleted', {
          messageId: data.messageId,
          roomId: data.roomId,
          deletedMessage: deleted,
        });
        if (callback) callback({ success: true });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 9. Typing Indicators
    socket.on('typing:start', (data: { roomId: string; displayName?: string }) => {
      socket.to(`room:${data.roomId}`).emit('typing:status', {
        roomId: data.roomId,
        userId,
        displayName: data.displayName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data: { roomId: string }) => {
      socket.to(`room:${data.roomId}`).emit('typing:status', {
        roomId: data.roomId,
        userId,
        isTyping: false,
      });
    });

    // 10. Presence Query
    socket.on('presence:query', (userIds: string[], callback) => {
      if (typeof callback === 'function' && Array.isArray(userIds)) {
        const presence = presenceService.getPresenceMap(userIds);
        callback(presence);
      }
    });

    // 11. Disconnect Cleanup
    socket.on('disconnect', async () => {
      await presenceService.userDisconnected(userId, socket.id);
    });
  });

  return io;
}
