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
});

const editMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty'),
});

const deliveredSchema = z.object({
  messageIds: z.array(z.string().uuid()),
});

router.use(authMiddleware);

router.get('/search', MessageController.searchMessages);
router.get('/preview', MessageController.getLinkPreview);
router.get('/room/:roomId', MessageController.getRoomMessages);
router.post('/room/:roomId', validateBody(sendMessageSchema), MessageController.sendMessage);
router.patch('/:messageId', validateBody(editMessageSchema), MessageController.editMessage);
router.delete('/:messageId', MessageController.deleteMessage);
router.post('/delivered', validateBody(deliveredSchema), MessageController.markDelivered);
router.post('/room/:roomId/read', MessageController.markRead);

export default router;
