import { Router } from 'express';
import { z } from 'zod';
import { MessageController } from '../controllers/message.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';

const router = Router();

const sendMessageSchema = z.object({
  content: z.string().optional(),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'SYSTEM']).optional(),
  replyToId: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        fileUrl: z.string().url(),
        fileName: z.string(),
        fileSize: z.number().int().positive(),
        mimeType: z.string(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  // Shape is validated by the service (shared with the socket path)
  e2ee: z.unknown().optional(),
});

const editMessageSchema = z
  .object({
    content: z.string().min(1, 'Message content cannot be empty').optional(),
    e2ee: z.unknown().optional(),
  })
  .refine((b) => b.content !== undefined || b.e2ee !== undefined, 'Nothing to update');

const deliveredSchema = z.object({
  messageIds: z.array(z.string().uuid()),
});

const scheduledAttachment = z.object({
  // Uploaded files are served from /uploads locally or from an absolute storage URL
  fileUrl: z.string().regex(/^(\/uploads\/|https?:\/\/)/, 'Invalid file URL'),
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

const createScheduledSchema = z.object({
  roomId: z.string().uuid(),
  content: z.string().max(10000).optional(),
  attachments: z.array(scheduledAttachment).max(10).optional(),
  replyToId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime({ offset: true }),
  e2ee: z.unknown().optional(),
});

const updateScheduledSchema = z.object({
  content: z.string().max(10000).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  e2ee: z.unknown().optional(),
});

router.use(authMiddleware);

// Scheduled messages (registered before the /:messageId routes)
router.get('/scheduled', MessageController.listScheduled);
router.post('/scheduled', validateBody(createScheduledSchema), MessageController.createScheduled);
router.patch('/scheduled/:id', validateBody(updateScheduledSchema), MessageController.updateScheduled);
router.delete('/scheduled/:id', MessageController.cancelScheduled);
router.post('/scheduled/:id/send-now', MessageController.sendScheduledNow);

router.get('/search', MessageController.searchMessages);
router.get('/preview', MessageController.getLinkPreview);
router.get('/room/:roomId', MessageController.getRoomMessages);
router.post('/room/:roomId', validateBody(sendMessageSchema), MessageController.sendMessage);
router.patch('/:messageId', validateBody(editMessageSchema), MessageController.editMessage);
router.delete('/:messageId', MessageController.deleteMessage);
router.post('/delivered', validateBody(deliveredSchema), MessageController.markDelivered);
router.post('/room/:roomId/read', MessageController.markRead);

export default router;
