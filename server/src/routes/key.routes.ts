import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import { KeyService } from '../services/key.service.js';

const router = Router();

const registerSchema = z.object({
  publicKey: z.string().min(80).max(200),
  name: z.string().max(80).optional(),
});

router.use(authMiddleware);

/** Register this browser's public key. */
router.post('/devices', validateBody(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await KeyService.registerDevice(req.user!.userId, req.body.publicKey, req.body.name ?? '');
    res.status(201).json({ success: true, data: device });
  } catch (err) {
    next(err);
  }
});

router.get('/devices/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await KeyService.listOwnDevices(req.user!.userId) });
  } catch (err) {
    next(err);
  }
});

/** Public keys for ?userIds=a,b,c (only people you share a room with). */
router.get('/devices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = String(req.query.userIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json({ success: true, data: await KeyService.getDevicesForUsers(req.user!.userId, ids) });
  } catch (err) {
    next(err);
  }
});

/** Mark this device as active (keeps "last seen" accurate in the devices list). */
router.post('/devices/:id/seen', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await KeyService.touchDevice(req.user!.userId, req.params.id as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/devices/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await KeyService.removeDevice(req.user!.userId, req.params.id as string);
    res.json({ success: true, message: 'Device removed.' });
  } catch (err) {
    next(err);
  }
});

export default router;
