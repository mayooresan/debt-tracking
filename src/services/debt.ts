import { getDb, Database } from '../db/index';
import { convertAmount, getExchangeRates } from './currency';
import {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  Debt,
  CreateDebtInput,
  UpdateDebtInput,
  DebtWithMonthlyStatus,
  Payment,
  CreatePaymentInput,
  MonthlySummary,
  CategorySummary,
} from '../types';

/**
 * Retrieves the base currency configured in app_settings or defaults to 'USD'.
 */
function getBaseCurrencySetting(db: Database): string {
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'base_currency'")
      .get() as { value: string } | undefined;
    return row?.value?.trim().toUpperCase() || 'USD';
  } catch {
    return 'USD';
  }
}

// ==========================================
// 1. Categories Services
// ==========================================

/**
 * Lists all categories ordered by ID ascending.
 */
export function listCategories(db?: Database): Category[] {
  const database = db || getDb();
  return database.prepare('SELECT * FROM categories ORDER BY id ASC').all() as Category[];
}

/**
 * Creates a new debt category.
 * Name is required and must be unique.
 */
export function createCategory(
  db: Database,
  input: { name: string; color?: string; icon?: string }
): Category {
  const database = db || getDb();
  const name = input?.name?.trim();

  if (!name) {
    throw new Error('Category name is required');
  }

  const color = input.color?.trim() || '#3B82F6';
  const icon = input.icon?.trim() || 'wallet';

  const stmt = database.prepare(
    'INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)'
  );
  const result = stmt.run(name, color, icon);

  return database
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(result.lastInsertRowid) as Category;
}

/**
 * Updates an existing category by ID.
 */
export function updateCategory(
  db: Database,
  id: number,
  input: { name?: string; color?: string; icon?: string }
): Category {
  const database = db || getDb();
  const existing = database
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(id) as Category | undefined;

  if (!existing) {
    throw new Error('Category not found');
  }

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (name === '') {
    throw new Error('Category name cannot be empty');
  }

  const color = input.color !== undefined ? input.color.trim() : existing.color;
  const icon = input.icon !== undefined ? input.icon.trim() : existing.icon;

  database
    .prepare('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?')
    .run(name, color, icon, id);

  return database
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(id) as Category;
}

/**
 * Deletes a category if no debts are attached.
 * Throws an error if debts are attached (enforced by foreign key / validation).
 */
export function deleteCategory(db: Database, id: number): boolean {
  const database = db || getDb();

  const debtCount = database
    .prepare('SELECT COUNT(*) as count FROM debts WHERE category_id = ?')
    .get(id) as { count: number } | undefined;

  if (debtCount && debtCount.count > 0) {
    throw new Error('Cannot delete category with associated debts');
  }

  const result = database.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}

// ==========================================
// 2. Debts Services
// ==========================================

/**
 * Retrieves a single debt by ID, or null if not found.
 */
export function getDebtById(db: Database, id: number): Debt | null {
  const database = db || getDb();
  const debt = database
    .prepare('SELECT * FROM debts WHERE id = ?')
    .get(id) as Debt | undefined;
  if (!debt) return null;
  return {
    ...debt,
    debt_type: debt.debt_type || 'standard',
    debtType: debt.debt_type || 'standard',
  };
}

/**
 * Creates a new debt record.
 * Supports snake_case and camelCase input properties.
 */
