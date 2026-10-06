import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { presenceService } from '../services/presence.service.js';

export class UserController {
  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await UserService.getProfile(req.user!.userId);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { displayName, status, avatarUrl } = req.body;
      const updated = await UserService.updateProfile(req.user!.userId, {
        displayName,
        status,
        avatarUrl,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query.q as string) || '';
      const users = await UserService.searchUsers(query, req.user!.userId);

      // Attach online presence
      const userIds = users.map((u) => u.id);
      const presence = presenceService.getPresenceMap(userIds);

      const usersWithPresence = users.map((u) => ({
        ...u,
        isOnline: presence[u.id] || false,
      }));

      res.json({ success: true, data: usersWithPresence });
    } catch (err) {
      next(err);
    }
  }

  static async blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.params.userId as string;
      const block = await UserService.blockUser(req.user!.userId, targetUserId);
      res.json({ success: true, message: 'User blocked.', data: block });
    } catch (err) {
      next(err);
    }
  }

  static async unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.params.userId as string;
      await UserService.unblockUser(req.user!.userId, targetUserId);
      res.json({ success: true, message: 'User unblocked.' });
    } catch (err) {
      next(err);
    }
  }

  static async getBlockedUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const blocked = await UserService.getBlockedUsers(req.user!.userId);
      res.json({ success: true, data: blocked });
    } catch (err) {
      next(err);
    }
  }

  static async reportUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportedId, reason, details } = req.body;
      const report = await UserService.reportUser(
        req.user!.userId,
        reportedId,
        reason,
        details
      );
      res.status(201).json({
        success: true,
        message: 'Report submitted for moderation.',
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }
}
