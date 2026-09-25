# Pawning Debt Feature Design Specification

* **Date:** 2026-09-25
* **Feature:** Pawning Balance, Monthly Compounding Interest, Base Amount Adjustments & Done Marking
* **Status:** Validated Design / Ready for Implementation Planning

---

## 1. Overview & Goals

The Debt Management Application currently supports standard debts (fixed installment loans, revolving credit cards, subscriptions). This feature introduces first-class support for **Pawning Debts** (such as gold, jewelry, or collateral loans).

### Key Objectives
1. **Pawn Balance & Monthly Interest:** Users can record a pawning debt with a base principal amount (borrowed balance) and a monthly interest rate percentage (e.g., 2% per month).
2. **Dynamic Monthly Compounding:** If monthly interest is not paid in a given month, that unpaid interest automatically compounds into following months' total debt.
3. **Monthly Interest as Monthly Obligation:** For any calendar month viewed, the monthly payment obligation is that month's interest due. Paying it satisfies the interest for that month and prevents it from compounding further.
4. **Editable Base Amount Anytime:** Users can update the base principal amount at any time; all subsequent interest and total debt recalculations adjust immediately with zero state drift.
5. **Mark Done / Redeem Pawn:** Users can mark a pawning debt as done/redeemed at any time, which marks it inactive (`is_active = 0`) and clears it from active obligations.
6. **Unified Analytics & Multi-Currency:** Pawning debts seamlessly integrate with existing multi-currency conversion, KPI summary cards, and category breakdowns.

---

## 2. Architecture & Data Model

### 2.1 Database Schema Changes (`debts` table)
Add a `debt_type` column to the `debts` table:
```sql
ALTER TABLE debts ADD COLUMN debt_type TEXT NOT NULL DEFAULT 'standard';
```
Allowed values:
* `'standard'`: Regular loans, credit cards, installments.
* `'pawning'`: Collateralized pawn debts with monthly compounding interest.

### 2.2 Default Category Seed
Seed a default `"Pawning"` category in SQLite:
```sql
INSERT OR IGNORE INTO categories (name, color, icon) VALUES
  ('Pawning', '#F59E0B', 'gem');
```

### 2.3 Semantic Field Mapping for Pawning Debts
| Column | Standard Debt Role | Pawning Debt Role |
| :--- | :--- | :--- |
| `total_amount` | Original total loan / limit | Base Pawn Principal (borrowed amount) |
| `remaining_balance` | Current remaining principal | Base principal balance (excluding future interest) |
| `monthly_payment` | Fixed installment / minimum due | Stored initial interest; dynamically computed per month |
| `interest_rate` | Annual APR (or 0) | Monthly Interest Rate % (e.g. 2.0 = 2%/mo) |
| `start_month` | Agreement origination (YYYY-MM) | Pawn agreement start month (YYYY-MM) |
| `debt_type` | `'standard'` | `'pawning'` |
| `is_active` | 1 if balance > 0, else 0 | 1 while active; 0 when marked "Done" |

---

## 3. Calculation Engine & Compounding Algorithm

### 3.1 Month-by-Month Compounding Simulation
When querying monthly status for a target month $M$ (`YYYY-MM`) via `listDebtsWithMonthlyStatus(db, targetMonth, baseCurrency)` and `getMonthlySummary(db, targetMonth, baseCurrency)`:

For each debt where `debt_type === 'pawning'`:
1. Start at `m = debt.start_month` with `balance = debt.total_amount` (or `remaining_balance`).
2. If `debt.interest_rate` is $r$, the interest rate fraction is $R = \frac{r}{100}$.
3. For each elapsed month $m$ from `debt.start_month` up to $M$:
   * Interest accrued for month $m$:
     $$I_m = \text{round}(\text{balance} \times R, 2)$$
   * Fetch payment made for this debt in month period $m$ from the `payments` table.
   * If $m < M$ (a past month):
     * If payment made $\ge I_m$: interest was paid. The excess (if any) reduces base principal. Unpaid interest = 0.
     * If payment made $< I_m$ (or 0): unpaid interest is $I_m - \text{payment}$. This unpaid interest compounds into the balance for subsequent months:
       $$\text{balance} = \text{balance} + (I_m - \text{payment})$$
   * If $m = M$ (the current viewed month):
     * **Monthly Payment Obligation:** $I_M = \text{round}(\text{balance} \times R, 2)$
     * **Total Debt:** $\text{balance}$ (includes base principal + all accumulated compounded interest)
     * **Accrued Interest:** $\text{balance} - \text{debt.total\_amount}$
     * **Is Paid:** `true` if a payment $\ge I_M$ is recorded for month $M$; else `false`.