export function createDebt(db: Database, input: CreateDebtInput): Debt {
  const database = db || getDb();
  const raw = input as any;

  const rawDebtType = raw.debt_type ?? raw.debtType ?? 'standard';
  if (typeof rawDebtType !== 'string') {
    throw new Error("debt_type must be either 'standard' or 'pawning'");
  }
  const debt_type = rawDebtType.trim().toLowerCase();
  if (debt_type !== 'standard' && debt_type !== 'pawning') {
    throw new Error("debt_type must be either 'standard' or 'pawning'");
  }

  const category_id = raw.category_id ?? raw.categoryId;
  const name = raw.name?.trim();
  const total_amount = raw.total_amount ?? raw.totalAmount;
  const remaining_balance =
    raw.remaining_balance ?? raw.remainingBalance ?? total_amount;
  let monthly_payment = raw.monthly_payment ?? raw.monthlyPayment;
  const currency = (raw.currency || 'USD').trim().toUpperCase();
  const due_day = raw.due_day ?? raw.dueDay ?? 1;
  const interest_rate = raw.interest_rate ?? raw.interestRate ?? 0.0;
  const term_months = raw.term_months ?? raw.termMonths ?? null;
  const notes = raw.notes ?? null;

  if (debt_type === 'pawning') {
    if (monthly_payment === undefined || monthly_payment === null || monthly_payment === 0) {
      monthly_payment = Math.round(total_amount * ((interest_rate || 0) / 100) * 100) / 100;
    }
  }

  let start_month = (raw.start_month ?? raw.startMonth ?? '').trim();
  if (!start_month) {
    const now = new Date();
    start_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  } else if (!/^\d{4}-\d{2}$/.test(start_month)) {
    throw new Error('start_month must be in YYYY-MM format');
  }

  if (!name) {
    throw new Error('Debt name is required');
  }
  if (category_id === undefined || category_id === null) {
    throw new Error('Category ID is required');
  }
  if (typeof total_amount !== 'number' || isNaN(total_amount) || total_amount < 0) {
    throw new Error('total_amount must be a non-negative number');
  }
  if (typeof remaining_balance !== 'number' || isNaN(remaining_balance) || remaining_balance < 0) {
    throw new Error('remaining_balance must be a non-negative number');
  }
  if (typeof monthly_payment !== 'number' || isNaN(monthly_payment) || monthly_payment < 0) {
    throw new Error('monthly_payment must be a non-negative number');
  }
  if (typeof interest_rate !== 'number' || isNaN(interest_rate) || interest_rate < 0) {
    throw new Error('interest_rate must be a non-negative number');
  }
  if (typeof due_day !== 'number' || !Number.isInteger(due_day) || due_day < 1 || due_day > 31) {
    throw new Error('due_day must be an integer between 1 and 31');
  }
  if (term_months !== null && term_months !== undefined) {
    if (typeof term_months !== 'number' || !Number.isInteger(term_months) || term_months <= 0) {
      throw new Error('term_months must be a positive integer');
    }
  }

  const is_active = remaining_balance <= 0 ? 0 : 1;

  const stmt = database.prepare(`
    INSERT INTO debts (
      category_id, name, total_amount, remaining_balance, monthly_payment,
      currency, due_day, interest_rate, term_months, start_month, notes, is_active, debt_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    category_id,
    name,
    total_amount,
    remaining_balance,
    monthly_payment,
    currency,
    due_day,
    interest_rate,
    term_months,
    start_month,
    notes,
    is_active,
    debt_type
  );

  const inserted = database
    .prepare('SELECT * FROM debts WHERE id = ?')
    .get(result.lastInsertRowid) as Debt;
  return {
    ...inserted,
    debt_type: inserted.debt_type || 'standard',
    debtType: inserted.debt_type || 'standard',
  };
}

/**
 * Updates an existing debt record.
 * Automatically updates is_active when remaining_balance is updated to 0 or above.
 */
export function updateDebt(
  db: Database,
  id: number,
  input: Partial<CreateDebtInput> & { is_active?: number }
): Debt {
  const database = db || getDb();
  const existing = database
    .prepare('SELECT * FROM debts WHERE id = ?')
    .get(id) as Debt | undefined;

  if (!existing) {
    throw new Error('Debt not found');
  }

  const raw = input as any;
  const rawDebtType = raw.debt_type ?? raw.debtType ?? existing.debt_type ?? 'standard';
  if (typeof rawDebtType !== 'string') {
    throw new Error("debt_type must be either 'standard' or 'pawning'");
  }
  const debt_type = rawDebtType.trim().toLowerCase();
  if (debt_type !== 'standard' && debt_type !== 'pawning') {
    throw new Error("debt_type must be either 'standard' or 'pawning'");
  }

  const category_id = raw.category_id ?? raw.categoryId ?? existing.category_id;
  const name = raw.name !== undefined ? raw.name.trim() : existing.name;
  if (name === '') {
    throw new Error('Debt name cannot be empty');
  }
  const total_amount = raw.total_amount ?? raw.totalAmount ?? existing.total_amount;
  const currency = (raw.currency ?? existing.currency).trim().toUpperCase();
  const due_day = raw.due_day ?? raw.dueDay ?? existing.due_day;
  const interest_rate =
    raw.interest_rate ?? raw.interestRate ?? existing.interest_rate ?? 0.0;
  const term_months =
    raw.term_months !== undefined
      ? raw.term_months
      : raw.termMonths !== undefined
      ? raw.termMonths
      : existing.term_months;
  const notes = raw.notes !== undefined ? raw.notes : existing.notes;

  const hasMonthlyPayment = raw.monthly_payment !== undefined || raw.monthlyPayment !== undefined;
  const hasTotalAmount = raw.total_amount !== undefined || raw.totalAmount !== undefined;
  const hasInterestRate = raw.interest_rate !== undefined || raw.interestRate !== undefined;

  let monthly_payment =
    raw.monthly_payment ?? raw.monthlyPayment ?? existing.monthly_payment;
  if (
    debt_type === 'pawning' &&
    (hasTotalAmount || hasInterestRate) &&
    !hasMonthlyPayment
  ) {
    monthly_payment = Math.round(total_amount * ((interest_rate || 0) / 100) * 100) / 100;
  }

  let start_month = existing.start_month;
  if (raw.start_month !== undefined || raw.startMonth !== undefined) {
    const val = (raw.start_month ?? raw.startMonth ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(val)) {
      throw new Error('start_month must be in YYYY-MM format');
    }
    start_month = val;
  }

  let remaining_balance =
    raw.remaining_balance ?? raw.remainingBalance ?? existing.remaining_balance;
  let is_active = raw.is_active !== undefined ? raw.is_active : raw.isActive;
  if (typeof is_active === 'boolean') {
    is_active = is_active ? 1 : 0;
  } else if (typeof is_active === 'number') {
    is_active = is_active === 0 ? 0 : 1;
  } else if (typeof is_active === 'string') {
    is_active = is_active === '0' || is_active.toLowerCase() === 'false' ? 0 : 1;
  }

  if (is_active === 0 && raw.remaining_balance === undefined && raw.remainingBalance === undefined && debt_type === 'pawning') {
    remaining_balance = 0;
  }

  if (raw.total_amount !== undefined || raw.totalAmount !== undefined) {
    if (typeof total_amount !== 'number' || isNaN(total_amount) || total_amount < 0) {
      throw new Error('total_amount must be a non-negative number');
    }
  }
  if (raw.remaining_balance !== undefined || raw.remainingBalance !== undefined) {
    if (typeof remaining_balance !== 'number' || isNaN(remaining_balance) || remaining_balance < 0) {
      throw new Error('remaining_balance must be a non-negative number');
    }
  }
  if (raw.monthly_payment !== undefined || raw.monthlyPayment !== undefined || (debt_type === 'pawning' && (hasTotalAmount || hasInterestRate))) {
    if (typeof monthly_payment !== 'number' || isNaN(monthly_payment) || monthly_payment < 0) {
      throw new Error('monthly_payment must be a non-negative number');
    }
  }
  if (raw.interest_rate !== undefined || raw.interestRate !== undefined) {
    if (typeof interest_rate !== 'number' || isNaN(interest_rate) || interest_rate < 0) {
      throw new Error('interest_rate must be a non-negative number');
    }
  }
  if (raw.due_day !== undefined || raw.dueDay !== undefined) {
    if (typeof due_day !== 'number' || !Number.isInteger(due_day) || due_day < 1 || due_day > 31) {
      throw new Error('due_day must be an integer between 1 and 31');
    }
  }
  if (term_months !== null && term_months !== undefined) {
    if (typeof term_months !== 'number' || !Number.isInteger(term_months) || term_months <= 0) {
      throw new Error('term_months must be a positive integer');
    }
  }

  if (is_active === undefined) {
    if (raw.remaining_balance !== undefined || raw.remainingBalance !== undefined) {
      is_active = remaining_balance <= 0 ? 0 : 1;
    } else {
      is_active = existing.is_active;
    }
  }

  database.prepare(`
    UPDATE debts SET
      category_id = ?,
      name = ?,
      total_amount = ?,
      remaining_balance = ?,
      monthly_payment = ?,
      currency = ?,
      due_day = ?,
      interest_rate = ?,
      term_months = ?,
      start_month = ?,
      notes = ?,
      is_active = ?,
      debt_type = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    category_id,
    name,
    total_amount,
    remaining_balance,
    monthly_payment,
    currency,
    due_day,
    interest_rate,
    term_months,
    start_month,
    notes,
    is_active,
    debt_type,
    id
  );

  const updated = database
    .prepare('SELECT * FROM debts WHERE id = ?')
    .get(id) as Debt;
  return {
    ...updated,
    debt_type: updated.debt_type || 'standard',
    debtType: updated.debt_type || 'standard',
  };
}

