import fs from 'fs';
import path from 'path';
import DatabaseConstructor, { Database as DatabaseType } from 'better-sqlite3';

export type { Database } from 'better-sqlite3';

let instance: DatabaseType | null = null;
let instancePath: string | null = null;

export const SCHEMA_SQL = `
-- 1. Categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'wallet',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default categories if empty
INSERT OR IGNORE INTO categories (name, color, icon) VALUES
  ('Loans', '#3B82F6', 'landmark'),
  ('Credit Cards', '#EF4444', 'credit-card'),
  ('Installments', '#10B981', 'calendar-clock'),
  ('Subscriptions & Others', '#8B5CF6', 'tag');

-- 2. Debts
CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  total_amount REAL NOT NULL,
  remaining_balance REAL NOT NULL,
  monthly_payment REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  due_day INTEGER NOT NULL DEFAULT 1,
  interest_rate REAL DEFAULT 0.0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  month_period TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Exchange Rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_currency, target_currency)
);

-- 5. Application Settings
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed default app_settings if empty
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('base_currency', 'USD'),
  ('last_rates_sync', '1970-01-01T00:00:00.000Z');
`;

/**
 * Resolves the database file path based on argument, environment variable DB_PATH,
 * or the default local directory (./data/budget.db).
 */
export function resolveDbPath(customPath?: string): string {
  if (customPath) {
    if (customPath === ':memory:') return ':memory:';
    return path.resolve(customPath);
  }
  if (process.env.DB_PATH) {
    if (process.env.DB_PATH === ':memory:') return ':memory:';
    return path.resolve(process.env.DB_PATH);
  }
  return path.resolve(process.cwd(), 'data', 'budget.db');
}

/**
 * Initializes the SQLite database, enables pragmas (foreign_keys, WAL),
 * executes the schema migration and default seed data, and caches the instance.
 */
export function initDb(dbPath?: string): DatabaseType {
  const resolvedPath = resolveDbPath(dbPath);

  if (instance && instance.open) {
    if (instancePath === resolvedPath && resolvedPath !== ':memory:') {
      // Re-run schema in case of idempotent call on existing open connection
      instance.exec(SCHEMA_SQL);
      return instance;
    }
    instance.close();
    instance = null;
    instancePath = null;
  }

  if (resolvedPath !== ':memory:') {
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  const db = new DatabaseConstructor(resolvedPath);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA_SQL);

  instance = db;
  instancePath = resolvedPath;

  return db;
}

/**
 * Gets the current active database connection, initializing one if needed.
 */
export function getDb(dbPath?: string): DatabaseType {
  const resolvedPath = resolveDbPath(dbPath);

  if (instance && instance.open) {
    if (!dbPath || instancePath === resolvedPath) {
      return instance;
    }
  }

  return initDb(dbPath);
}

/**
 * Closes the active database connection and resets the singleton instance.
 */
export function closeDb(): void {
  if (instance && instance.open) {
    instance.close();
  }
  instance = null;
  instancePath = null;
}
