import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

export const COOKIE_NAME = 'debt_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedSecret: string | null = null;

/**
 * Resets the in-memory cached session secret.
 * Useful for tests that configure different environment variables or temporary files.
 */
export function resetSessionSecret(): void {
  cachedSecret = null;
}

/**
 * Retrieves the session secret used to sign and verify session tokens.
 * Resolution priority:
 * 1. process.env.SESSION_SECRET
 * 2. In-memory cached secret
 * 3. Persisted secret file (./data/.session_secret or process.env.SESSION_SECRET_FILE)
 * 4. Freshly generated 32-byte hex secret (persisted to disk with in-memory fallback)
 */
export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim() !== '') {
    return process.env.SESSION_SECRET.trim();
  }

  if (cachedSecret) {
    return cachedSecret;
  }

  const secretFilePath =
    process.env.SESSION_SECRET_FILE || path.join(process.cwd(), 'data', '.session_secret');

  try {
    if (fs.existsSync(secretFilePath)) {
      const persisted = fs.readFileSync(secretFilePath, 'utf-8').trim();
      if (persisted) {
        cachedSecret = persisted;
        return cachedSecret;
      }
    }
  } catch {
    // Disk read failed, continue to generation
  }

  const generated = crypto.randomBytes(32).toString('hex');
  cachedSecret = generated;

  try {
    const parentDir = path.dirname(secretFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(secretFilePath, generated, 'utf-8');
  } catch {
    // Disk write failed; cachedSecret remains in memory as fallback
  }

  return cachedSecret;
}

/**
 * Verifies an incoming password against the master password configured in
 * process.env.AUTH_PASSWORD (fallback: process.env.APP_PASSWORD).
 *
 * Employs crypto.timingSafeEqual on SHA-256 hashed buffers to prevent timing attacks
 * and eliminate string-length leakage.
 */
export function verifyPassword(inputPassword: string): boolean {
  const masterPassword = process.env.AUTH_PASSWORD || process.env.APP_PASSWORD;

  if (!masterPassword || typeof inputPassword !== 'string' || inputPassword.length === 0) {
    return false;
  }

  const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
  const masterHash = crypto.createHash('sha256').update(masterPassword).digest();

  return crypto.timingSafeEqual(inputHash, masterHash);
}

/**
 * Generates a signed session token.
 * Token format: payload:timestamp:hmac_signature
 */
export function createSessionToken(secret?: string): string {
  const effectiveSecret = secret || getSessionSecret();
  const payload = 'session';
  const timestamp = Date.now().toString();
  const data = `${payload}:${timestamp}`;

  const signature = crypto
    .createHmac('sha256', effectiveSecret)
    .update(data)
    .digest('hex');

  return `${payload}:${timestamp}:${signature}`;
}

/**
 * Verifies a signed session token.
 * Validates payload structure, timestamp expiration (default 30 days), and HMAC signature.
 * Uses timingSafeEqual on SHA-256 digests of the signatures to prevent timing leaks.
 */
export function verifySessionToken(
  token: string,
  secret?: string,
  maxAgeMs: number = SESSION_MAX_AGE_MS
): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [payload, timestampStr, signature] = parts;
  if (payload !== 'session') {
    return false;
  }

  if (!/^\d+$/.test(timestampStr)) {
    return false;
  }

  const timestamp = Number(timestampStr);
  const now = Date.now();

  // Validate expiration and reject timestamps in the far future (>1 minute clock skew)
  if (now - timestamp > maxAgeMs || timestamp > now + 60_000) {
    return false;
  }

  const effectiveSecret = secret || getSessionSecret();
  const expectedSignature = crypto
    .createHmac('sha256', effectiveSecret)
    .update(`${payload}:${timestampStr}`)
    .digest('hex');

  const expectedHash = crypto.createHash('sha256').update(expectedSignature).digest();
  const actualHash = crypto.createHash('sha256').update(signature).digest();

  return crypto.timingSafeEqual(expectedHash, actualHash);
}

/**
 * Express middleware that validates the signed session cookie ('debt_session').
 * Checks req.cookies.debt_session, req.signedCookies.debt_session, and req.headers.cookie.
 * Responds with HTTP 401 { error: 'Unauthorized' } if missing or invalid.
 */
export function authMiddleware(
  req: Request | any,
  res: Response | any,
  next: NextFunction | any
): void {
  let token = req.cookies?.[COOKIE_NAME] || req.signedCookies?.[COOKIE_NAME];

  if (!token && typeof req.headers?.cookie === 'string') {
    const cookiePairs = req.headers.cookie.split(';');
    for (const pair of cookiePairs) {
      const [key, ...vals] = pair.trim().split('=');
      if (key === COOKIE_NAME) {
        const rawVal = vals.join('=');
        try {
          token = decodeURIComponent(rawVal);
        } catch {
          token = rawVal;
        }
        break;
      }
    }
  }

  if (!token || !verifySessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
