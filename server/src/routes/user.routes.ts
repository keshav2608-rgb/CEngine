import { Router } from 'express';
import { z } from 'zod';
import { UserController } from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  status: z.string().max(100).optional(),
  avatarUrl: z.string().optional(),
});

const reportSchema = z.object({
  reportedId: z.string().uuid(),
  reason: z.string().min(3),
  details: z.string().optional(),
});

router.use(authMiddleware);

router.get('/me', UserController.getMe);
router.patch('/profile', validateBody(updateProfileSchema), UserController.updateProfile);
router.get('/search', UserController.searchUsers);
router.post('/block/:userId', UserController.blockUser);
router.delete('/block/:userId', UserController.unblockUser);
router.get('/blocks', UserController.getBlockedUsers);
router.post('/report', validateBody(reportSchema), UserController.reportUser);

export default router;