/**
 * Deletes a debt by ID. Payments are cascaded via SQLite foreign key ON DELETE CASCADE.
 */
export function deleteDebt(db: Database, id: number): boolean {
  const database = db || getDb();
  const result = database.prepare('DELETE FROM debts WHERE id = ?').run(id);
  return result.changes > 0;
}

// ==========================================
// 3. Payments & Atomic Transactions
// ==========================================

/**
 * Records a payment against a debt inside an atomic SQLite transaction:
 * 1. Inserts payment into `payments` table
 * 2. Decrements `remaining_balance` on debt: MAX(0, remaining_balance - amount)
 * 3. If new balance <= 0, marks `is_active = 0` (paid off)
 * 4. Returns { payment, debt }
 */
export function recordPayment(
  db: Database,
  input: CreatePaymentInput
): { payment: Payment; debt: Debt } {
  const database = db || getDb();
  const raw = input as any;

  const debtId = raw.debt_id ?? raw.debtId;
  const amount = raw.amount;
  const paymentDate = raw.payment_date ?? raw.paymentDate;
  const monthPeriod = raw.month_period ?? raw.monthPeriod;
  const notes = raw.notes ?? null;

  if (!debtId) {
    throw new Error('debt_id is required');
  }
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Payment amount must be positive');
  }
  if (!paymentDate) {
    throw new Error('payment_date is required');
  }
  if (!monthPeriod) {
    throw new Error('month_period is required');
  }

  const recordTx = database.transaction(() => {
    const existingDebt = database
      .prepare('SELECT * FROM debts WHERE id = ?')
      .get(debtId) as Debt | undefined;

    if (!existingDebt) {
      throw new Error('Debt not found');
    }

    const currency = (raw.currency || existingDebt.currency || 'USD').trim().toUpperCase();

    const insertStmt = database.prepare(`
      INSERT INTO payments (debt_id, amount, currency, payment_date, month_period, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertResult = insertStmt.run(
      debtId,
      amount,
      currency,
      paymentDate,
      monthPeriod,
      notes
    );

    const newBalance = Math.max(
      0,
      Math.round((existingDebt.remaining_balance - amount) * 100) / 100
    );
    const newIsActive = newBalance <= 0 ? 0 : existingDebt.is_active;

    database.prepare(`
      UPDATE debts
      SET remaining_balance = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newBalance, newIsActive, debtId);

    const payment = database
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(insertResult.lastInsertRowid) as Payment;

    const updatedDebt = database
      .prepare('SELECT * FROM debts WHERE id = ?')
      .get(debtId) as Debt;

    return { payment, debt: updatedDebt };
  });

  return recordTx();
}

