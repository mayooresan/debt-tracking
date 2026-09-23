import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from '../db/index';
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from '../services/auth';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Verifies master password and sets signed/httpOnly session cookie.
 */
authRouter.post('/login', loginLimiter, (req: Request, res: Response): void => {
  const password = req.body?.password;

  if (!password || typeof password !== 'string' || password.trim() === '') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const isValid = verifyPassword(password);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = createSessionToken();
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    secure: isProduction,
    path: '/',
  });

  res.json({ success: true });
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
  });
  res.json({ success: true });
});

/**
 * GET /api/auth/status
 * Returns { authenticated: boolean, baseCurrency: string }.
 */
authRouter.get('/status', (req: Request, res: Response): void => {
  let token = req.cookies?.[COOKIE_NAME] || (req as any).signedCookies?.[COOKIE_NAME];

  if (!token && typeof req.headers?.cookie === 'string') {
    const cookiePairs = req.headers.cookie.split(';');
    for (const pair of cookiePairs) {
      const [key, ...vals] = pair.trim().split('=');
      if (key === COOKIE_NAME) {
        token = decodeURIComponent(vals.join('='));
        break;
      }
    }
  }

  const authenticated = Boolean(token && verifySessionToken(token));

  const db = (req.app?.locals?.db as DatabaseType) || getDb();
  let baseCurrency = 'USD';
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'base_currency'")
      .get() as { value: string } | undefined;
    if (row?.value) {
      baseCurrency = row.value.trim().toUpperCase();
    }
  } catch {
    baseCurrency = 'USD';
  }

  res.json({
    authenticated,
    baseCurrency,
    base_currency: baseCurrency,
  });
});
