import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { checkDatabaseConnection } from './db/prisma.js';
import { initSocketServer } from './sockets/socket.server.js';
import { apiLimiter } from './middlewares/rate-limiter.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import apiRouter from './routes/index.js';
import { ScheduledMessageService } from './services/scheduled-message.service.js';
import { setIO } from './sockets/io-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

// Behind a hosting proxy (Render, Railway, ...) trust X-Forwarded-For so rate limits apply per client IP
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// 1. Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow loading uploaded images cross-origin
  })
);

// 2. CORS
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// 3. Parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// 4. Serve local static uploads if stored locally
// Uploaded files are untrusted: never let them run script on this origin (e.g. an SVG or HTML
// file opened directly), never let browsers sniff them into something executable.
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.resolve(process.cwd(), 'uploads'), { dotfiles: 'deny', index: false })
);

// 5. Rate Limiting on API
app.use('/api', apiLimiter);

// 6. Routes
app.use('/api', apiRouter);

// Root route
app.get('/', (_req, res) => {
  res.json({
    name: 'CEngine Real-Time Messaging API',
    version: '1.0.0',
    status: 'online',
    docs: '/api/health',
  });
});

// 7. Global Error Handler
app.use(errorHandler);

// 8. Initialize Socket.IO Server
const io = initSocketServer(httpServer);
setIO(io);
ScheduledMessageService.start(io);

// 9. Start Server
async function startServer() {
  await checkDatabaseConnection();

  httpServer.listen(config.port, () => {
    console.log(`🚀 CEngine Server running on port ${config.port} [${config.nodeEnv}]`);
    console.log(`📡 Socket.IO initialized`);
    console.log(`🌐 Allowed Client Origin: ${config.clientUrl}`);
  });
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

startServer();

export { app, httpServer, io };
