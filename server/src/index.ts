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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

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
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

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
