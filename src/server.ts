import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from './db/index';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';
import { authMiddleware } from './services/auth';

/**
 * Resolves the absolute path to the client/dist directory.
 */
export function getClientDistPath(): string {
  const cwdDist = path.resolve(process.cwd(), 'client', 'dist');
  if (fs.existsSync(cwdDist)) {
    return cwdDist;
  }
  const relDist = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(relDist)) {
    return relDist;
  }
  const upTwoDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(upTwoDist)) {
    return upTwoDist;
  }
  return cwdDist;
}

/**
 * Creates and configures the Express application.
 * Accepts an optional SQLite database instance (defaults to getDb()).
 */
export function createServer(db?: DatabaseType): Express {
  const app = express();

  // Enable trust proxy for Traefik reverse proxy compatibility
  app.set('trust proxy', 1);

  // Attach database connection to app.locals for route handlers
  app.locals.db = db || getDb();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows SPA client scripts to execute without CSP blocking
    })
  );

  // Cookie parsing middleware
  app.use(cookieParser());

  // JSON request body parser
  app.use(express.json());

  // Public authentication routes (login rate limiter, status, logout)
  app.use('/api/auth', authRouter);

  // Protected REST API routes (requires valid 'debt_session' cookie)
  app.use('/api', authMiddleware, apiRouter);

  // Catch-all 404 handler for unmatched /api/* routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Serve static client assets
  const clientDist = getClientDistPath();
  app.use(express.static(clientDist));

  // SPA fallback for non-API GET routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    const distPath = getClientDistPath();
    const indexPath = path.join(distPath, 'index.html');

    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    return res.status(404).send('Not Found');
  });

  // Global unhandled error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    const status = typeof err.status === 'number' ? err.status : 500;
    res.status(status).json({
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}
