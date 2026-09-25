# Pawning Debt Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class pawning debt management with monthly compounding interest, base balance adjustments, interest payment tracking, and mark done/redeemed workflow.

**Architecture:** Extend SQLite schema with `debt_type` (`'standard' | 'pawning'`) and default "Pawning" category. Implement a deterministic, zero-drift month-by-month compounding simulation engine in `src/services/debt.ts` that dynamically calculates monthly interest obligations and accumulated debt across calendar months based on historical payments and base principal. Expose dedicated UI controls in `DebtModal.tsx` and rich pawning cards with interest payment and "Mark Done" in `DebtCard.tsx`.

**Tech Stack:** TypeScript, Node.js, Express, SQLite (`better-sqlite3`), Vitest, React 18, Vite, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-25-pawning-debt-feature-design.md`

## Global Constraints
- Database schema migration must be backwards-compatible and idempotent using PRAGMA check on `debts` table.
- All backend calculations must support multi-currency conversion to user-selected base currency.
- All monetary amounts in calculations must be rounded to 2 decimal places (`Math.round(val * 100) / 100`).
- No placeholders or stubbed logic (`TODO`/`TBD`). Every test and implementation step must be fully written.

---

### Task 1: Schema Migration & Types (Database, Category Seed & Core Types)

**Files:**
- Modify: `src/types.ts`
- Modify: `client/src/types.ts`
- Modify: `src/db/index.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `DebtType` (`'standard' | 'pawning'`), `Debt.debt_type`, `CreateDebtInput.debt_type`, `UpdateDebtInput.debt_type`, `DebtWithMonthlyStatus.accrued_interest`, `DebtWithMonthlyStatus.total_pawn_payoff`.

- [ ] **Step 1: Write the failing test for schema migration and pawning category seed**

In `tests/db.test.ts`, add:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL (column `debt_type` not found, category Pawning not found).

- [ ] **Step 3: Update types and database initialization**

In `src/types.ts` and `client/src/types.ts`, add:
```ts
export type DebtType = 'standard' | 'pawning';
```
Update `Debt`, `CreateDebtInput`, and `UpdateDebtInput` to include `debt_type?: DebtType;` (and `debtType?: DebtType;`).
Update `DebtWithMonthlyStatus` to include `accrued_interest?: number;` and `total_pawn_payoff?: number;`.

In `src/db/index.ts`:
1. In `SCHEMA_SQL`, add `('Pawning', '#F59E0B', 'gem')` to category seeds.
2. In `SCHEMA_SQL`, add `debt_type TEXT NOT NULL DEFAULT 'standard'` to `debts` table definition.
3. In `initDb()`, under table migration:
```ts
const hasDebtType = tableInfo.some((col) => col.name === 'debt_type');
if (!hasDebtType && tableInfo.length > 0) {
  db.prepare("ALTER TABLE debts ADD COLUMN debt_type TEXT NOT NULL DEFAULT 'standard'").run();
}
// Seed default Pawning category if missing in existing database
db.prepare("INSERT OR IGNORE INTO categories (name, color, icon) VALUES ('Pawning', '#F59E0B', 'gem')").run();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts client/src/types.ts src/db/index.ts tests/db.test.ts
git commit -m "feat(db): add debt_type column and Pawning category seed"
```

---

### Task 2: Backend Pawning Creation, Update & Validation

**Files:**
- Modify: `src/services/debt.ts`
- Modify: `src/routes/api.ts`
- Test: `tests/debt.test.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `DebtType` from `src/types.ts`.
- Produces: `createDebt` with `debt_type`, `updateDebt` with `debt_type` and base amount recalculation, `is_active = 0` for marking done.

- [ ] **Step 1: Write the failing tests for createDebt and updateDebt with debt_type**

In `tests/debt.test.ts`:
```ts
it('should create a pawning debt and auto-initialize monthly payment from interest rate', () => {
  const db = initDb(':memory:');
  const cat = createCategory(db, { name: 'Pawn Shop' });
  const debt = createDebt(db, {
    category_id: cat.id,
    name: 'Gold Ring Pawn',
    total_amount: 1000,
    monthly_payment: 0,
    interest_rate: 2.5,
    start_month: '2026-01',
    debt_type: 'pawning',
  });

  expect(debt.debt_type).toBe('pawning');
  expect(debt.total_amount).toBe(1000);
  expect(debt.remaining_balance).toBe(1000);
  expect(debt.interest_rate).toBe(2.5);
  expect(debt.monthly_payment).toBe(25); // 1000 * 2.5% = 25
});