### 3.2 Base Amount Adjustments Anytime
* When editing a pawn debt, updating `total_amount` (and base `remaining_balance`) updates the SQLite record.
* Because the compounding algorithm is deterministic and calculates based on `total_amount` and the historical payment ledger, updating the base amount immediately cascades across all months with zero drift.

### 3.3 Marking Done / Redeeming
* When marked "Done", `is_active` is updated to `0` and `remaining_balance` is set to `0`.
* The debt is excluded from active monthly obligations and active total debt.
* Can be reactivated / reopened if marked done by mistake.

---

## 4. User Interface & Experience

### 4.1 Debt Modal (`DebtModal.tsx`)
* **Debt Type Selector:** Tabs or toggle between **"Standard Debt"** and **"Pawning"**.
* When **Pawning** is selected:
  * Category automatically defaults to **"Pawning"**.
  * Total Amount label becomes: **"Pawn Base Amount / Principal"**
  * Interest Rate label becomes: **"Monthly Interest Rate (% / month)"** (e.g. `2.0%`)
  * Dynamic helper shows live calculation:
    $$\text{Estimated Monthly Interest} = \text{Base Amount} \times \text{Monthly Rate}$$
  * Term months / installment calculator is hidden.
  * Start Month selector remains available to allow back-dating.

### 4.2 Debt Card (`DebtCard.tsx`)
* **Badge:** Amber badge **"Pawning"** with `gem` or `sparkles` icon.
* **Monthly Due:** Displays **"Monthly Interest: [Formatted Amount]"**.
* **Balance Breakdown:**
  * Displays Total Pawn Debt with clear subtext:
    e.g., `Base: $1,000.00 | Compounded Interest: +$40.40 | Total: $1,040.40`.
* **Action Buttons:**
  * **"Pay Interest" / "Mark Paid":** Marks the current month's interest as paid.
  * **"Mark Done" (Redeem):** Modal/confirmation button to mark the pawn as completed/settled.
  * **"Undo":** Reverts payment or reactivates pawn if marked done.
  * **"Edit":** Direct access to edit base amount or monthly interest rate anytime.

---

## 5. API Endpoints & Error Handling

### 5.1 Endpoints
* `POST /api/debts`:
  * Accepts `debt_type: 'standard' | 'pawning'`.
  * If `pawning`, initializes `monthly_payment` to first month's interest: $\text{round}(P \times R, 2)$.
* `PUT /api/debts/:id`:
  * Supports updating `debt_type`, `total_amount`, `interest_rate`, `notes`, `is_active`.
* `GET /api/debts?month=YYYY-MM`:
  * Returns debts with monthly compounding calculated for each active pawning debt.
* `GET /api/summary?month=YYYY-MM`:
  * Sums total debt (including pawning compounded debt) and monthly obligations (including pawning interest due) converted to base currency.

### 5.2 Error Handling & Validation
* `debt_type` must be `'standard'` or `'pawning'`.
* `total_amount` must be $\ge 0$.
* `interest_rate` must be $\ge 0$.
* When `debt_type === 'pawning'`, `monthly_payment` is auto-computed if omitted.

---

## 6. Testing & Quality Assurance
1. **Database & Schema Tests:**
   * Verify column migration adds `debt_type` without data loss.
   * Verify default `'Pawning'` category is inserted.
2. **Compounding Algorithm Tests:**
   * Test 3-month compounding with 0 payments: $1000 \rightarrow 1020 \rightarrow 1040.40 \rightarrow 1061.21$.
   * Test 3-month timeline where month 1 & month 2 interest was paid: verify balance remains $1000 and month 3 interest is $20.
3. **Base Amount Adjustment Tests:**
   * Update base amount from $1000 to $1500; verify subsequent month interest adjusts immediately from $20 to $30.
4. **Mark Done Tests:**
   * Mark pawn as done; verify excluded from active debts and monthly obligations.
5. **Frontend Build & TypeScript Tests:**
   * Run `npm test` and `npm run build --prefix client` to ensure 100% build cleanliness.
