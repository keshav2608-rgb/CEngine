import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import chatRoutes from './chat.routes.js';
import messageRoutes from './message.routes.js';
import uploadRoutes from './upload.routes.js';
import keyRoutes from './key.routes.js';
import pushRoutes from './push.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/chats', chatRoutes);
router.use('/messages', messageRoutes);
router.use('/upload', uploadRoutes);
router.use('/keys', keyRoutes);
router.use('/push', pushRoutes);

export default router;