/**
 * Reverts a previously recorded payment inside an atomic SQLite transaction:
 * 1. Fetches payment by ID inside transaction
 * 2. Restores remaining_balance on debt: remaining_balance + payment.amount
 * 3. If remaining_balance > 0, reactivates debt (is_active = 1)
 * 4. Deletes payment row
 * 5. Returns { success: true, debt }
 */
export function revertPayment(
  db: Database,
  paymentId: number
): { success: boolean; debt: Debt } {
  const database = db || getDb();

  const revertTx = database.transaction(() => {
    const payment = database
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(paymentId) as Payment | undefined;

    if (!payment) {
      throw new Error('Payment not found');
    }

    const existingDebt = database
      .prepare('SELECT * FROM debts WHERE id = ?')
      .get(payment.debt_id) as Debt | undefined;

    if (!existingDebt) {
      throw new Error('Debt not found');
    }

    const restoredBalance =
      Math.round((existingDebt.remaining_balance + payment.amount) * 100) / 100;
    const newIsActive = restoredBalance > 0 ? 1 : existingDebt.is_active;

    database.prepare(`
      UPDATE debts
      SET remaining_balance = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(restoredBalance, newIsActive, existingDebt.id);

    database.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);

    const updatedDebt = database
      .prepare('SELECT * FROM debts WHERE id = ?')
      .get(existingDebt.id) as Debt;

    return { success: true, debt: updatedDebt };
  });

  return revertTx();
}

/**
 * Retrieves payment history for a specific debt.
 */
export function getPaymentsByDebtId(db: Database, debtId: number): Payment[] {
  const database = db || getDb();
  return database
    .prepare(
      'SELECT * FROM payments WHERE debt_id = ? ORDER BY payment_date DESC, id DESC'
    )
    .all(debtId) as Payment[];
}

/**
 * Retrieves all payments recorded for a given calendar month cycle (YYYY-MM).
 */
export function getPaymentsByMonth(db: Database, monthPeriod: string): Payment[] {
  const database = db || getDb();
  return database
    .prepare(
      'SELECT * FROM payments WHERE month_period = ? ORDER BY payment_date DESC, id DESC'
    )
    .all(monthPeriod) as Payment[];
}

// ==========================================
// 4. Monthly Status & Multi-Currency Aggregations
// ==========================================

/**
 * Generates an array of month strings (YYYY-MM) between startMonth and endMonth inclusive.
 */
export function getMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  if (!startMonth || !endMonth || !/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
    return months;
  }
  let [currYear, currMonth] = startMonth.split('-').map(Number);
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);

  while (currYear < endYear || (currYear === endYear && currMonth <= endMonthNum)) {
    months.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
    currMonth++;
    if (currMonth > 12) {
      currMonth = 1;
      currYear++;
    }
    if (months.length > 1200) break;
  }
  return months;
}

/**
 * Calculates pawning debt compounding state up to targetMonth.
 */
export function calculatePawningState(
  debt: { total_amount: number; remaining_balance: number; interest_rate: number | null; start_month: string; is_active?: number },
  targetMonth: string,
  payments: Payment[]
): {
  currentBalance: number;
  monthlyInterest: number;
  accruedInterest: number;
  isPaid: boolean;
  paidAmount: number;
  paymentId: number | null;
  paidAt: string | null;
} {
  const rateFraction = (debt.interest_rate || 0) / 100;
  const startMonth = debt.start_month || targetMonth;

  if (targetMonth < startMonth) {
    const interest = Math.round(debt.total_amount * rateFraction * 100) / 100;
    return {
      currentBalance: debt.total_amount,
      monthlyInterest: interest,
      accruedInterest: 0,
      isPaid: false,
      paidAmount: 0,
      paymentId: null,
      paidAt: null,
    };
  }

  if (debt.is_active === 0 && debt.remaining_balance === 0) {
    const targetPayments = payments.filter((p) => p.month_period === targetMonth);
    const paidThisMonth = targetPayments.reduce((sum, p) => sum + p.amount, 0);
    const lastTargetPayment = targetPayments[targetPayments.length - 1];
    return {
      currentBalance: 0,
      monthlyInterest: 0,
      accruedInterest: 0,
      isPaid: paidThisMonth > 0,
      paidAmount: paidThisMonth,
      paymentId: lastTargetPayment ? lastTargetPayment.id : null,
      paidAt: lastTargetPayment ? lastTargetPayment.payment_date : null,
    };
  }

  const months = getMonthsBetween(startMonth, targetMonth);
  let balance = debt.total_amount;

  for (let i = 0; i < months.length - 1; i++) {
    const m = months[i];
    const monthInterest = Math.round(balance * rateFraction * 100) / 100;
    const mPayments = payments.filter((p) => p.month_period === m);
    const paidForMonth = mPayments.reduce((sum, p) => sum + p.amount, 0);

    if (paidForMonth < monthInterest) {
      // Unpaid interest compounds into balance for next month
      balance = Math.round((balance + (monthInterest - paidForMonth)) * 100) / 100;
    } else if (paidForMonth > monthInterest) {
      // Excess payment reduces base principal
      balance = Math.max(0, Math.round((balance - (paidForMonth - monthInterest)) * 100) / 100);
    }
  }

  const currentMonthInterest = Math.round(balance * rateFraction * 100) / 100;
  const targetPayments = payments.filter((p) => p.month_period === targetMonth);
  const paidThisMonth = targetPayments.reduce((sum, p) => sum + p.amount, 0);
  const lastTargetPayment = targetPayments[targetPayments.length - 1];

  const accruedInterest = Math.max(0, Math.round((balance - debt.total_amount) * 100) / 100);

  return {
    currentBalance: balance,
    monthlyInterest: currentMonthInterest,
    accruedInterest,
    isPaid: paidThisMonth >= currentMonthInterest && currentMonthInterest > 0,
    paidAmount: paidThisMonth,
    paymentId: lastTargetPayment ? lastTargetPayment.id : null,
    paidAt: lastTargetPayment ? lastTargetPayment.payment_date : null,
  };
}

/**
 * Lists debts with their monthly payment status for a specific monthPeriod (YYYY-MM).
 * Computes is_paid, paid_amount, paid_at, and converts monthly_payment & remaining_balance
 * to the specified base currency (or defaults to system base_currency).
 */
export function listDebtsWithMonthlyStatus(
  db: Database,
  monthPeriod: string,
  baseCurrency?: string
): DebtWithMonthlyStatus[] {
  const database = db || getDb();
  const rates = getExchangeRates(database);
  const targetBaseCurrency = (
    baseCurrency ||
    getBaseCurrencySetting(database) ||
    'USD'
  ).trim().toUpperCase();

  const rows = database.prepare(`
    SELECT 
      d.*,
      c.name AS category_name,
      c.color AS category_color,
      c.icon AS category_icon,
      p.payment_id,
      p.paid_amount,
      p.paid_at
    FROM debts d
    JOIN categories c ON d.category_id = c.id
    LEFT JOIN (
      SELECT 
        debt_id,
        MAX(id) AS payment_id,
        SUM(amount) AS paid_amount,
        MAX(payment_date) AS paid_at
      FROM payments
      WHERE month_period = ?
      GROUP BY debt_id
    ) p ON d.id = p.debt_id
    WHERE d.is_active = 1 OR p.payment_id IS NOT NULL
    ORDER BY d.due_day ASC, d.id ASC
  `).all(monthPeriod) as any[];

  const pawningDebtIds = rows
    .filter((r) => (r.debt_type || '').toLowerCase() === 'pawning')
    .map((r) => r.id);

  const pawningPaymentsMap = new Map<number, Payment[]>();
  if (pawningDebtIds.length > 0) {
    const placeholders = pawningDebtIds.map(() => '?').join(',');
    const allPawningPayments = database
      .prepare(
        `SELECT * FROM payments WHERE debt_id IN (${placeholders}) ORDER BY payment_date ASC, id ASC`
      )
      .all(...pawningDebtIds) as Payment[];

    for (const payment of allPawningPayments) {
      if (!pawningPaymentsMap.has(payment.debt_id)) {
        pawningPaymentsMap.set(payment.debt_id, []);
      }
      pawningPaymentsMap.get(payment.debt_id)!.push(payment);
    }
  }

  return rows.map((row) => {
    let is_paid = Boolean(row.payment_id && row.paid_amount > 0);
    let paid_amount = row.paid_amount ? Math.round(row.paid_amount * 100) / 100 : 0;
    let paid_at = row.paid_at || null;
    let payment_id = row.payment_id || null;
    let monthly_payment = row.monthly_payment;
    let remaining_balance = row.remaining_balance;
    let accrued_interest = 0;
    let total_pawn_payoff = remaining_balance;

    if (row.debt_type === 'pawning') {
      const debtPayments = pawningPaymentsMap.get(row.id) || [];
      const pawnState = calculatePawningState(row, monthPeriod, debtPayments);
      monthly_payment = pawnState.monthlyInterest;
      remaining_balance = pawnState.currentBalance;
      accrued_interest = pawnState.accruedInterest;
      total_pawn_payoff = pawnState.currentBalance;
      is_paid = pawnState.isPaid;
      paid_amount = pawnState.paidAmount;
      paid_at = pawnState.paidAt;
      payment_id = pawnState.paymentId;
    }

    const start_month = row.start_month || monthPeriod;
    const is_upcoming = Boolean(row.start_month && row.start_month > monthPeriod && !is_paid);

    const converted_monthly_payment = convertAmount(
      monthly_payment,
      row.currency,
      targetBaseCurrency,
      rates
    );
    const converted_remaining_balance = convertAmount(
      remaining_balance,
      row.currency,
      targetBaseCurrency,
      rates
    );

    const remaining_months =
      row.debt_type === 'pawning'
        ? 0
        : remaining_balance > 0 && monthly_payment > 0
        ? Math.ceil(remaining_balance / monthly_payment)
        : 0;

    let projected_payoff_date: string | null = null;
    if (remaining_months > 0) {
      let basePeriod = monthPeriod;
      let startOffset = is_paid ? 1 : 0;
      if (is_upcoming) {
        basePeriod = start_month;
        startOffset = 0;
      }

      const [yearStr, monthStr] = basePeriod.split('-');
      let year = parseInt(yearStr, 10);
      let month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month)) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }
      const totalMonths = year * 12 + (month - 1) + startOffset + (remaining_months - 1);
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = (totalMonths % 12) + 1;
      projected_payoff_date = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    }

    return {
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      total_amount: row.total_amount,
      remaining_balance,
      monthly_payment,
      currency: row.currency,
      due_day: row.due_day,
      interest_rate: row.interest_rate,
      term_months: row.term_months ?? null,
      start_month,
      notes: row.notes,
      is_active: row.is_active,
      debt_type: row.debt_type || 'standard',
      debtType: row.debt_type || 'standard',
      created_at: row.created_at,
      updated_at: row.updated_at,
      category_name: row.category_name,
      category_color: row.category_color,
      category_icon: row.category_icon,
      is_paid,
      is_upcoming,
      paid_amount,
      paid_at,
      payment_id,
      remaining_months,
      projected_payoff_date,
      converted_monthly_payment,
      converted_remaining_balance,
      accrued_interest,
      total_pawn_payoff,
    };
  });
}

/**
 * Calculates aggregate monthly summary and category breakdown converted to baseCurrency:
 * - total_debt: sum of all remaining_balance converted to baseCurrency
 * - monthly_obligations: sum of active monthly_payment due this month converted to baseCurrency
 * - paid_this_month: sum of payments made in target month converted to baseCurrency
 * - pending_this_month: max(0, monthly_obligations - paid_this_month)
 * - percentage_paid: (paid_this_month / monthly_obligations) * 100
 * - category_breakdown: array of category summaries
 */
export function getMonthlySummary(
  db: Database,
  monthPeriod: string,
  baseCurrency?: string
): MonthlySummary {
  const database = db || getDb();
  const rates = getExchangeRates(database);
  const targetBaseCurrency = (
    baseCurrency ||
    getBaseCurrencySetting(database) ||
    'USD'
  ).trim().toUpperCase();

  // Load debts for this month with dynamically calculated pawning balances and obligations
  const debts = listDebtsWithMonthlyStatus(database, monthPeriod, targetBaseCurrency);
  const activeDebts = debts.filter((d) => !d.is_upcoming);

  // 1. Total Debt: sum of all non-upcoming debts with remaining_balance > 0
  let totalDebt = 0;
  for (const debt of activeDebts) {
    if (debt.remaining_balance > 0) {
      totalDebt += debt.converted_remaining_balance ?? debt.remaining_balance;
    }
  }

  // 2. Monthly Obligations: sum of monthly_payment due for non-upcoming debts
  let monthlyObligations = 0;
  for (const debt of activeDebts) {
    monthlyObligations += debt.converted_monthly_payment ?? debt.monthly_payment;
  }

  // 3. Paid this month: sum of all payments in target month converted to baseCurrency
  const monthlyPayments = database.prepare(`
    SELECT p.amount, p.currency, d.category_id
    FROM payments p
    JOIN debts d ON p.debt_id = d.id
    WHERE p.month_period = ?
  `).all(monthPeriod) as { amount: number; currency: string; category_id: number }[];

  let paidThisMonth = 0;
  for (const payment of monthlyPayments) {
    paidThisMonth += convertAmount(payment.amount, payment.currency, targetBaseCurrency, rates);
  }

  // 4. Pending this month
  const pendingThisMonth = Math.max(
    0,
    Math.round((monthlyObligations - paidThisMonth) * 100) / 100
  );

  // 5. Percentage paid
  let percentagePaid = 0;
  if (monthlyObligations > 0) {
    percentagePaid = Math.round((paidThisMonth / monthlyObligations) * 10000) / 100;
  } else if (paidThisMonth > 0) {
    percentagePaid = 100;
  }

  // 6. Category breakdown
  const categories = listCategories(database);
  const categoryBreakdown: CategorySummary[] = [];

  for (const category of categories) {
    // Debts in category
    const catDebts = activeDebts.filter((d) => d.category_id === category.id);
    let catTotalDue = 0;
    for (const debt of catDebts) {
      catTotalDue += debt.converted_monthly_payment ?? debt.monthly_payment;
    }

    // Payments in category for target month
    const catPayments = monthlyPayments.filter((p) => p.category_id === category.id);
    let catTotalPaid = 0;
    for (const payment of catPayments) {
      catTotalPaid += convertAmount(payment.amount, payment.currency, targetBaseCurrency, rates);
    }

    // Remaining balance for debts in this category (aggregated in-memory, no N+1 query)
    const catBalanceDebts = catDebts.filter((d) => d.remaining_balance > 0);

    let catRemainingBalance = 0;
    for (const debt of catBalanceDebts) {
      catRemainingBalance += debt.converted_remaining_balance ?? debt.remaining_balance;
    }

    const debtCount = catBalanceDebts.length;
    const roundedDue = Math.round(catTotalDue * 100) / 100;
    const roundedPaid = Math.round(catTotalPaid * 100) / 100;
    const roundedBalance = Math.round(catRemainingBalance * 100) / 100;

    categoryBreakdown.push({
      category_id: category.id,
      category_name: category.name,
      category_color: category.color,
      total_due: roundedDue,
      total_paid: roundedPaid,
      remaining_balance: roundedBalance,
      debt_count: debtCount,
      totalDebt: roundedBalance,
      monthlyObligations: roundedDue,
      debtCount,
    });
  }

  return {
    month: monthPeriod,
    base_currency: targetBaseCurrency,
    total_debt: Math.round(totalDebt * 100) / 100,
    monthly_obligations: Math.round(monthlyObligations * 100) / 100,
    paid_this_month: Math.round(paidThisMonth * 100) / 100,
    pending_this_month: pendingThisMonth,
    percentage_paid: percentagePaid,
    category_breakdown: categoryBreakdown,
  };
}
