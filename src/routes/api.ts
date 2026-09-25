import { Router, Request, Response } from 'express';
import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from '../db/index';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  listDebtsWithMonthlyStatus,
  getDebtById,
  createDebt,
  updateDebt,
  deleteDebt,
  recordPayment,
  revertPayment,
  getPaymentsByDebtId,
  getPaymentsByMonth,
  getMonthlySummary,
} from '../services/debt';
import {
  SUPPORTED_CURRENCIES,
  getExchangeRates,
  syncExchangeRates,
} from '../services/currency';

export const apiRouter = Router();

function getDatabase(req: Request): DatabaseType {
  return (req.app?.locals?.db as DatabaseType) || getDb();
}

// ==========================================
// 1. Categories
// ==========================================

/**
 * GET /api/categories
 * Returns list of categories with associated debt counts.
 */
apiRouter.get('/categories', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  try {
    const rows = db.prepare(`
      SELECT 
        c.*,
        COUNT(d.id) AS debt_count
      FROM categories c
      LEFT JOIN debts d ON c.id = d.category_id
      GROUP BY c.id
      ORDER BY c.id ASC
    `).all() as any[];

    const categories = rows.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      created_at: c.created_at,
      debt_count: Number(c.debt_count || 0),
      debtCount: Number(c.debt_count || 0),
    }));

    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list categories' });
  }
});

/**
 * POST /api/categories
 * Creates a new category.
 */
apiRouter.post('/categories', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const name = req.body?.name;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  try {
    const category = createCategory(db, req.body);
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create category' });
  }
});

/**
 * PUT /api/categories/:id
 * Updates an existing category.
 */
apiRouter.put('/categories/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return;
  }

  try {
    const category = updateCategory(db, id, req.body);
    res.json(category);
  } catch (err: any) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message || 'Failed to update category' });
    }
  }
});

/**
 * DELETE /api/categories/:id
 * Deletes a category if no debts are attached.
 */
apiRouter.delete('/categories/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return;
  }

  try {
    const success = deleteCategory(db, id);
    if (!success) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete category' });
  }
});

// ==========================================
// 2. Debts
// ==========================================

/**
 * GET /api/debts?month=YYYY-MM&currency=XXX
 * Returns list of debts with monthly payment status.
 */
apiRouter.get('/debts', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const currency = req.query.currency as string | undefined;

  try {
    const debts = listDebtsWithMonthlyStatus(db, month, currency);
    res.json(debts);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list debts' });
  }
});

/**
 * POST /api/debts
 * Creates a new debt obligation (supports standard and pawning debt types).
 */
apiRouter.post('/debts', (req: Request, res: Response): void => {
  const db = getDatabase(req);

  try {
    const debt = createDebt(db, req.body);
    res.status(201).json(debt);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create debt' });
  }
});

/**
 * GET /api/debts/:id
 * Returns debt details along with payment history.
 */
apiRouter.get('/debts/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid debt ID' });
    return;
  }

  try {
    const debt = getDebtById(db, id);
    if (!debt) {
      res.status(404).json({ error: 'Debt not found' });
      return;
    }

    const payments = getPaymentsByDebtId(db, id);
    res.json({
      ...debt,
      payments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve debt' });
  }
});

/**
 * PUT /api/debts/:id
 * Updates debt details (base amount, monthly payment, debt type, or is_active).
 */
apiRouter.put('/debts/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid debt ID' });
    return;
  }

  try {
    const debt = updateDebt(db, id, req.body);
    res.json(debt);
  } catch (err: any) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message || 'Failed to update debt' });
    }
  }
});

/**
 * DELETE /api/debts/:id
 * Deletes a debt obligation.
 */
apiRouter.delete('/debts/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid debt ID' });
    return;
  }

  try {
    const success = deleteDebt(db, id);
    if (!success) {
      res.status(404).json({ error: 'Debt not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete debt' });
  }
});

// ==========================================
// 3. Payments
// ==========================================

/**
 * GET /api/payments?month=YYYY-MM
 * Lists payments filtered by month or debt_id.
 */
apiRouter.get('/payments', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const month = req.query.month as string | undefined;
  const debtId = req.query.debt_id ? Number(req.query.debt_id) : undefined;

  try {
    if (month) {
      const payments = getPaymentsByMonth(db, month);
      res.json(payments);
    } else if (debtId) {
      const payments = getPaymentsByDebtId(db, debtId);
      res.json(payments);
    } else {
      const payments = db
        .prepare('SELECT * FROM payments ORDER BY payment_date DESC, id DESC')
        .all();
      res.json(payments);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve payments' });
  }
});

/**
 * POST /api/payments
 * Records a payment against a debt and updates debt balance atomically.
 */
apiRouter.post('/payments', (req: Request, res: Response): void => {
  const db = getDatabase(req);

  try {
    const result = recordPayment(db, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message || 'Failed to record payment' });
    }
  }
});

/**
 * DELETE /api/payments/:id
 * Reverts a payment and restores the balance atomically.
 */
apiRouter.delete('/payments/:id', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid payment ID' });
    return;
  }

  try {
    const result = revertPayment(db, id);
    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message || 'Failed to revert payment' });
    }
  }
});

// ==========================================
// 4. Summary
// ==========================================

/**
 * GET /api/summary?month=YYYY-MM&currency=XXX
 * Returns aggregated monthly summary and category breakdown.
 */
apiRouter.get('/summary', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const currency = req.query.currency as string | undefined;

  try {
    const summary = getMonthlySummary(db, month, currency);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute monthly summary' });
  }
});

// ==========================================
// 5. Settings & Currencies
// ==========================================

/**
 * GET /api/settings
 * Returns application settings (base currency, last rates sync).
 */
apiRouter.get('/settings', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  try {
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
      key: string;
      value: string;
    }[];

    const settings: Record<string, string> = {
      base_currency: 'USD',
      last_rates_sync: '1970-01-01T00:00:00.000Z',
    };

    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve settings' });
  }
});

/**
 * PUT /api/settings
 * Updates application settings (e.g. base currency).
 */
apiRouter.put('/settings', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  const newBase = req.body?.base_currency || req.body?.baseCurrency;

  if (!newBase || typeof newBase !== 'string' || newBase.trim().length !== 3) {
    res.status(400).json({ error: 'Valid 3-letter currency code is required' });
    return;
  }

  const formatted = newBase.trim().toUpperCase();

  try {
    db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value)
      VALUES ('base_currency', ?)
    `).run(formatted);

    const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
      key: string;
      value: string;
    }[];

    const settings: Record<string, string> = {
      base_currency: formatted,
    };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    settings.base_currency = formatted;

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

/**
 * GET /api/currencies
 * Returns the list of supported currencies.
 */
apiRouter.get('/currencies', (_req: Request, res: Response): void => {
  res.json(SUPPORTED_CURRENCIES);
});

/**
 * GET /api/rates
 * Returns the current exchange rates.
 */
apiRouter.get('/rates', (req: Request, res: Response): void => {
  const db = getDatabase(req);
  try {
    const rates = getExchangeRates(db);
    res.json({ success: true, rates });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve exchange rates' });
  }
});

/**
 * POST /api/rates/sync
 * Triggers an immediate refresh of exchange rates.
 */
apiRouter.post('/rates/sync', async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase(req);
  try {
    const result = await syncExchangeRates(db, true);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Exchange rate sync failed' });
  }
});