it('should update pawning debt base amount and adjust initial monthly payment', () => {
  const db = initDb(':memory:');
  const cat = createCategory(db, { name: 'Pawn Shop' });
  const debt = createDebt(db, {
    category_id: cat.id,
    name: 'Gold Ring Pawn',
    total_amount: 1000,
    monthly_payment: 25,
    interest_rate: 2.5,
    debt_type: 'pawning',
  });

  const updated = updateDebt(db, debt.id, {
    total_amount: 1500,
    remaining_balance: 1500,
  });

  expect(updated.total_amount).toBe(1500);
  expect(updated.remaining_balance).toBe(1500);
  expect(updated.monthly_payment).toBe(37.5); // 1500 * 2.5% = 37.5
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/debt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal code in `src/services/debt.ts` and `src/routes/api.ts`**

In `src/services/debt.ts`:
1. In `createDebt`:
```ts
const debt_type = (raw.debt_type ?? raw.debtType ?? 'standard').trim().toLowerCase();
if (debt_type !== 'standard' && debt_type !== 'pawning') {
  throw new Error("debt_type must be either 'standard' or 'pawning'");
}
let monthly_payment = raw.monthly_payment ?? raw.monthlyPayment;
if (debt_type === 'pawning') {
  if (monthly_payment === undefined || monthly_payment === null || monthly_payment === 0) {
    monthly_payment = Math.round(total_amount * ((interest_rate || 0) / 100) * 100) / 100;
  }
}
```
Include `debt_type` in the `INSERT INTO debts` statement.

2. In `updateDebt`:
```ts
const debt_type = (raw.debt_type ?? raw.debtType ?? existing.debt_type ?? 'standard').trim().toLowerCase();
if (debt_type !== 'standard' && debt_type !== 'pawning') {
  throw new Error("debt_type must be either 'standard' or 'pawning'");
}
let monthly_payment = raw.monthly_payment ?? raw.monthlyPayment ?? existing.monthly_payment;
if (debt_type === 'pawning' && (raw.total_amount !== undefined || raw.interest_rate !== undefined) && raw.monthly_payment === undefined) {
  monthly_payment = Math.round(total_amount * ((interest_rate || 0) / 100) * 100) / 100;
}
```
Include `debt_type` in the `UPDATE debts` statement.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/debt.test.ts tests/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/debt.ts src/routes/api.ts tests/debt.test.ts tests/api.test.ts
git commit -m "feat(debt): add pawning debt creation, validation, and base amount updates"
```

---

### Task 3: Pawning Compounding Engine & Monthly Status Calculations

**Files:**
- Modify: `src/services/debt.ts`
- Test: `tests/debt.test.ts`

**Interfaces:**
- Produces: `calculatePawningState(debt, targetMonth, payments)` helper function.
- Produces: `listDebtsWithMonthlyStatus` with compounding balance, monthly interest due, accrued interest, and payment status for pawning debts.

- [ ] **Step 1: Write the failing tests for pawning compounding over elapsed months**

In `tests/debt.test.ts`:
```ts
it('should compound unpaid monthly interest across following months for pawning debts', () => {
  const db = initDb(':memory:');
  const cat = createCategory(db, { name: 'Pawn Shop' });
  const debt = createDebt(db, {
    category_id: cat.id,
    name: 'Gold Pawn',
    total_amount: 1000,
    interest_rate: 2, // 2% per month
    start_month: '2026-01',
    debt_type: 'pawning',
    monthly_payment: 20,
  });

  // Query month 2026-01: Month 1
  // Principal: 1000, Interest due: 20. Total debt: 1000
  const m1 = listDebtsWithMonthlyStatus(db, '2026-01');
  const pawnM1 = m1.find((d) => d.id === debt.id)!;
  expect(pawnM1.monthly_payment).toBe(20);
  expect(pawnM1.remaining_balance).toBe(1000);
  expect(pawnM1.accrued_interest).toBe(0);
  expect(pawnM1.is_paid).toBe(false);

  // Query month 2026-02: Month 2 with Month 1 UNPAID
  // Compounded Balance: 1000 + 20 = 1020.
  // Interest due for Month 2: 1020 * 2% = 20.40.
  const m2 = listDebtsWithMonthlyStatus(db, '2026-02');
  const pawnM2 = m2.find((d) => d.id === debt.id)!;
  expect(pawnM2.remaining_balance).toBe(1020);
  expect(pawnM2.monthly_payment).toBe(20.4);
  expect(pawnM2.accrued_interest).toBe(20);
  expect(pawnM2.is_paid).toBe(false);

  // Query month 2026-03: Month 3 with Month 1 & Month 2 UNPAID
  // Compounded Balance: 1020 + 20.40 = 1040.40.
  // Interest due for Month 3: 1040.40 * 2% = 20.81.
  const m3 = listDebtsWithMonthlyStatus(db, '2026-03');
  const pawnM3 = m3.find((d) => d.id === debt.id)!;
  expect(pawnM3.remaining_balance).toBe(1040.4);
  expect(pawnM3.monthly_payment).toBe(20.81);
  expect(pawnM3.accrued_interest).toBe(40.4);
});

it('should NOT compound interest if previous months were paid', () => {
  const db = initDb(':memory:');
  const cat = createCategory(db, { name: 'Pawn Shop' });
  const debt = createDebt(db, {
    category_id: cat.id,
    name: 'Gold Pawn',
    total_amount: 1000,
    interest_rate: 2, // 2% per month
    start_month: '2026-01',
    debt_type: 'pawning',
    monthly_payment: 20,
  });

  // Pay Month 1 interest in 2026-01
  recordPayment(db, {
    debt_id: debt.id,
    amount: 20,
    currency: 'USD',
    payment_date: '2026-01-15',
    month_period: '2026-01',
  });

  // Query Month 2026-02:
  // Month 1 was paid, so balance remains 1000. Interest due is still 20!
  const m2 = listDebtsWithMonthlyStatus(db, '2026-02');
  const pawnM2 = m2.find((d) => d.id === debt.id)!;
  expect(pawnM2.remaining_balance).toBe(1000);
  expect(pawnM2.monthly_payment).toBe(20);
  expect(pawnM2.accrued_interest).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/debt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement compounding calculation engine in `src/services/debt.ts`**

In `src/services/debt.ts`:
1. Add helper to get months sequence:
```ts
export function getMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  let [currYear, currMonth] = startMonth.split('-').map(Number);
  const [endYear, endMonthNum] = endMonth.split('-').map(Number);

  while (currYear < endYear || (currYear === endYear && currMonth <= endMonthNum)) {
    months.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
    currMonth++;
    if (currMonth > 12) {
      currMonth = 1;
      currYear++;
    }
  }
  return months;
}

export function calculatePawningState(
  debt: { total_amount: number; remaining_balance: number; interest_rate: number | null; start_month: string },
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
```

2. Integrate into `listDebtsWithMonthlyStatus`:
Fetch payments for pawning debts, evaluate `calculatePawningState`, and assign:
- `monthly_payment = pawnState.monthlyInterest`
- `remaining_balance = pawnState.currentBalance`
- `accrued_interest = pawnState.accruedInterest`
- `total_pawn_payoff = pawnState.currentBalance`
- `is_paid = pawnState.isPaid`
- `paid_amount = pawnState.paidAmount`
- `paid_at = pawnState.paidAt`
- `payment_id = pawnState.paymentId`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/debt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/debt.ts tests/debt.test.ts
git commit -m "feat(debt): implement pawning compounding calculation engine"
```

---

### Task 4: Monthly Summary Aggregations with Pawning Debts

**Files:**
- Modify: `src/services/debt.ts`
- Test: `tests/debt.test.ts`

**Interfaces:**
- Produces: `getMonthlySummary` including pawning total debt and monthly interest obligations.

- [ ] **Step 1: Write the failing tests for getMonthlySummary with pawning debts**

In `tests/debt.test.ts`:
```ts
it('should include compounded pawning debt and monthly interest obligation in getMonthlySummary', () => {
  const db = initDb(':memory:');
  const cat = createCategory(db, { name: 'Pawn' });
  createDebt(db, {
    category_id: cat.id,
    name: 'Pawned Jewelry',
    total_amount: 1000,
    interest_rate: 2, // 2% per month
    start_month: '2026-01',
    debt_type: 'pawning',
  });

  // In Month 2 (2026-02), unpaid month 1 interest compounds:
  // Total Debt: 1020, Monthly Obligations: 20.40
  const summaryM2 = getMonthlySummary(db, '2026-02', 'USD');
  expect(summaryM2.total_debt).toBe(1020);
  expect(summaryM2.monthly_obligations).toBe(20.4);
  expect(summaryM2.paid_this_month).toBe(0);
  expect(summaryM2.pending_this_month).toBe(20.4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/debt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `getMonthlySummary` in `src/services/debt.ts`**

In `src/services/debt.ts`:
In `getMonthlySummary()`, load active pawning debts and calculate their current compounded balance and monthly interest due using `calculatePawningState()`. Add the compounded balance to `totalDebt` and monthly interest to `monthlyObligations`. Also ensure category breakdown reflects these adjusted numbers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/debt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/debt.ts tests/debt.test.ts
git commit -m "feat(summary): incorporate pawning compounding and interest in monthly summary"
```

---

### Task 5: Frontend Types & DebtModal Pawning Controls

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/components/DebtModal.tsx`
- Test: `tests/client-api.test.ts` or client build

**Interfaces:**
- Produces: Debt type selector (`Standard` vs `Pawning`), dynamic labels and monthly interest preview, hidden installment terms in pawning mode.

- [ ] **Step 1: Write client API tests or component test assertions**

In `tests/client-api.test.ts`:
Verify that `createDebt` and `updateDebt` can send `debt_type: 'pawning'`.

- [ ] **Step 2: Run test to verify client api supports debt_type**

Run: `npx vitest run tests/client-api.test.ts`
Expected: PASS (or update if payload types differ).

- [ ] **Step 3: Update `DebtModal.tsx`**

In `client/src/components/DebtModal.tsx`:
1. Add state: `const [debtType, setDebtType] = useState<DebtType>('standard');`
2. Populate `debtType` from `debt?.debt_type || 'standard'`.
3. Add a selector tab in the modal header:
   - **Standard Debt**
   - **Pawning**
4. When `debtType === 'pawning'`:
   - If no category selected, auto-select the "Pawning" category if available.
   - Change Total Amount label to: **"Pawn Base Amount / Principal"**.
   - Change Interest Rate label to: **"Monthly Interest Rate (% / month)"**.
   - Show dynamic live preview box:
     * *Monthly Interest:* `Base Amount × Rate% = $XX.XX / month`
   - Hide installment `term_months` / installment calculator.
5. In `handleSubmit`, pass `debt_type: debtType` and send computed `monthly_payment = Math.round(parseFloat(totalAmount) * (parseFloat(interestRate || '0') / 100) * 100) / 100`.

- [ ] **Step 4: Verify client builds clean with no TypeScript errors**

Run: `npm run build --prefix client`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/types.ts client/src/components/DebtModal.tsx
git commit -m "feat(ui): add pawning mode and controls to DebtModal"
```

---

### Task 6: Frontend DebtCard Pawning UI, Interest Payment & Mark Done Workflow

**Files:**
- Modify: `client/src/components/DebtCard.tsx`
- Modify: `client/src/components/DebtList.tsx`
- Modify: `client/src/App.tsx`
- Test: client build

**Interfaces:**
- Produces: Pawning badge and icon, compounded balance breakdown, "Pay Interest" / "Mark Paid" button, and "Mark Done" (redeem pawn) button with confirm prompt.

- [ ] **Step 1: Update `DebtCard.tsx`**

In `client/src/components/DebtCard.tsx`:
1. Check `const isPawning = debt.debt_type === 'pawning';`
2. For pawning debts:
   - Display a distinct badge: `<span className="bg-amber-100 text-amber-800 ..."><Gem className="w-3 h-3" /> Pawning</span>`.
   - In Due Date & Monthly Payment box:
     - Label as: **Monthly Interest** instead of Monthly Payment.
   - In Balance section:
     - Show: `Total Pawn Debt: [currency]`
     - Show breakdown subtitle: `Base: [base_amount] • Compounded Interest: +[accrued_interest]` if `debt.accrued_interest > 0`.
   - In actions toolbar:
     - Add a **"Mark Done" (Redeem)** button with a checkmark or flag icon.
     - When clicked, calls `onMarkDone(debt)` (which calls `updateDebt(debt.id, { is_active: 0, remaining_balance: 0 })`).
     - "Pay Interest" (or "Mark Paid") button records this month's interest payment using the existing `onMarkPaid` modal.

- [ ] **Step 2: Update `DebtList.tsx` & `App.tsx` to handle `onMarkDone`**

In `client/src/App.tsx`:
Implement `handleMarkDone(debt: DebtWithMonthlyStatus)`:
Opens confirmation dialog or directly calls `api.updateDebt(debt.id, { is_active: 0, remaining_balance: 0 })`, refetches debts and summary, with success toast.
Add an "Undo" / reactivate option if a pawn is marked done.

- [ ] **Step 3: Run client build to verify TypeScript compilation and bundle**

Run: `npm run build --prefix client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DebtCard.tsx client/src/components/DebtList.tsx client/src/App.tsx
git commit -m "feat(ui): add pawning debt card display, payment action, and mark done workflow"
```

---

### Task 7: Full System Verification & Regression Suite

**Files:**
- Modify: `tests/debt.test.ts`
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run complete frontend build**

Run: `npm run build --prefix client`
Expected: Successful build.

- [ ] **Step 3: Verify end-to-end integration**

Start app briefly or run integration tests checking:
- Creating pawning debt
- Compounding across 3 months
- Updating base amount and checking subsequent months
- Paying monthly interest in month 2
- Marking done
- Undo payment and reactivation

- [ ] **Step 4: Final commit and cleanup**

```bash
git add tests/
git commit -m "test: add comprehensive end-to-end test coverage for pawning feature"
```
