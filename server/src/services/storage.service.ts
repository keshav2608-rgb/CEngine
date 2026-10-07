import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  // End-to-end encrypted files: the real type is inside the encrypted message
  'application/octet-stream',
]);

export class StorageService {
  private static s3Client: S3Client | null = null;

  private static getS3Client(): S3Client | null {
    if (this.s3Client) return this.s3Client;

    const { s3 } = config.storage;
    if (s3.bucket && s3.accessKeyId && s3.secretAccessKey) {
      this.s3Client = new S3Client({
        region: s3.region,
        endpoint: s3.endpoint,
        credentials: {
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
        },
      });
      return this.s3Client;
    }
    return null;
  }

  /**
   * Upload a file buffer to storage (S3/R2 or local fallback)
   */
  static async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string }> {
    // 1. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError(`Unsupported file type: ${mimeType}`, 400);
    }

    // 2. Validate File size
    const maxBytes = config.storage.maxFileSizeMb * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new AppError(`File exceeds maximum size limit of ${config.storage.maxFileSizeMb}MB.`, 400);
    }

    // 3. Generate unique filename
    const ext = path.extname(originalName) || '';
    const uniqueKey = `${crypto.randomUUID()}${ext}`;

    const s3Client = this.getS3Client();

    // S3 or Cloudflare R2 Upload
    if (s3Client && config.storage.s3.bucket) {
      const bucket = config.storage.s3.bucket;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: uniqueKey,
          Body: fileBuffer,
          ContentType: mimeType,
        })
      );

      const publicBase = config.storage.s3.publicUrl || `https://${bucket}.s3.amazonaws.com`;
      const fileUrl = `${publicBase.replace(/\/$/, '')}/${uniqueKey}`;

      return {
        fileUrl,
        fileName: originalName,
        fileSize: fileBuffer.length,
        mimeType,
      };
    }

    // Local Disk Upload Fallback
    const uploadDir = config.storage.uploadDir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, uniqueKey);
    fs.writeFileSync(filePath, fileBuffer);

    // Served via Express static route /uploads/
    const fileUrl = `/uploads/${uniqueKey}`;

    return {
      fileUrl,
      fileName: originalName,
      fileSize: fileBuffer.length,
      mimeType,
    };
  }
}
