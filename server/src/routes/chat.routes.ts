import { Router } from 'express';
import { z } from 'zod';
import { ChatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';

const router = Router();

const directChatSchema = z.object({
  targetUserId: z.string().uuid(),
});

const groupChatSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().max(300).optional(),
  avatarUrl: z.string().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  avatarUrl: z.string().optional(),
});

const addMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1),
});

router.use(authMiddleware);

router.get('/', ChatController.getRooms);
router.post('/direct', validateBody(directChatSchema), ChatController.createDirectChat);
router.post('/group', validateBody(groupChatSchema), ChatController.createGroupChat);
router.get('/:roomId', ChatController.getRoom);
router.patch('/:roomId', validateBody(updateGroupSchema), ChatController.updateGroup);
router.post('/:roomId/members', validateBody(addMembersSchema), ChatController.addMembers);
router.delete('/:roomId/members/:userId', ChatController.removeMember);
router.post('/join/:inviteCode', ChatController.joinByInvite);

export default router;
