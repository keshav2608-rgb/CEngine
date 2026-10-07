import { Request, Response, NextFunction } from 'express';
import { MessageService } from '../services/message.service.js';
import { LinkPreviewService } from '../services/link-preview.service.js';
import { ScheduledMessageService } from '../services/scheduled-message.service.js';
import { AppError } from '../utils/errors.js';

export class MessageController {
  static async getRoomMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;

      const result = await MessageService.getRoomMessages(roomId, req.user!.userId, {
        cursor,
        limit,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const { content, replyToId, attachments, metadata, e2ee } = req.body;

      const message = await MessageService.sendMessage(req.user!.userId, roomId, {
        content,
        replyToId,
        attachments,
        metadata,
        e2ee,
      });

      const { isDuplicate: _duplicate, ...stored } = message;
      res.status(201).json({ success: true, data: stored });
    } catch (err) {
      next(err);
    }
  }

  static async editMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const messageId = req.params.messageId as string;
      const { content, e2ee } = req.body;

      const updated = await MessageService.editMessage(messageId, req.user!.userId, {
        content,
        e2ee,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const messageId = req.params.messageId as string;
      const deleted = await MessageService.deleteMessage(messageId, req.user!.userId);
      res.json({ success: true, data: deleted });
    } catch (err) {
      next(err);
    }
  }

  static async markDelivered(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { messageIds } = req.body;
      if (!Array.isArray(messageIds)) {
        throw new AppError('messageIds must be an array.', 400);
      }

      await MessageService.markDelivered(req.user!.userId, messageIds);
      res.json({ success: true, message: 'Receipts updated to DELIVERED.' });
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      await MessageService.markRoomAsRead(req.user!.userId, roomId);
      res.json({ success: true, message: 'All messages in room marked as READ.' });
    } catch (err) {
      next(err);
    }
  }

  static async searchMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query.q as string) || '';
      const messages = await MessageService.searchMessages(req.user!.userId, query);
      res.json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  }

  static async getLinkPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = req.query.url as string;
      if (!url) {
        throw new AppError('URL query parameter required.', 400);
      }

      const preview = await LinkPreviewService.getPreview(url);
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  }

  static async listScheduled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.query.roomId as string | undefined;
      const scheduled = await ScheduledMessageService.list(req.user!.userId, roomId);
      res.json({ success: true, data: scheduled });
    } catch (err) {
      next(err);
    }
  }

  static async createScheduled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId, content, attachments, replyToId, scheduledFor, e2ee } = req.body;
      const scheduled = await ScheduledMessageService.create(req.user!.userId, roomId, {
        content,
        attachments,
        replyToId,
        scheduledFor,
        e2ee,
      });
      res.status(201).json({ success: true, data: scheduled });
    } catch (err) {
      next(err);
    }
  }

  static async updateScheduled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { content, scheduledFor, e2ee } = req.body;
      const scheduled = await ScheduledMessageService.update(
        req.user!.userId,
        req.params.id as string,
        { content, scheduledFor, e2ee }
      );
      res.json({ success: true, data: scheduled });
    } catch (err) {
      next(err);
    }
  }

  static async cancelScheduled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await ScheduledMessageService.cancel(req.user!.userId, req.params.id as string);
      res.json({ success: true, message: 'Scheduled message cancelled.' });
    } catch (err) {
      next(err);
    }
  }

  static async sendScheduledNow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await ScheduledMessageService.sendNow(req.user!.userId, req.params.id as string);
      res.json({ success: true, message: 'Scheduled message sent.' });
    } catch (err) {
      next(err);
    }
  }
}
