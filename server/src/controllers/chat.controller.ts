import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service.js';
import { presenceService } from '../services/presence.service.js';
import { AppError } from '../utils/errors.js';

export class ChatController {
  static async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rooms = await ChatService.getUserRooms(req.user!.userId);

      // Enhance with peer presence
      const roomsWithPresence = rooms.map((room) => {
        const otherMembers = room.members.filter((m) => m.userId !== req.user!.userId);
        const membersWithPresence = room.members.map((m) => ({
          ...m,
          user: {
            ...m.user,
            isOnline: presenceService.isUserOnline(m.userId),
          },
        }));

        let peerIsOnline = false;
        if (!room.isGroup && otherMembers.length > 0) {
          peerIsOnline = presenceService.isUserOnline(otherMembers[0].userId);
        }

        return {
          ...room,
          members: membersWithPresence,
          peerIsOnline,
        };
      });

      res.json({ success: true, data: roomsWithPresence });
    } catch (err) {
      next(err);
    }
  }

  static async getRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const room = await ChatService.getRoom(roomId, req.user!.userId);

      const membersWithPresence = room.members.map((m) => ({
        ...m,
        user: {
          ...m.user,
          isOnline: presenceService.isUserOnline(m.userId),
        },
      }));

      res.json({
        success: true,
        data: {
          ...room,
          members: membersWithPresence,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async createDirectChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        throw new AppError('Target user ID is required.', 400);
      }

      const room = await ChatService.getOrCreateDirectRoom(req.user!.userId, targetUserId);
      res.status(201).json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }

  static async createGroupChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, avatarUrl, memberIds } = req.body;
      const room = await ChatService.createGroup(req.user!.userId, {
        name,
        description,
        avatarUrl,
        memberIds,
      });

      res.status(201).json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }

  static async updateGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const { name, description, avatarUrl } = req.body;
      const updated = await ChatService.updateGroup(roomId, req.user!.userId, {
        name,
        description,
        avatarUrl,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async addMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const { memberIds } = req.body;
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        throw new AppError('Member IDs must be a non-empty array.', 400);
      }

      await ChatService.addMembers(roomId, req.user!.userId, memberIds);
      res.json({ success: true, message: 'Members added.' });
    } catch (err) {
      next(err);
    }
  }

  static async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const targetUserId = req.params.userId as string;
      await ChatService.removeMember(roomId, req.user!.userId, targetUserId);
      res.json({ success: true, message: 'Member removed or left group.' });
    } catch (err) {
      next(err);
    }
  }

  static async joinByInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const inviteCode = req.params.inviteCode as string;
      const room = await ChatService.joinByInviteCode(inviteCode, req.user!.userId);
      res.json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }
}
