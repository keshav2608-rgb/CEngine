import dotenv from 'dotenv';
import path from 'path';

// Load .env from server root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // JWT Configuration
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production-cengine-jwt-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production-cengine-refresh-key',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Storage / Uploads
  storage: {
    provider: (process.env.STORAGE_PROVIDER as 'local' | 's3') || 'local',
    uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10),
    // S3 / Cloudflare R2 settings
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      publicUrl: process.env.S3_PUBLIC_URL || '',
    },
  },

  // Web Push (VAPID). Push notifications are disabled when these aren't set.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@cengine.local',
  },

  // Redis configuration for scaling presence & pub/sub
  redisUrl: process.env.REDIS_URL,

  // Rate Limiting
  // How long after sending a message its author may still edit it
  messageEditWindowMinutes: parseInt(process.env.MESSAGE_EDIT_WINDOW_MINUTES || '30', 10),

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  },
};

// Production must never run with local settings. Production values come from the host's
// dashboard (Render), local ones from server/.env, and they must point at different databases.
if (config.nodeEnv === 'production') {
  if (!config.databaseUrl || /localhost|127\.0\.0\.1/.test(config.databaseUrl)) {
    throw new Error('DATABASE_URL must point at the production database in production.');
  }
  if (!config.clientUrl.startsWith('https://')) {
    throw new Error('CLIENT_URL must be the deployed https:// frontend URL in production.');
  }
}

// Never run production with the development JWT secrets: anyone could forge tokens.
if (config.nodeEnv === 'production') {
  const weak = (v: string) => !v || v.startsWith('dev-') || v.length < 32;
  if (weak(config.jwt.accessSecret) || weak(config.jwt.refreshSecret)) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set to long random values in production.'
    );
  }
}

// Hosts like Render have an ephemeral disk: uploads saved locally vanish on every restart.
// If S3/R2 storage was requested, refuse to start without its credentials rather than silently
// falling back to local disk.
if (config.storage.provider === 's3') {
  const { s3 } = config.storage;
  if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey || !s3.endpoint || !s3.publicUrl) {
    throw new Error(
      'STORAGE_PROVIDER is "s3" but S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_URL are not all set.'
    );
  }
}
