import { Router } from 'express';
import { UploadController, uploadSingleMiddleware } from '../controllers/upload.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);
router.post('/', uploadSingleMiddleware, UploadController.uploadFile);

export default router;
