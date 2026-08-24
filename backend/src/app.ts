import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import projectsRoutes from './routes/projects.routes';
import tasksRoutes from './routes/tasks.routes';
import annotationsRoutes from './routes/annotations.routes';
import internalRoutes from './routes/internal.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  if (!env.isTest) {
    app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ping', (_req, res) => res.type('text/plain').send('pong'));

  app.use('/api/auth', apiRateLimiter, authRoutes);
  app.use('/api/users', apiRateLimiter, usersRoutes);
  app.use('/api/projects', apiRateLimiter, projectsRoutes);
  app.use('/api/tasks', apiRateLimiter, tasksRoutes);
  app.use('/api/annotations', apiRateLimiter, annotationsRoutes);

  // Called only by the Python ML service, never a browser client.
  app.use('/api/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
