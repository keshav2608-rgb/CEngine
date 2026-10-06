import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { StorageService } from '../services/storage.service.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config/index.js';

// Multer memory storage configuration with file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.storage.maxFileSizeMb * 1024 * 1024,
  },
});

export const uploadSingleMiddleware = upload.single('file');

export class UploadController {
  static async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded.', 400);
      }

      const result = await StorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
