import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { initDb, closeDb } from '../src/db/index';
import { createServer } from '../src/server';
import { COOKIE_NAME, resetSessionSecret, createSessionToken } from '../src/services/auth';

describe('Express REST API & Server Integration Tests', () => {
  let db: ReturnType<typeof initDb>;
  let app: ReturnType<typeof createServer>;
  const TEST_PASSWORD = 'super-secure-master-password';
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTH_PASSWORD = TEST_PASSWORD;
    process.env.SESSION_SECRET = 'test-secret-key-for-api-tests';
    resetSessionSecret();

    db = initDb(':memory:');
    // Pre-seed exchange rates for multi-currency calculations
    db.prepare(`
      INSERT INTO exchange_rates (base_currency, target_currency, rate)
      VALUES 
        ('USD', 'USD', 1.0),
        ('USD', 'EUR', 0.85),
        ('USD', 'GBP', 0.75),
        ('USD', 'JPY', 150.0)
    `).run();

    app = createServer(db);
  });

  afterEach(() => {
    closeDb();
    process.env = { ...originalEnv };
    resetSessionSecret();
  });

  // Helper to generate a valid session cookie string without consuming login rate limit tokens
  function getAuthCookie(): string {
    const token = createSessionToken();
    return `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  }

  describe('1. Authentication Endpoints (/api/auth)', () => {
    it('POST /api/auth/login with valid password sets session cookie and returns 200', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
      expect(cookieStr).toContain(COOKIE_NAME);
      expect(cookieStr.toLowerCase()).toContain('httponly');
    });

    it('POST /api/auth/login with incorrect password returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('POST /api/auth/login with empty or missing password returns 400 or 401', async () => {
      const res1 = await request(app).post('/api/auth/login').send({});
      expect([400, 401]).toContain(res1.status);

      const res2 = await request(app).post('/api/auth/login').send({ password: '' });
      expect([400, 401]).toContain(res2.status);
    });

    it('GET /api/auth/status returns authenticated: false and baseCurrency when not logged in', async () => {
      const res = await request(app).get('/api/auth/status');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.baseCurrency).toBe('USD');
    });

    it('GET /api/auth/status returns authenticated: true when valid cookie is provided', async () => {
      const cookie = await getAuthCookie();

      const res = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.baseCurrency).toBe('USD');
    });

    it('POST /api/auth/logout clears session cookie and revokes access', async () => {
      const cookie = await getAuthCookie();

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({ success: true });

      const setCookie = logoutRes.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
      expect(cookieStr).toContain(`${COOKIE_NAME}=;`);

      // Verify that subsequent status check reports unauthenticated
      const statusRes = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookieStr);
      expect(statusRes.body.authenticated).toBe(false);
    });
  });

  describe('2. Protected Route Rejections (Auth Middleware)', () => {
    it('rejects unauthenticated GET /api/debts with 401', async () => {
      const res = await request(app).get('/api/debts');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated POST /api/debts with 401', async () => {
      const res = await request(app)
        .post('/api/debts')
        .send({ name: 'Car Loan', total_amount: 10000 });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated GET /api/categories with 401', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated POST /api/payments with 401', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({ debt_id: 1, amount: 100 });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated GET /api/summary with 401', async () => {
      const res = await request(app).get('/api/summary?month=2026-09');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated GET /api/settings with 401', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated GET /api/currencies with 401', async () => {
      const res = await request(app).get('/api/currencies');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('rejects unauthenticated POST /api/rates/sync with 401', async () => {
      const res = await request(app).post('/api/rates/sync');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('3. Categories API (/api/categories)', () => {
    let cookie: string;

    beforeEach(async () => {
      cookie = await getAuthCookie();
    });

    it('GET /api/categories returns default seeded categories with debt count', async () => {
      const res = await request(app)
        .get('/api/categories')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(4);

      const names = res.body.map((c: any) => c.name);
      expect(names).toContain('Loans');
      expect(names).toContain('Credit Cards');
      expect(names).toContain('Installments');
      expect(names).toContain('Subscriptions & Others');

      for (const cat of res.body) {
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('name');
        expect(cat).toHaveProperty('color');
        expect(cat).toHaveProperty('debt_count');
      }
    });

    it('POST /api/categories creates a new category', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Cookie', cookie)
        .send({
          name: 'Medical',
          color: '#F43F5E',
          icon: 'activity',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Medical');
      expect(res.body.color).toBe('#F43F5E');
      expect(res.body.icon).toBe('activity');
    });

    it('POST /api/categories fails with 400 when name is missing or invalid', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Cookie', cookie)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/categories/:id updates category details', async () => {
      const categories = (
        await request(app).get('/api/categories').set('Cookie', cookie)
      ).body;
      const target = categories[0];

      const res = await request(app)
        .put(`/api/categories/${target.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Personal Loans', color: '#1E40AF' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(target.id);
      expect(res.body.name).toBe('Personal Loans');
      expect(res.body.color).toBe('#1E40AF');
    });

    it('PUT /api/categories/:id returns 404 for non-existent category', async () => {
      const res = await request(app)
        .put('/api/categories/99999')
        .set('Cookie', cookie)
        .send({ name: 'Does Not Exist' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('DELETE /api/categories/:id deletes empty category', async () => {
      const createRes = await request(app)
        .post('/api/categories')
        .set('Cookie', cookie)
        .send({ name: 'To Be Deleted' });
      const id = createRes.body.id;

      const delRes = await request(app)
        .delete(`/api/categories/${id}`)
        .set('Cookie', cookie);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });

    it('DELETE /api/categories/:id returns 400 when debts are attached', async () => {
      const categories = (
        await request(app).get('/api/categories').set('Cookie', cookie)
      ).body;
      const cat = categories[0];

      // Create a debt attached to this category
      await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: cat.id,
          name: 'Category Debt Lock',
          total_amount: 1000,
          monthly_payment: 100,
        });

      const delRes = await request(app)
        .delete(`/api/categories/${cat.id}`)
        .set('Cookie', cookie);

      expect(delRes.status).toBe(400);
      expect(delRes.body.error).toMatch(/associated debts/i);
    });
  });

  describe('4. Debts API (/api/debts)', () => {
    let cookie: string;
    let categoryId: number;

    beforeEach(async () => {
      cookie = await getAuthCookie();
      const cats = (
        await request(app).get('/api/categories').set('Cookie', cookie)
      ).body;
      categoryId = cats[0].id;
    });

    it('POST /api/debts creates a new debt obligation', async () => {
      const res = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: 'Car Loan',
          total_amount: 15000,
          monthly_payment: 350,
          currency: 'USD',
          due_day: 15,
          interest_rate: 4.5,
          notes: 'Toyota Financing',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Car Loan');
      expect(res.body.remaining_balance).toBe(15000);
      expect(res.body.monthly_payment).toBe(350);
      expect(res.body.due_day).toBe(15);
      expect(res.body.interest_rate).toBe(4.5);
      expect(res.body.is_active).toBe(1);
    });

    it('POST /api/debts fails with 400 on invalid input', async () => {
      const res = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: '',
          total_amount: -500,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/debts returns debts with monthly status for given month and currency', async () => {
      await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: 'EUR Loan',
          total_amount: 1000,
          monthly_payment: 100,
          currency: 'EUR',
          due_day: 5,
        });

      const res = await request(app)
        .get('/api/debts?month=2026-09&currency=USD')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const eurDebt = res.body.find((d: any) => d.name === 'EUR Loan');
      expect(eurDebt).toBeDefined();
      expect(eurDebt.is_paid).toBe(false);
      expect(eurDebt.paid_amount).toBe(0);
      // Converted values checked (100 EUR / 0.85 = ~117.65 USD)
      expect(eurDebt.converted_monthly_payment).toBeCloseTo(117.65, 1);
    });

    it('GET /api/debts/:id returns debt details and payment history', async () => {
      const createRes = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: 'Detailed Debt',
          total_amount: 5000,
          monthly_payment: 200,
        });
      const debtId = createRes.body.id;

      // Add a payment
      await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 200,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        });

      const res = await request(app)
        .get(`/api/debts/${debtId}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(debtId);
      expect(res.body.name).toBe('Detailed Debt');
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(res.body.payments.length).toBe(1);
      expect(res.body.payments[0].amount).toBe(200);
    });

    it('GET /api/debts/:id returns 404 for non-existent debt', async () => {
      const res = await request(app)
        .get('/api/debts/99999')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/debts/:id updates debt details', async () => {
      const createRes = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: 'Updatable Debt',
          total_amount: 2000,
          monthly_payment: 100,
        });
      const debtId = createRes.body.id;

      const res = await request(app)
        .put(`/api/debts/${debtId}`)
        .set('Cookie', cookie)
        .send({
          name: 'Updated Debt Name',
          monthly_payment: 150,
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(debtId);
      expect(res.body.name).toBe('Updated Debt Name');
      expect(res.body.monthly_payment).toBe(150);
    });

    it('PUT /api/debts/:id returns 404 for non-existent debt', async () => {
      const res = await request(app)
        .put('/api/debts/99999')
        .set('Cookie', cookie)
        .send({ name: 'Unknown' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('DELETE /api/debts/:id removes debt obligation', async () => {
      const createRes = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: categoryId,
          name: 'Deletable Debt',
          total_amount: 300,
          monthly_payment: 50,
        });
      const debtId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/debts/${debtId}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const fetchRes = await request(app)
        .get(`/api/debts/${debtId}`)
        .set('Cookie', cookie);
      expect(fetchRes.status).toBe(404);
    });
  });

  describe('5. Payments API (/api/payments)', () => {
    let cookie: string;
    let debtId: number;

    beforeEach(async () => {
      cookie = await getAuthCookie();
      const cats = (
        await request(app).get('/api/categories').set('Cookie', cookie)
      ).body;

      const debtRes = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: cats[0].id,
          name: 'Payment Test Debt',
          total_amount: 1000,
          monthly_payment: 200,
          currency: 'USD',
        });
      debtId = debtRes.body.id;
    });

    it('POST /api/payments records payment and atomically decrements debt balance', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 200,
          currency: 'USD',
          payment_date: '2026-09-15',
          month_period: '2026-09',
          notes: 'September Installment',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('payment');
      expect(res.body).toHaveProperty('debt');
      expect(res.body.payment.amount).toBe(200);
      expect(res.body.payment.month_period).toBe('2026-09');
      expect(res.body.debt.remaining_balance).toBe(800);
      expect(res.body.debt.is_active).toBe(1);
    });

    it('POST /api/payments paying off balance sets is_active = 0', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 1000,
          currency: 'USD',
          payment_date: '2026-09-15',
          month_period: '2026-09',
        });

      expect(res.status).toBe(201);
      expect(res.body.debt.remaining_balance).toBe(0);
      expect(res.body.debt.is_active).toBe(0);
    });

    it('POST /api/payments fails with 400 for invalid amounts or missing fields', async () => {
      const res = await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: -50,
          payment_date: '2026-09-15',
          month_period: '2026-09',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/payments lists payments filtered by month', async () => {
      await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 150,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        });

      await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 150,
          currency: 'USD',
          payment_date: '2026-10-10',
          month_period: '2026-10',
        });

      const resSep = await request(app)
        .get('/api/payments?month=2026-09')
        .set('Cookie', cookie);

      expect(resSep.status).toBe(200);
      expect(Array.isArray(resSep.body)).toBe(true);
      expect(resSep.body.length).toBe(1);
      expect(resSep.body[0].month_period).toBe('2026-09');

      const resOct = await request(app)
        .get('/api/payments?month=2026-10')
        .set('Cookie', cookie);

      expect(resOct.status).toBe(200);
      expect(resOct.body.length).toBe(1);
      expect(resOct.body[0].month_period).toBe('2026-10');
    });

    it('DELETE /api/payments/:id reverts payment and restores balance', async () => {
      const payRes = await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: debtId,
          amount: 300,
          currency: 'USD',
          payment_date: '2026-09-15',
          month_period: '2026-09',
        });
      const paymentId = payRes.body.payment.id;
      expect(payRes.body.debt.remaining_balance).toBe(700);

      const delRes = await request(app)
        .delete(`/api/payments/${paymentId}`)
        .set('Cookie', cookie);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.debt.remaining_balance).toBe(1000);
    });

    it('DELETE /api/payments/:id returns 404 for non-existent payment', async () => {
      const res = await request(app)
        .delete('/api/payments/99999')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('6. Summary API (/api/summary)', () => {
    let cookie: string;

    beforeEach(async () => {
      cookie = await getAuthCookie();
      const cats = (
        await request(app).get('/api/categories').set('Cookie', cookie)
      ).body;

      // Create two debts
      const d1 = await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: cats[0].id,
          name: 'Summary Debt 1',
          total_amount: 1000,
          monthly_payment: 100,
          currency: 'USD',
        });

      await request(app)
        .post('/api/debts')
        .set('Cookie', cookie)
        .send({
          category_id: cats[1].id,
          name: 'Summary Debt 2',
          total_amount: 2000,
          monthly_payment: 200,
          currency: 'USD',
        });

      // Make a payment on debt 1
      await request(app)
        .post('/api/payments')
        .set('Cookie', cookie)
        .send({
          debt_id: d1.body.id,
          amount: 100,
          currency: 'USD',
          payment_date: '2026-09-05',
          month_period: '2026-09',
        });
    });

    it('GET /api/summary returns monthly summary and category breakdown', async () => {
      const res = await request(app)
        .get('/api/summary?month=2026-09&currency=USD')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.month).toBe('2026-09');
      expect(res.body.base_currency).toBe('USD');
      // Debt 1 balance = 900, Debt 2 balance = 2000 -> total_debt = 2900
      expect(res.body.total_debt).toBe(2900);
      expect(res.body.monthly_obligations).toBe(300);
      expect(res.body.paid_this_month).toBe(100);
      expect(res.body.pending_this_month).toBe(200);
      expect(res.body.percentage_paid).toBeCloseTo(33.33, 1);
      expect(Array.isArray(res.body.category_breakdown)).toBe(true);
      expect(res.body.category_breakdown.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('7. Settings & Currencies API (/api/settings, /api/currencies, /api/rates/sync)', () => {
    let cookie: string;

    beforeEach(async () => {
      cookie = await getAuthCookie();
    });

    it('GET /api/settings returns settings object with base_currency', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('base_currency');
      expect(res.body.base_currency).toBe('USD');
    });

    it('PUT /api/settings updates base_currency', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set('Cookie', cookie)
        .send({ base_currency: 'EUR' });

      expect(res.status).toBe(200);
      expect(res.body.base_currency).toBe('EUR');

      const checkRes = await request(app)
        .get('/api/settings')
        .set('Cookie', cookie);
      expect(checkRes.body.base_currency).toBe('EUR');
    });

    it('GET /api/currencies returns list of supported currencies', async () => {
      const res = await request(app)
        .get('/api/currencies')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(10);
      const codes = res.body.map((c: any) => c.code);
      expect(codes).toContain('USD');
      expect(codes).toContain('EUR');
      expect(codes).toContain('GBP');
    });

    it('POST /api/rates/sync triggers exchange rate sync', async () => {
      const res = await request(app)
        .post('/api/rates/sync')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rates');
    });
  });

  describe('8. Server Configuration & Security Middleware', () => {
    it('has trust proxy enabled for Traefik compatibility', () => {
      expect(app.get('trust proxy')).toBeTruthy();
    });

    it('includes security headers from helmet', async () => {
      const res = await request(app).get('/api/auth/status');
      expect(res.headers).toHaveProperty('x-content-type-options');
    });

    it('serves SPA fallback for non-API routes when client/dist exists', async () => {
      const clientDist = path.resolve(process.cwd(), 'client', 'dist');
      const testHtmlFile = path.join(clientDist, 'index.html');
      let createdDir = false;
      let createdFile = false;

      try {
        if (!fs.existsSync(clientDist)) {
          fs.mkdirSync(clientDist, { recursive: true });
          createdDir = true;
        }
        if (!fs.existsSync(testHtmlFile)) {
          fs.writeFileSync(testHtmlFile, '<html><body>App Root</body></html>', 'utf-8');
          createdFile = true;
        }

        const res = await request(app).get('/dashboard');
        expect(res.status).toBe(200);
        expect(res.text).toContain('App Root');
      } finally {
        if (createdFile && fs.existsSync(testHtmlFile)) {
          fs.unlinkSync(testHtmlFile);
        }
        if (createdDir && fs.existsSync(clientDist)) {
          fs.rmdirSync(clientDist);
        }
      }
    });

    it('enforces rate limiting on POST /api/auth/login after 10 attempts', async () => {
      let hitRateLimit = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ password: 'any-password' });
        if (res.status === 429) {
          hitRateLimit = true;
          expect(res.body).toHaveProperty('error');
          break;
        }
      }
      expect(hitRateLimit).toBe(true);
    });
  });
});

