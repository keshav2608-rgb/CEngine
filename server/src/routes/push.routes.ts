import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import { PushService } from '../services/push.service.js';

const router = Router();

// Only browser push services, over HTTPS. Anything else would let a user make the server send
// requests to arbitrary (e.g. internal) addresses.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

const pushEndpoint = z
  .string()
  .url()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
    } catch {
      return false;
    }
  }, 'Unsupported push service');

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: pushEndpoint,
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
  mutedRoomIds: z.array(z.string().uuid()).max(1000).optional(),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

router.use(authMiddleware);

/** VAPID public key the browser needs to subscribe (null when push is disabled). */
router.get('/key', (_req: Request, res: Response) => {
  res.json({ success: true, data: { publicKey: PushService.enabled ? PushService.publicKey : null } });
});

/** Create or update this browser's subscription (also used to sync muted rooms). */
router.post('/subscriptions', validateBody(subscribeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await PushService.subscribe(req.user!.userId, req.body.subscription, req.body.mutedRoomIds ?? []);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/subscriptions', validateBody(unsubscribeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await PushService.unsubscribe(req.user!.userId, req.body.endpoint);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
