import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb } from '../src/db/index';
import {
  listCategories,
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
  getMonthlySummary,
  getPaymentsByDebtId,
  getPaymentsByMonth,
} from '../src/services/debt';

describe('Debt & Payment Core Service', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
    // Pre-seed some exchange rates for deterministic multi-currency testing
    db.prepare(`
      INSERT INTO exchange_rates (base_currency, target_currency, rate)
      VALUES 
        ('USD', 'USD', 1.0),
        ('USD', 'EUR', 0.85),
        ('USD', 'GBP', 0.75),
        ('USD', 'JPY', 150.0)
    `).run();
  });

  afterEach(() => {
    closeDb();
  });

  describe('Categories Management', () => {
    it('should list default seeded categories', () => {
      const categories = listCategories(db);
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThanOrEqual(4);

      const names = categories.map((c) => c.name);
      expect(names).toContain('Loans');
      expect(names).toContain('Credit Cards');
      expect(names).toContain('Installments');
      expect(names).toContain('Subscriptions & Others');
    });

    it('should create a new category with custom color and icon', () => {
      const created = createCategory(db, {
        name: 'Medical Bills',
        color: '#F43F5E',
        icon: 'activity',
      });

      expect(created).toBeDefined();
      expect(created.id).toBeGreaterThan(0);
      expect(created.name).toBe('Medical Bills');
      expect(created.color).toBe('#F43F5E');
      expect(created.icon).toBe('activity');

      const all = listCategories(db);
      expect(all.some((c) => c.name === 'Medical Bills')).toBe(true);
    });

    it('should use default color and icon when not provided', () => {
      const created = createCategory(db, { name: 'Family Loan' });
      expect(created.color).toBe('#3B82F6');
      expect(created.icon).toBe('wallet');
    });

    it('should throw an error when category name is empty or already exists', () => {
      expect(() => createCategory(db, { name: '   ' })).toThrow(/name is required/i);
      expect(() => createCategory(db, { name: 'Loans' })).toThrow();
    });

    it('should update an existing category', () => {
      const categories = listCategories(db);
      const target = categories[0];

      const updated = updateCategory(db, target.id, {
        name: 'Mortgages & Loans',
        color: '#2563EB',
      });

      expect(updated.id).toBe(target.id);
      expect(updated.name).toBe('Mortgages & Loans');
      expect(updated.color).toBe('#2563EB');
      expect(updated.icon).toBe(target.icon);
    });

    it('should throw when updating a non-existent category', () => {
      expect(() => updateCategory(db, 99999, { name: 'Fake' })).toThrow(/not found/i);
    });

    it('should delete a category without associated debts', () => {
      const created = createCategory(db, { name: 'Temporary' });
      const success = deleteCategory(db, created.id);
      expect(success).toBe(true);

      const all = listCategories(db);
      expect(all.some((c) => c.id === created.id)).toBe(false);
    });

    it('should return false when deleting non-existent category', () => {
      const success = deleteCategory(db, 99999);
      expect(success).toBe(false);
    });

    it('should throw when deleting a category that has associated debts', () => {
      const categories = listCategories(db);
      const loanCat = categories.find((c) => c.name === 'Loans')!;

      createDebt(db, {
        category_id: loanCat.id,
        name: 'Car Loan',
        total_amount: 15000,
        monthly_payment: 350,
      });

      expect(() => deleteCategory(db, loanCat.id)).toThrow(/associated debts|foreign key/i);
    });
  });

  describe('Debts CRUD', () => {
    let loanCategoryId: number;

    beforeEach(() => {
      const categories = listCategories(db);
      loanCategoryId = categories.find((c) => c.name === 'Loans')!.id;
    });

    it('should create a debt with defaults for optional fields', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Student Loan',
        total_amount: 20000,
        monthly_payment: 250,
      });

      expect(debt.id).toBeGreaterThan(0);
      expect(debt.name).toBe('Student Loan');
      expect(debt.total_amount).toBe(20000);
      expect(debt.remaining_balance).toBe(20000); // defaults to total_amount
      expect(debt.monthly_payment).toBe(250);
      expect(debt.currency).toBe('USD'); // default currency
      expect(debt.due_day).toBe(1); // default due_day
      expect(debt.interest_rate).toBe(0.0);
      expect(debt.notes).toBeNull();
      expect(debt.is_active).toBe(1);
    });

    it('should create a debt with custom values and remaining balance', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Personal Loan',
        total_amount: 10000,
        remaining_balance: 7500,
        monthly_payment: 300,
        currency: 'EUR',
        due_day: 15,
        interest_rate: 6.5,
        notes: 'Bank of America personal loan',
      });

      expect(debt.currency).toBe('EUR');
      expect(debt.remaining_balance).toBe(7500);
      expect(debt.due_day).toBe(15);
      expect(debt.interest_rate).toBe(6.5);
      expect(debt.notes).toBe('Bank of America personal loan');
      expect(debt.is_active).toBe(1);
    });

    it('should set is_active to 0 when initial remaining balance is 0', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Old Loan',
        total_amount: 5000,
        remaining_balance: 0,
        monthly_payment: 200,
      });

      expect(debt.remaining_balance).toBe(0);
      expect(debt.is_active).toBe(0);
    });

    it('should support camelCase input aliases when creating debt', () => {
      const debt = createDebt(db, {
        categoryId: loanCategoryId,
        name: 'Camel Loan',
        totalAmount: 4000,
        remainingBalance: 3200,
        monthlyPayment: 150,
        dueDay: 20,
        interestRate: 4.2,
      } as any);

      expect(debt.name).toBe('Camel Loan');
      expect(debt.total_amount).toBe(4000);
      expect(debt.remaining_balance).toBe(3200);
      expect(debt.monthly_payment).toBe(150);
      expect(debt.due_day).toBe(20);
      expect(debt.interest_rate).toBe(4.2);
    });

    it('should throw validation errors on missing required fields', () => {
      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: '',
          total_amount: 1000,
          monthly_payment: 100,
        })
      ).toThrow(/name is required/i);

      expect(() =>
        createDebt(db, {
          category_id: 99999,
          name: 'Invalid Cat',
          total_amount: 1000,
          monthly_payment: 100,
        })
      ).toThrow();

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Negative',
          total_amount: -500,
          monthly_payment: 100,
        })
      ).toThrow(/total_amount must be a non-negative number/i);

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Negative Balance',
          total_amount: 500,
          remaining_balance: -10,
          monthly_payment: 100,
        })
      ).toThrow(/remaining_balance must be a non-negative number/i);

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Negative Payment',
          total_amount: 500,
          monthly_payment: -50,
        })
      ).toThrow(/monthly_payment must be a non-negative number/i);

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Negative Interest',
          total_amount: 500,
          monthly_payment: 50,
          interest_rate: -1,
        })
      ).toThrow(/interest_rate must be a non-negative number/i);

      // due_day validations (1 - 31 integers)
      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Due Day 0',
          total_amount: 500,
          monthly_payment: 50,
          due_day: 0,
        })
      ).toThrow(/due_day must be an integer between 1 and 31/i);

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Due Day 32',
          total_amount: 500,
          monthly_payment: 50,
          due_day: 32,
        })
      ).toThrow(/due_day must be an integer between 1 and 31/i);

      expect(() =>
        createDebt(db, {
          category_id: loanCategoryId,
          name: 'Due Day Fractional',
          total_amount: 500,
          monthly_payment: 50,
          due_day: 15.5,
        })
      ).toThrow(/due_day must be an integer between 1 and 31/i);
    });

    it('should fetch debt by id', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Auto Loan',
        total_amount: 8000,
        monthly_payment: 200,
      });

      const found = getDebtById(db, debt.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(debt.id);
      expect(found!.name).toBe('Auto Loan');

      const nonExistent = getDebtById(db, 99999);
      expect(nonExistent).toBeNull();
    });

    it('should update debt fields and automatically update is_active when balance hits 0', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Store Card',
        total_amount: 1000,
        monthly_payment: 100,
      });

      const updated = updateDebt(db, debt.id, {
        name: 'Store Card - Prime',
        monthly_payment: 150,
      });

      expect(updated.name).toBe('Store Card - Prime');
      expect(updated.monthly_payment).toBe(150);
      expect(updated.is_active).toBe(1);

      // Updating remaining_balance to 0 sets is_active to 0
      const paidDebt = updateDebt(db, debt.id, {
        remaining_balance: 0,
      });
      expect(paidDebt.remaining_balance).toBe(0);
      expect(paidDebt.is_active).toBe(0);

      // Updating remaining_balance back above 0 sets is_active to 1
      const reactivatedDebt = updateDebt(db, debt.id, {
        remaining_balance: 200,
      });
      expect(reactivatedDebt.remaining_balance).toBe(200);
      expect(reactivatedDebt.is_active).toBe(1);
    });

    it('should throw when updating a non-existent debt', () => {
      expect(() => updateDebt(db, 99999, { name: 'Ghost' })).toThrow(/not found/i);
    });

    it('should validate numeric constraints and due_day in updateDebt', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Validation Debt',
        total_amount: 1000,
        monthly_payment: 100,
      });

      expect(() =>
        updateDebt(db, debt.id, { total_amount: -10 })
      ).toThrow(/total_amount must be a non-negative number/i);

      expect(() =>
        updateDebt(db, debt.id, { remaining_balance: -5 })
      ).toThrow(/remaining_balance must be a non-negative number/i);

      expect(() =>
        updateDebt(db, debt.id, { monthly_payment: -50 })
      ).toThrow(/monthly_payment must be a non-negative number/i);

      expect(() =>
        updateDebt(db, debt.id, { interest_rate: -2 })
      ).toThrow(/interest_rate must be a non-negative number/i);

      expect(() =>
        updateDebt(db, debt.id, { due_day: 0 })
      ).toThrow(/due_day must be an integer between 1 and 31/i);

      expect(() =>
        updateDebt(db, debt.id, { due_day: 32 })
      ).toThrow(/due_day must be an integer between 1 and 31/i);

      expect(() =>
        updateDebt(db, debt.id, { due_day: 15.5 })
      ).toThrow(/due_day must be an integer between 1 and 31/i);
    });

    it('should delete debt and cascade delete associated payments', () => {
      const debt = createDebt(db, {
        category_id: loanCategoryId,
        name: 'Short Debt',
        total_amount: 1000,
        monthly_payment: 100,
      });

      recordPayment(db, {
        debt_id: debt.id,
        amount: 100,
        currency: 'USD',
        payment_date: '2026-09-01',
        month_period: '2026-09',
      });

      const deleted = deleteDebt(db, debt.id);
      expect(deleted).toBe(true);

      expect(getDebtById(db, debt.id)).toBeNull();

      const remainingPayments = db
        .prepare('SELECT * FROM payments WHERE debt_id = ?')
        .all(debt.id);
      expect(remainingPayments.length).toBe(0);

      expect(deleteDebt(db, 99999)).toBe(false);
    });
  });

  describe('Payments & Atomic Transactions', () => {
    let debtId: number;

    beforeEach(() => {
      const categories = listCategories(db);
      const catId = categories[0].id;
      const debt = createDebt(db, {
        category_id: catId,
        name: 'Car Finance',
        total_amount: 5000,
        remaining_balance: 1000,
        monthly_payment: 250,
        currency: 'USD',
      });
      debtId = debt.id;
    });

    it('should atomically record payment and decrement remaining_balance', () => {
      const { payment, debt } = recordPayment(db, {
        debt_id: debtId,
        amount: 250,
        currency: 'USD',
        payment_date: '2026-09-10',
        month_period: '2026-09',
        notes: 'September regular payment',
      });

      expect(payment.id).toBeGreaterThan(0);
      expect(payment.debt_id).toBe(debtId);
      expect(payment.amount).toBe(250);
      expect(payment.currency).toBe('USD');
      expect(payment.payment_date).toBe('2026-09-10');
      expect(payment.month_period).toBe('2026-09');
      expect(payment.notes).toBe('September regular payment');

      expect(debt.remaining_balance).toBe(750);
      expect(debt.is_active).toBe(1);

      // Verify in DB directly
      const refreshedDebt = getDebtById(db, debtId);
      expect(refreshedDebt!.remaining_balance).toBe(750);
      expect(refreshedDebt!.is_active).toBe(1);
    });

    it('should mark debt as paid off (is_active = 0) when payment clears remaining_balance', () => {
      const { debt } = recordPayment(db, {
        debt_id: debtId,
        amount: 1000,
        currency: 'USD',
        payment_date: '2026-09-15',
        month_period: '2026-09',
      });

      expect(debt.remaining_balance).toBe(0);
      expect(debt.is_active).toBe(0);

      const dbDebt = getDebtById(db, debtId)!;
      expect(dbDebt.remaining_balance).toBe(0);
      expect(dbDebt.is_active).toBe(0);
    });

    it('should clamp remaining_balance to 0 when payment exceeds remaining_balance', () => {
      const { debt } = recordPayment(db, {
        debt_id: debtId,
        amount: 1500, // exceeds remaining 1000
        currency: 'USD',
        payment_date: '2026-09-15',
        month_period: '2026-09',
      });

      expect(debt.remaining_balance).toBe(0);
      expect(debt.is_active).toBe(0);
    });

    it('should support camelCase input aliases in recordPayment', () => {
      const { payment, debt } = recordPayment(db, {
        debtId,
        amount: 300,
        currency: 'USD',
        paymentDate: '2026-09-12',
        monthPeriod: '2026-09',
      } as any);

      expect(payment.amount).toBe(300);
      expect(debt.remaining_balance).toBe(700);
    });

    it('should throw an error when debt is not found or payment amount is non-positive', () => {
      expect(() =>
        recordPayment(db, {
          debt_id: 99999,
          amount: 100,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        })
      ).toThrow(/debt not found/i);

      expect(() =>
        recordPayment(db, {
          debt_id: debtId,
          amount: 0,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        })
      ).toThrow(/amount must be positive/i);

      expect(() =>
        recordPayment(db, {
          debt_id: debtId,
          amount: -50,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        })
      ).toThrow(/amount must be positive/i);
    });

    it('should atomically revert payment and restore debt remaining_balance', () => {
      const { payment } = recordPayment(db, {
        debt_id: debtId,
        amount: 400,
        currency: 'USD',
        payment_date: '2026-09-10',
        month_period: '2026-09',
      });

      const { success, debt: restoredDebt } = revertPayment(db, payment.id);

      expect(success).toBe(true);
      expect(restoredDebt.remaining_balance).toBe(1000); // 600 + 400 = 1000
      expect(restoredDebt.is_active).toBe(1);

      // Verify payment was deleted
      const paymentRow = db
        .prepare('SELECT * FROM payments WHERE id = ?')
        .get(payment.id);
      expect(paymentRow).toBeUndefined();
    });

    it('should reactivate a debt (is_active = 1) when reverting a payment that previously paid it off', () => {
      // Pay off completely
      const { payment } = recordPayment(db, {
        debt_id: debtId,
        amount: 1000,
        currency: 'USD',
        payment_date: '2026-09-10',
        month_period: '2026-09',
      });

      expect(getDebtById(db, debtId)!.is_active).toBe(0);

      // Revert payment
      const { success, debt: reactivated } = revertPayment(db, payment.id);
      expect(success).toBe(true);
      expect(reactivated.remaining_balance).toBe(1000);
      expect(reactivated.is_active).toBe(1);

      const dbDebt = getDebtById(db, debtId)!;
      expect(dbDebt.remaining_balance).toBe(1000);
      expect(dbDebt.is_active).toBe(1);
    });

    it('should throw when reverting a non-existent payment', () => {
      expect(() => revertPayment(db, 99999)).toThrow(/payment not found/i);
    });

    it('should roll back completely if an error occurs mid-transaction during recordPayment', () => {
      // Trigger error before debt update to verify atomicity
      db.prepare(`
        CREATE TRIGGER fail_debt_update BEFORE UPDATE ON debts
        BEGIN
          SELECT RAISE(ABORT, 'Simulated mid-transaction error');
        END;
      `).run();

      expect(() =>
        recordPayment(db, {
          debt_id: debtId,
          amount: 250,
          currency: 'USD',
          payment_date: '2026-09-10',
          month_period: '2026-09',
        })
      ).toThrow(/Simulated mid-transaction error/i);

      // Verify no payment was created
      const payments = db.prepare('SELECT * FROM payments WHERE debt_id = ?').all(debtId);
      expect(payments.length).toBe(0);

      // Verify debt remaining_balance was NOT modified
      const debt = getDebtById(db, debtId)!;
      expect(debt.remaining_balance).toBe(1000);
      expect(debt.is_active).toBe(1);

      // Clean up trigger
      db.prepare('DROP TRIGGER fail_debt_update').run();
    });

    it('should roll back completely if an error occurs mid-transaction during revertPayment', () => {
      const { payment } = recordPayment(db, {
        debt_id: debtId,
        amount: 250,
        currency: 'USD',
        payment_date: '2026-09-10',
        month_period: '2026-09',
      });

      // Create a trigger that fails when deleting from payments
      db.prepare(`
        CREATE TRIGGER fail_payment_delete BEFORE DELETE ON payments
        BEGIN
          SELECT RAISE(ABORT, 'Simulated revert error');
        END;
      `).run();

      expect(() => revertPayment(db, payment.id)).toThrow(/Simulated revert error/i);

      // Verify payment was NOT deleted
      const paymentRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
      expect(paymentRow).toBeDefined();

      // Verify debt balance was NOT modified by aborted revert
      const debt = getDebtById(db, debtId)!;
      expect(debt.remaining_balance).toBe(750);

      // Clean up trigger
      db.prepare('DROP TRIGGER fail_payment_delete').run();
    });

    it('should query payment history using helper functions', () => {
      recordPayment(db, {
        debt_id: debtId,
        amount: 100,
        currency: 'USD',
        payment_date: '2026-08-10',
        month_period: '2026-08',
      });
      recordPayment(db, {
        debt_id: debtId,
        amount: 150,
        currency: 'USD',
        payment_date: '2026-09-10',
        month_period: '2026-09',
      });

      const debtPayments = getPaymentsByDebtId(db, debtId);
      expect(debtPayments.length).toBe(2);

      const augPayments = getPaymentsByMonth(db, '2026-08');
      expect(augPayments.length).toBe(1);
      expect(augPayments[0].amount).toBe(100);

      const sepPayments = getPaymentsByMonth(db, '2026-09');
      expect(sepPayments.length).toBe(1);
      expect(sepPayments[0].amount).toBe(150);
    });
  });

  describe('listDebtsWithMonthlyStatus', () => {
    let catId: number;
    let debt1: any;
    let debt2: any;

    beforeEach(() => {
      const categories = listCategories(db);
      catId = categories[0].id;

      debt1 = createDebt(db, {
        category_id: catId,
        name: 'Mortgage',
        total_amount: 300000,
        remaining_balance: 250000,
        monthly_payment: 1200,
        currency: 'USD',
        due_day: 5,
      });

      debt2 = createDebt(db, {
        category_id: catId,
        name: 'Personal Loan EUR',
        total_amount: 10000,
        remaining_balance: 8000,
        monthly_payment: 400,
        currency: 'EUR',
        due_day: 15,
      });
    });

    it('should return debts with is_paid = false when no payment exists for the month', () => {
      const debts = listDebtsWithMonthlyStatus(db, '2026-09', 'USD');
      expect(debts.length).toBe(2);

      const d1 = debts.find((d) => d.id === debt1.id)!;
      expect(d1.is_paid).toBe(false);
      expect(d1.paid_amount).toBe(0);
      expect(d1.paid_at).toBeNull();
      expect(d1.payment_id).toBeNull();
      expect(d1.category_name).toBeDefined();
      expect(d1.converted_monthly_payment).toBe(1200);
      expect(d1.converted_remaining_balance).toBe(250000);

      // EUR debt converted to USD (EUR rate is 0.85 against USD: 400 / 0.85 = 470.59)
      const d2 = debts.find((d) => d.id === debt2.id)!;
      expect(d2.is_paid).toBe(false);
      expect(d2.converted_monthly_payment).toBe(470.59);
      expect(d2.converted_remaining_balance).toBe(9411.76);
    });

    it('should return is_paid = true and payment details when payment exists', () => {
      const { payment } = recordPayment(db, {
        debt_id: debt1.id,
        amount: 1200,
        currency: 'USD',
        payment_date: '2026-09-04',
        month_period: '2026-09',
      });

      const debts = listDebtsWithMonthlyStatus(db, '2026-09', 'USD');
      const d1 = debts.find((d) => d.id === debt1.id)!;

      expect(d1.is_paid).toBe(true);
      expect(d1.paid_amount).toBe(1200);
      expect(d1.paid_at).toBe('2026-09-04');
      expect(d1.payment_id).toBe(payment.id);

      // In a different month, debt1 should be unpaid
      const octDebts = listDebtsWithMonthlyStatus(db, '2026-10', 'USD');
      const d1Oct = octDebts.find((d) => d.id === debt1.id)!;
      expect(d1Oct.is_paid).toBe(false);
      expect(d1Oct.paid_amount).toBe(0);
    });

    it('should include debt that was paid off in this month', () => {
      // Pay off debt2 in September
      recordPayment(db, {
        debt_id: debt2.id,
        amount: 8000,
        currency: 'EUR',
        payment_date: '2026-09-12',
        month_period: '2026-09',
      });

      const refreshedDebt2 = getDebtById(db, debt2.id)!;
      expect(refreshedDebt2.is_active).toBe(0);

      // Should still be visible in September with is_paid = true
      const sepDebts = listDebtsWithMonthlyStatus(db, '2026-09', 'USD');
      const d2Sep = sepDebts.find((d) => d.id === debt2.id);
      expect(d2Sep).toBeDefined();
      expect(d2Sep!.is_paid).toBe(true);
      expect(d2Sep!.paid_amount).toBe(8000);

      // In October, because it is inactive and has no payment in October, it should not appear
      const octDebts = listDebtsWithMonthlyStatus(db, '2026-10', 'USD');
      const d2Oct = octDebts.find((d) => d.id === debt2.id);
      expect(d2Oct).toBeUndefined();
    });

    it('should convert debts to requested baseCurrency (e.g. EUR)', () => {
      const debts = listDebtsWithMonthlyStatus(db, '2026-09', 'EUR');
      const d1 = debts.find((d) => d.id === debt1.id)!;

      // 1200 USD -> EUR at 0.85 = 1020.00
      expect(d1.converted_monthly_payment).toBe(1020);
      // 250000 USD -> EUR at 0.85 = 212500.00
      expect(d1.converted_remaining_balance).toBe(212500);

      const d2 = debts.find((d) => d.id === debt2.id)!;
      // EUR -> EUR: exact
      expect(d2.converted_monthly_payment).toBe(400);
      expect(d2.converted_remaining_balance).toBe(8000);
    });
  });

  describe('Monthly Summary & Multi-Currency Aggregations', () => {
    let loanCatId: number;
    let cardCatId: number;

    beforeEach(() => {
      const categories = listCategories(db);
      loanCatId = categories.find((c) => c.name === 'Loans')!.id;
      cardCatId = categories.find((c) => c.name === 'Credit Cards')!.id;

      // Debt 1 (USD): remaining 10,000, monthly 500
      createDebt(db, {
        category_id: loanCatId,
        name: 'Bank Loan',
        total_amount: 12000,
        remaining_balance: 10000,
        monthly_payment: 500,
        currency: 'USD',
      });

      // Debt 2 (USD): remaining 2,000, monthly 150
      createDebt(db, {
        category_id: cardCatId,
        name: 'Visa Card',
        total_amount: 3000,
        remaining_balance: 2000,
        monthly_payment: 150,
        currency: 'USD',
      });

      // Debt 3 (EUR): remaining 1,700 EUR, monthly 85 EUR (USD rate: 0.85 => 1700 EUR = 2000 USD, 85 EUR = 100 USD)
      createDebt(db, {
        category_id: cardCatId,
        name: 'Euro Card',
        total_amount: 2550,
        remaining_balance: 1700,
        monthly_payment: 85,
        currency: 'EUR',
      });
    });

    it('should calculate initial monthly summary before any payments in USD', () => {
      // Rates: EUR: 0.85
      // Total debt in USD: 10000 + 2000 + (1700 / 0.85) = 10000 + 2000 + 2000 = 14000
      // Monthly obligations in USD: 500 + 150 + (85 / 0.85) = 500 + 150 + 100 = 750
      // Paid this month: 0
      // Pending this month: 750
      // Percentage paid: 0
      const summary = getMonthlySummary(db, '2026-09', 'USD');

      expect(summary.month).toBe('2026-09');
      expect(summary.base_currency).toBe('USD');
      expect(summary.total_debt).toBe(14000);
      expect(summary.monthly_obligations).toBe(750);
      expect(summary.paid_this_month).toBe(0);
      expect(summary.pending_this_month).toBe(750);
      expect(summary.percentage_paid).toBe(0);

      // Check category breakdown
      expect(summary.category_breakdown.length).toBeGreaterThanOrEqual(2);

      const loans = summary.category_breakdown.find((c) => c.category_name === 'Loans')!;
      expect(loans.total_due).toBe(500);
      expect(loans.total_paid).toBe(0);
      expect(loans.remaining_balance).toBe(10000);

      const cards = summary.category_breakdown.find((c) => c.category_name === 'Credit Cards')!;
      // Cards total due: 150 (USD) + 100 (EUR converted) = 250
      expect(cards.total_due).toBe(250);
      expect(cards.total_paid).toBe(0);
      // Cards remaining: 2000 (USD) + 2000 (EUR converted) = 4000
      expect(cards.remaining_balance).toBe(4000);
    });

    it('should accurately reflect recorded payments in summary', () => {
      const debts = listDebtsWithMonthlyStatus(db, '2026-09', 'USD');
      const bankLoan = debts.find((d) => d.name === 'Bank Loan')!;
      const euroCard = debts.find((d) => d.name === 'Euro Card')!;

      // Pay 500 USD for bank loan
      recordPayment(db, {
        debt_id: bankLoan.id,
        amount: 500,
        currency: 'USD',
        payment_date: '2026-09-05',
        month_period: '2026-09',
      });

      // Pay 85 EUR for euro card (converts to 100 USD at 0.85)
      recordPayment(db, {
        debt_id: euroCard.id,
        amount: 85,
        currency: 'EUR',
        payment_date: '2026-09-08',
        month_period: '2026-09',
      });

      const summary = getMonthlySummary(db, '2026-09', 'USD');

      // Total debt decreased:
      // bank loan remaining: 9500
      // euro card remaining: 1700 - 85 = 1615 EUR -> 1615 / 0.85 = 1900 USD
      // visa card remaining: 2000 USD
      // total = 9500 + 1900 + 2000 = 13400 USD
      expect(summary.total_debt).toBe(13400);

      // Monthly obligations: 750
      expect(summary.monthly_obligations).toBe(750);

      // Paid this month: 500 + 100 = 600
      expect(summary.paid_this_month).toBe(600);

      // Pending this month: 750 - 600 = 150
      expect(summary.pending_this_month).toBe(150);

      // Percentage paid: (600 / 750) * 100 = 80%
      expect(summary.percentage_paid).toBe(80);

      // Check category breakdown totals
      const loans = summary.category_breakdown.find((c) => c.category_name === 'Loans')!;
      expect(loans.total_paid).toBe(500);
      expect(loans.remaining_balance).toBe(9500);

      const cards = summary.category_breakdown.find((c) => c.category_name === 'Credit Cards')!;
      expect(cards.total_paid).toBe(100);
      expect(cards.remaining_balance).toBe(3900); // 2000 + 1900
    });

    it('should convert entire monthly summary into EUR base currency', () => {
      // In EUR base currency:
      // USD -> EUR conversion multiplier: 0.85
      // Total debt in EUR: 14000 USD * 0.85 = 11900 EUR
      // Monthly obligations in EUR: 750 USD * 0.85 = 637.50 EUR
      const summary = getMonthlySummary(db, '2026-09', 'EUR');

      expect(summary.base_currency).toBe('EUR');
      expect(summary.total_debt).toBe(11900);
      expect(summary.monthly_obligations).toBe(637.5);
      expect(summary.paid_this_month).toBe(0);
      expect(summary.pending_this_month).toBe(637.5);
    });

    it('should handle pending_this_month not going below 0 when paid exceeds obligations', () => {
      const debts = listDebtsWithMonthlyStatus(db, '2026-09', 'USD');
      const bankLoan = debts.find((d) => d.name === 'Bank Loan')!;

      // Pay 1000 USD on bank loan (monthly payment was 500)
      recordPayment(db, {
        debt_id: bankLoan.id,
        amount: 1000,
        currency: 'USD',
        payment_date: '2026-09-05',
        month_period: '2026-09',
      });

      // Total obligations: 750
      // Paid: 1000
      // Pending: max(0, 750 - 1000) = 0
      const summary = getMonthlySummary(db, '2026-09', 'USD');
      expect(summary.paid_this_month).toBe(1000);
      expect(summary.pending_this_month).toBe(0);
      expect(summary.percentage_paid).toBeGreaterThanOrEqual(100);
    });
  });
});
