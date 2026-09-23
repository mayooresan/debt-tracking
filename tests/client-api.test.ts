import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiFetch,
  ApiError,
  login,
  logout,
  checkAuth,
  fetchSummary,
  fetchDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  recordPayment,
  revertPayment,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchCurrencies,
  updateSettings,
  syncRates,
} from '../client/src/api/client';

describe('Frontend API Client (client/src/api/client.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('apiFetch base wrapper', () => {
    it('sets credentials: include and JSON headers on mutations', async () => {
      let capturedUrl = '';
      let capturedOptions: RequestInit | undefined;

      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      });

      const res = await apiFetch<{ success: boolean }>('/api/test', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      });

      expect(res).toEqual({ success: true });
      expect(capturedUrl).toBe('/api/test');
      expect(capturedOptions?.credentials).toBe('include');
      const headers = new Headers(capturedOptions?.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('throws ApiError with server error message on non-ok status', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ error: 'Invalid password' }),
        } as Response;
      });

      await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toThrow(
        'Invalid password'
      );

      try {
        await apiFetch('/api/auth/login', { method: 'POST' });
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(401);
        expect(err.data).toEqual({ error: 'Invalid password' });
      }
    });

    it('handles 204 No Content gracefully', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 204,
        } as Response;
      });

      const res = await apiFetch('/api/empty');
      expect(res).toEqual({});
    });
  });

  describe('Authentication methods', () => {
    it('login(password) calls POST /api/auth/login with password payload', async () => {
      let reqBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        reqBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      });

      const result = await login('secret123');
      expect(result).toEqual({ success: true });
      expect(reqBody).toEqual({ password: 'secret123' });
    });

    it('logout() calls POST /api/auth/logout', async () => {
      let reqMethod = '';
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        reqMethod = opts?.method || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      });

      const result = await logout();
      expect(result).toEqual({ success: true });
      expect(reqMethod).toBe('POST');
    });

    it('checkAuth() calls GET /api/auth/status and normalizes output', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, baseCurrency: 'EUR' }),
        } as Response;
      });

      const result = await checkAuth();
      expect(result).toEqual({
        authenticated: true,
        baseCurrency: 'EUR',
      });
    });
  });

  describe('Summary and Debt methods', () => {
    it('fetchSummary(month, currency) formats query parameters properly', async () => {
      let requestUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ month: '2026-09', base_currency: 'USD', total_debt: 5000 }),
        } as Response;
      });

      const summary = await fetchSummary('2026-09', 'EUR');
      expect(summary.total_debt).toBe(5000);
      expect(requestUrl).toBe('/api/summary?month=2026-09&currency=EUR');
    });

    it('fetchDebts(month, currency) formats query parameters properly', async () => {
      let requestUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, name: 'Visa Card', remaining_balance: 1000, is_paid: false },
          ],
        } as Response;
      });

      const debts = await fetchDebts('2026-09');
      expect(debts).toHaveLength(1);
      expect(debts[0].name).toBe('Visa Card');
      expect(requestUrl).toBe('/api/debts?month=2026-09');
    });

    it('createDebt(data) calls POST /api/debts', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 10, ...capturedBody }),
        } as Response;
      });

      const input = {
        category_id: 1,
        name: 'Auto Loan',
        total_amount: 15000,
        monthly_payment: 350,
      };
      const created = await createDebt(input);
      expect(created.id).toBe(10);
      expect(created.name).toBe('Auto Loan');
      expect(capturedBody).toEqual(input);
    });

    it('updateDebt(id, data) calls PUT /api/debts/:id', async () => {
      let targetUrl = '';
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
        targetUrl = url;
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 5, ...capturedBody }),
        } as Response;
      });

      const updated = await updateDebt(5, { monthly_payment: 400 });
      expect(targetUrl).toBe('/api/debts/5');
      expect(updated.monthly_payment).toBe(400);
      expect(capturedBody).toEqual({ monthly_payment: 400 });
    });

    it('deleteDebt(id) calls DELETE /api/debts/:id', async () => {
      let targetUrl = '';
      let targetMethod = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
        targetUrl = url;
        targetMethod = opts?.method || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      });

      const res = await deleteDebt(7);
      expect(targetUrl).toBe('/api/debts/7');
      expect(targetMethod).toBe('DELETE');
      expect(res.success).toBe(true);
    });
  });

  describe('Payment methods', () => {
    it('recordPayment(data) calls POST /api/payments', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            payment: { id: 101, ...capturedBody },
            debt: { id: capturedBody.debt_id, remaining_balance: 500 },
          }),
        } as Response;
      });

      const paymentInput = {
        debt_id: 2,
        amount: 250,
        currency: 'USD',
        payment_date: '2026-09-15',
        month_period: '2026-09',
      };
      const res = await recordPayment(paymentInput);
      expect(res.payment.id).toBe(101);
      expect(res.debt.remaining_balance).toBe(500);
      expect(capturedBody).toEqual(paymentInput);
    });

    it('revertPayment(paymentId) calls DELETE /api/payments/:id', async () => {
      let targetUrl = '';
      let targetMethod = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
        targetUrl = url;
        targetMethod = opts?.method || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            debt: { id: 2, remaining_balance: 750 },
          }),
        } as Response;
      });

      const res = await revertPayment(101);
      expect(targetUrl).toBe('/api/payments/101');
      expect(targetMethod).toBe('DELETE');
      expect(res.success).toBe(true);
      expect(res.debt.remaining_balance).toBe(750);
    });
  });

  describe('Category methods', () => {
    it('fetchCategories() calls GET /api/categories', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, name: 'Loans', color: '#3B82F6' },
            { id: 2, name: 'Credit Cards', color: '#EF4444' },
          ],
        } as Response;
      });

      const categories = await fetchCategories();
      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe('Loans');
    });

    it('createCategory(data) calls POST /api/categories', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 3, ...capturedBody }),
        } as Response;
      });

      const created = await createCategory({ name: 'Subscriptions', color: '#10B981' });
      expect(created.id).toBe(3);
      expect(created.name).toBe('Subscriptions');
      expect(capturedBody.name).toBe('Subscriptions');
    });

    it('updateCategory(id, data) calls PUT /api/categories/:id', async () => {
      let targetUrl = '';
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
        targetUrl = url;
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 3, ...capturedBody }),
        } as Response;
      });

      const updated = await updateCategory(3, { name: 'Fixed Subscriptions' });
      expect(targetUrl).toBe('/api/categories/3');
      expect(updated.name).toBe('Fixed Subscriptions');
      expect(capturedBody.name).toBe('Fixed Subscriptions');
    });

    it('deleteCategory(id) calls DELETE /api/categories/:id', async () => {
      let targetUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        targetUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      });

      const res = await deleteCategory(3);
      expect(targetUrl).toBe('/api/categories/3');
      expect(res.success).toBe(true);
    });
  });

  describe('Currencies and Settings methods', () => {
    it('fetchCurrencies() merges currencies, settings baseCurrency, and active rates', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/currencies') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { code: 'USD', name: 'US Dollar', symbol: '$' },
              { code: 'EUR', name: 'Euro', symbol: '€' },
            ],
          } as Response;
        }
        if (url === '/api/settings') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ base_currency: 'EUR', last_rates_sync: '2026-09-23T00:00:00Z' }),
          } as Response;
        }
        if (url === '/api/rates') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, rates: { USD: 1.0, EUR: 0.92 } }),
          } as Response;
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const res = await fetchCurrencies();
      expect(res.baseCurrency).toBe('EUR');
      expect(res.currencies).toHaveLength(2);
      expect(res.rates.EUR).toBe(0.92);
    });

    it('updateSettings(settings) calls PUT /api/settings and returns normalized object', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ base_currency: 'GBP' }),
        } as Response;
      });

      const res = await updateSettings({ base_currency: 'GBP' });
      expect(res.success).toBe(true);
      expect(res.settings.base_currency).toBe('GBP');
      expect(capturedBody).toEqual({ base_currency: 'GBP' });
    });

    it('syncRates(force) calls POST /api/rates/sync with force flag', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
        capturedBody = JSON.parse(opts?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            rates: { USD: 1.0, EUR: 0.93 },
          }),
        } as Response;
      });

      const res = await syncRates(true);
      expect(res.success).toBe(true);
      expect(res.rates.EUR).toBe(0.93);
      expect(capturedBody).toEqual({ force: true });
    });
  });
});
