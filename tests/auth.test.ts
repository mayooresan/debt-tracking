import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  verifyPassword,
  getSessionSecret,
  resetSessionSecret,
  createSessionToken,
  verifySessionToken,
  authMiddleware,
  COOKIE_NAME,
} from '../src/services/auth';

describe('Authentication & Security Service', () => {
  const originalEnv = { ...process.env };
  const testSecretDir = path.join(__dirname, '..', '.tmp-auth-test');
  const testSecretFile = path.join(testSecretDir, '.session_secret');

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTH_PASSWORD;
    delete process.env.APP_PASSWORD;
    delete process.env.SESSION_SECRET;
    process.env.SESSION_SECRET_FILE = testSecretFile;
    resetSessionSecret();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetSessionSecret();
    if (fs.existsSync(testSecretDir)) {
      fs.rmSync(testSecretDir, { recursive: true, force: true });
    }
  });

  describe('verifyPassword', () => {
    it('returns true for matching password when AUTH_PASSWORD is set', () => {
      process.env.AUTH_PASSWORD = 'super-secret-password-123';
      expect(verifyPassword('super-secret-password-123')).toBe(true);
    });

    it('returns false for incorrect password when AUTH_PASSWORD is set', () => {
      process.env.AUTH_PASSWORD = 'super-secret-password-123';
      expect(verifyPassword('wrong-password')).toBe(false);
      expect(verifyPassword('super-secret-password-12')).toBe(false);
      expect(verifyPassword('super-secret-password-1234')).toBe(false);
    });

    it('falls back to APP_PASSWORD if AUTH_PASSWORD is not set', () => {
      delete process.env.AUTH_PASSWORD;
      process.env.APP_PASSWORD = 'fallback-app-password';

      expect(verifyPassword('fallback-app-password')).toBe(true);
      expect(verifyPassword('wrong-password')).toBe(false);
    });

    it('prefers AUTH_PASSWORD over APP_PASSWORD when both are set', () => {
      process.env.AUTH_PASSWORD = 'primary-password';
      process.env.APP_PASSWORD = 'secondary-password';

      expect(verifyPassword('primary-password')).toBe(true);
      expect(verifyPassword('secondary-password')).toBe(false);
    });

    it('returns false when neither AUTH_PASSWORD nor APP_PASSWORD is set', () => {
      delete process.env.AUTH_PASSWORD;
      delete process.env.APP_PASSWORD;

      expect(verifyPassword('any-password')).toBe(false);
      expect(verifyPassword('')).toBe(false);
    });

    it('returns false for empty or non-string inputs', () => {
      process.env.AUTH_PASSWORD = 'secure-password';

      expect(verifyPassword('')).toBe(false);
      expect(verifyPassword(null as any)).toBe(false);
      expect(verifyPassword(undefined as any)).toBe(false);
      expect(verifyPassword(12345 as any)).toBe(false);
    });

    it('is timing-safe and handles arbitrary length differences without throwing', () => {
      process.env.AUTH_PASSWORD = 'a'.repeat(100);

      expect(() => {
        expect(verifyPassword('b')).toBe(false);
        expect(verifyPassword('a'.repeat(50))).toBe(false);
        expect(verifyPassword('a'.repeat(200))).toBe(false);
        expect(verifyPassword('a'.repeat(100))).toBe(true);
      }).not.toThrow();
    });
  });

  describe('getSessionSecret', () => {
    it('returns SESSION_SECRET from environment if present', () => {
      process.env.SESSION_SECRET = 'explicit-session-secret-key-456';
      expect(getSessionSecret()).toBe('explicit-session-secret-key-456');
    });

    it('generates a 32-byte hex secret and persists it to file if SESSION_SECRET is not set', () => {
      delete process.env.SESSION_SECRET;

      expect(fs.existsSync(testSecretFile)).toBe(false);

      const secret = getSessionSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      // 32 bytes in hex = 64 characters
      expect(secret).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/i.test(secret)).toBe(true);

      // File should now exist on disk
      expect(fs.existsSync(testSecretFile)).toBe(true);
      const fileContent = fs.readFileSync(testSecretFile, 'utf-8').trim();
      expect(fileContent).toBe(secret);
    });

    it('reuses existing persisted secret on subsequent calls and instances', () => {
      delete process.env.SESSION_SECRET;

      const firstSecret = getSessionSecret();

      // Reset in-memory cache to force reading from file
      resetSessionSecret();

      const secondSecret = getSessionSecret();
      expect(secondSecret).toBe(firstSecret);
    });

    it('falls back to in-memory secret if file write fails', () => {
      delete process.env.SESSION_SECRET;

      // Mock fs.writeFileSync to throw an error
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const secret = getSessionSecret();
      expect(secret).toBeDefined();
      expect(secret).toHaveLength(64);

      // Subsequent call should still return the cached in-memory secret
      expect(getSessionSecret()).toBe(secret);

      writeSpy.mockRestore();
    });
  });

  describe('createSessionToken & verifySessionToken', () => {
    it('creates a signed session token that verifies successfully with the same secret', () => {
      const secret = 'test-secret-key-789';
      const token = createSessionToken(secret);

      expect(typeof token).toBe('string');
      expect(token.split(':')).toHaveLength(3);

      expect(verifySessionToken(token, secret)).toBe(true);
    });

    it('uses getSessionSecret() by default when secret is not passed', () => {
      process.env.SESSION_SECRET = 'env-session-secret';

      const token = createSessionToken();
      expect(verifySessionToken(token)).toBe(true);
    });

    it('fails verification if token was signed with a different secret', () => {
      const token = createSessionToken('secret-one');
      expect(verifySessionToken(token, 'secret-two')).toBe(false);
    });

    it('fails verification if token payload or timestamp is tampered with', () => {
      const secret = 'tamper-secret';
      const token = createSessionToken(secret);
      const [payload, timestamp, signature] = token.split(':');

      // Tamper payload
      const tamperedPayload = `attacker:${timestamp}:${signature}`;
      expect(verifySessionToken(tamperedPayload, secret)).toBe(false);

      // Tamper timestamp
      const tamperedTimestamp = `${payload}:${Number(timestamp) + 1000}:${signature}`;
      expect(verifySessionToken(tamperedTimestamp, secret)).toBe(false);
    });

    it('fails verification if signature is tampered with', () => {
      const secret = 'signature-secret';
      const token = createSessionToken(secret);
      const [payload, timestamp, signature] = token.split(':');

      const corruptedSignature = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
      const tamperedSignature = `${payload}:${timestamp}:${corruptedSignature}`;
      expect(verifySessionToken(tamperedSignature, secret)).toBe(false);
    });

    it('fails verification for expired tokens', () => {
      const secret = 'expiry-secret';
      const token = createSessionToken(secret);

      // Verify with maxAgeMs = -1 (already expired)
      expect(verifySessionToken(token, secret, -1)).toBe(false);

      // Verify with maxAgeMs = 1 hour (valid)
      expect(verifySessionToken(token, secret, 3600 * 1000)).toBe(true);
    });

    it('fails verification for malformed tokens', () => {
      const secret = 'format-secret';

      expect(verifySessionToken('', secret)).toBe(false);
      expect(verifySessionToken('random-string', secret)).toBe(false);
      expect(verifySessionToken('session:notanumber:sig', secret)).toBe(false);
      expect(verifySessionToken('session:12345', secret)).toBe(false);
      expect(verifySessionToken('session:12345:sig:extra', secret)).toBe(false);
      expect(verifySessionToken(null as any, secret)).toBe(false);
      expect(verifySessionToken(undefined as any, secret)).toBe(false);
    });
  });

  describe('authMiddleware', () => {
    it('calls next() when valid cookie is present in req.cookies', () => {
      process.env.SESSION_SECRET = 'middleware-secret';
      const token = createSessionToken();

      const req: any = {
        cookies: {
          [COOKIE_NAME]: token,
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('calls next() when valid cookie is present in req.signedCookies', () => {
      process.env.SESSION_SECRET = 'middleware-secret';
      const token = createSessionToken();

      const req: any = {
        signedCookies: {
          [COOKIE_NAME]: token,
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when valid cookie is found in raw req.headers.cookie', () => {
      process.env.SESSION_SECRET = 'middleware-secret';
      const token = createSessionToken();

      const req: any = {
        headers: {
          cookie: `other_cookie=123; ${COOKIE_NAME}=${token}; yet_another=abc`,
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('responds with 401 { error: "Unauthorized" } when session cookie is missing', () => {
      const req: any = { cookies: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('responds with 401 { error: "Unauthorized" } when session cookie is invalid or tampered', () => {
      process.env.SESSION_SECRET = 'middleware-secret';
      const token = createSessionToken();

      const req: any = {
        cookies: {
          [COOKIE_NAME]: token + '-tampered',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('responds with 401 { error: "Unauthorized" } when req has no cookies or headers', () => {
      const req: any = {};
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('handles malformed percent-encoded cookies (e.g. debt_session=%E0%A4%A) gracefully without throwing', () => {
      const req: any = {
        headers: {
          cookie: `${COOKIE_NAME}=%E0%A4%A`,
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      expect(() => {
        authMiddleware(req, res, next);
      }).not.toThrow();

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
