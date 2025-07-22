import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { initializeFirebase } from './config/firebase';
import notificationRoutes from './routes/notifications';
import subscriptionRoutes from './routes/subscriptions';
import healthRoutes from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { rateLimitMiddleware } from './middleware/rateLimiter';

dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Initialize Firebase Admin
initializeFirebase();

// Middleware
app.use(helmet()); // Security headers
app.use(morgan('combined')); // Logging
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [/\.babbage\.systems$/, /\.metanet\.app$/] 
    : true,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin']
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimitMiddleware);

// Health check (no auth required)
app.use('/health', healthRoutes);

// API routes
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Metanet Notification Backend',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      health: '/health',
      register: 'POST /api/v1/subscriptions/register',
      send: 'POST /api/v1/notifications/send',
      permissions: 'GET /api/v1/subscriptions/permissions/:userKey'
    }
  });
});

// Error handling
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Metanet Notification Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔥 Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'not configured'}`);
});

export default app;
