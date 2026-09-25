import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { initDb, getDb, closeDb } from '../src/db/index';

describe('Database Layer & Schema Initialization', () => {
  afterEach(() => {
    closeDb();
  });

  it('should initialize an in-memory database and enable foreign keys and WAL mode', () => {
    const db = initDb(':memory:');
    expect(db).toBeDefined();

    // Verify foreign keys pragma is ON
    const fkPragma = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
    expect(fkPragma.foreign_keys).toBe(1);

    // Verify journal mode
    const jmPragma = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    // Note: in-memory sqlite databases report 'memory' for journal_mode,
    // but the WAL pragma statement executes without error.
    expect(['memory', 'wal']).toContain(jmPragma.journal_mode);
  });

  it('should create all required tables: categories, debts, payments, exchange_rates, app_settings', () => {
    const db = initDb(':memory:');

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('debts');
    expect(tableNames).toContain('payments');
    expect(tableNames).toContain('exchange_rates');
    expect(tableNames).toContain('app_settings');
  });

  it('should seed default categories with correct colors and icons', () => {
    const db = initDb(':memory:');

    const categories = db.prepare('SELECT name, color, icon FROM categories ORDER BY id ASC;').all() as {
      name: string;
      color: string;
      icon: string;
    }[];

    expect(categories).toHaveLength(5);
    expect(categories).toEqual([
      { name: 'Loans', color: '#3B82F6', icon: 'landmark' },
      { name: 'Credit Cards', color: '#EF4444', icon: 'credit-card' },
      { name: 'Installments', color: '#10B981', icon: 'calendar-clock' },
      { name: 'Subscriptions & Others', color: '#8B5CF6', icon: 'tag' },
      { name: 'Pawning', color: '#F59E0B', icon: 'gem' },
    ]);
  });

  it('should seed default app_settings (base_currency, last_rates_sync)', () => {
    const db = initDb(':memory:');

    const settings = db.prepare('SELECT key, value FROM app_settings ORDER BY key ASC;').all() as {
      key: string;
      value: string;
    }[];

    expect(settings).toEqual([
      { key: 'base_currency', value: 'USD' },
      { key: 'last_rates_sync', value: '1970-01-01T00:00:00.000Z' },
    ]);
  });

  it('should enforce foreign key constraints', () => {
    const db = initDb(':memory:');

    // Inserting a debt with invalid category_id should throw FOREIGN KEY constraint failed
    expect(() => {
      db.prepare(`
        INSERT INTO debts (category_id, name, total_amount, remaining_balance, monthly_payment, currency, due_day)
        VALUES (999, 'Invalid Debt', 1000, 1000, 100, 'USD', 1);
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it('should cascade delete payments when a debt is deleted', () => {
    const db = initDb(':memory:');

    // 1. Get a valid category id
    const category = db.prepare('SELECT id FROM categories WHERE name = ?').get('Loans') as { id: number };

    // 2. Insert debt
    const debtRes = db.prepare(`
      INSERT INTO debts (category_id, name, total_amount, remaining_balance, monthly_payment, currency, due_day)
      VALUES (?, 'Car Loan', 5000, 5000, 250, 'USD', 15);
    `).run(category.id);
    const debtId = debtRes.lastInsertRowid;

    // 3. Insert payment
    db.prepare(`
      INSERT INTO payments (debt_id, amount, currency, payment_date, month_period)
      VALUES (?, 250, 'USD', '2026-09-15', '2026-09');
    `).run(debtId);

    // Verify payment exists
    const paymentBefore = db.prepare('SELECT * FROM payments WHERE debt_id = ?').all(debtId);
    expect(paymentBefore).toHaveLength(1);

    // 4. Delete debt
    db.prepare('DELETE FROM debts WHERE id = ?').run(debtId);

    // Verify payment was cascade deleted
    const paymentAfter = db.prepare('SELECT * FROM payments WHERE debt_id = ?').all(debtId);
    expect(paymentAfter).toHaveLength(0);
  });

  it('should restrict category deletion if debts are attached', () => {
    const db = initDb(':memory:');
    const category = db.prepare('SELECT id FROM categories WHERE name = ?').get('Loans') as { id: number };

    db.prepare(`
      INSERT INTO debts (category_id, name, total_amount, remaining_balance, monthly_payment, currency, due_day)
      VALUES (?, 'Car Loan', 5000, 5000, 250, 'USD', 15);
    `).run(category.id);

    expect(() => {
      db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
    }).toThrow(/FOREIGN KEY constraint failed/i);
  });

  it('should be idempotent and not duplicate seed data when run repeatedly', () => {
    const tempDir = path.join(__dirname, '..', '.tmp-test-db');
    const tempDbPath = path.join(tempDir, 'test-idempotent.db');

    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

      // Run initDb twice on same disk database
      const db1 = initDb(tempDbPath);
      closeDb();

      const db2 = initDb(tempDbPath);

      const count = db2.prepare('SELECT COUNT(*) as cnt FROM categories;').get() as { cnt: number };
      expect(count.cnt).toBe(5);

      const settingsCount = db2.prepare('SELECT COUNT(*) as cnt FROM app_settings;').get() as { cnt: number };
      expect(settingsCount.cnt).toBe(2);

      closeDb();
    } finally {
      closeDb();
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create missing parent directories for database path automatically', () => {
    const nestedDir = path.join(__dirname, '..', '.tmp-test-db', 'nested', 'deep');
    const nestedDbPath = path.join(nestedDir, 'nested.db');

    try {
      expect(fs.existsSync(nestedDir)).toBe(false);
      const db = initDb(nestedDbPath);
      expect(fs.existsSync(nestedDbPath)).toBe(true);
      closeDb();
    } finally {
      const topDir = path.join(__dirname, '..', '.tmp-test-db');
      if (fs.existsSync(topDir)) fs.rmSync(topDir, { recursive: true, force: true });
    }
  });

  it('should allow getDb() to return the current active database connection', () => {
    const db1 = initDb(':memory:');
    const db2 = getDb();
    expect(db2).toBe(db1);
  });

  it('should include debt_type column and seed Pawning category', () => {
    const db = initDb(':memory:');
    const tableInfo = db.prepare("PRAGMA table_info(debts)").all() as Array<{ name: string; type: string; dflt_value: string }>;
    const debtTypeCol = tableInfo.find((col) => col.name === 'debt_type');
    expect(debtTypeCol).toBeDefined();
    expect(debtTypeCol?.dflt_value).toContain("'standard'");

    const pawningCat = db.prepare("SELECT * FROM categories WHERE name = 'Pawning'").get() as any;
    expect(pawningCat).toBeDefined();
    expect(pawningCat.color).toBe('#F59E0B');
    expect(pawningCat.icon).toBe('gem');
  });
});

