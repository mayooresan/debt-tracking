# Debt Management Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a secure, single-user debt management web app to track categorized debts (loans, credit cards, installments), calculate monthly obligations, check off monthly payments, and monitor total debt balances with multi-currency support on a DigitalOcean Droplet with Docker & Traefik.

**Architecture:** Express.js TypeScript backend serving a React (Vite + Tailwind CSS) single-page application backed by SQLite (`better-sqlite3`) with WAL mode. Authentication uses a master password (`AUTH_PASSWORD` in `.env`) verified with constant-time comparison and signed cookies. Packaged in a multi-stage Docker container configured for Traefik on `debt.jaymayu.com`.

**Tech Stack:** Node.js 20+, TypeScript, Express, better-sqlite3, Vitest, React 18, Vite, Tailwind CSS, Lucide React, Docker Compose, Traefik.

**Spec:** [`docs/superpowers/specs/2026-09-23-debt-management-app-design.md`](file:///Users/test/Documents/devexp/debt-management/docs/superpowers/specs/2026-09-23-debt-management-app-design.md)

## Global Constraints

- **Node Version:** Node.js >= 20.
- **Database File:** `/app/data/budget.db` (mapped via host volume `./data:/app/data`).
- **Auth Key:** `AUTH_PASSWORD` (with `APP_PASSWORD` fallback) in `.env`.
- **Domain & Routing:** Traefik routing rule `Host(`debt.jaymayu.com`)`, entrypoint `websecure`, certresolver `letsencrypt`, internal service port `3000`, network `web` (external).
- **Transactions:** All payment recordings and reversions must run inside atomic SQLite transactions (`BEGIN TRANSACTION ... COMMIT`).
- **Zero Data Loss:** Database schema migrations run on startup using `IF NOT EXISTS` without destructive drops.

---

### Task 1: Project Scaffolding & Root Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `.gitignore`

**Interfaces:**
- Consumes: None (initial setup)
- Produces: Build scripts (`npm run build`, `npm run dev`, `npm test`), environment configuration template, and Docker container definition.

- [ ] **Step 1: Create `.gitignore`**
Include `node_modules`, `dist`, `data`, `.env`, and test artifacts.

- [ ] **Step 2: Create root `package.json` and `tsconfig.json`**
Configure dependencies: `express`, `better-sqlite3`, `cookie-parser`, `dotenv`, `express-rate-limit`, `helmet`, `zod`, `vitest`, `typescript`, `@types/*`.

- [ ] **Step 3: Create `.env.example`**
Include `AUTH_PASSWORD`, `PORT=3000`, `DB_PATH=./data/budget.db`, `BASE_CURRENCY=USD`, `SESSION_SECRET=`.

- [ ] **Step 4: Create `docker-compose.yml` and `Dockerfile`**
Match the Traefik configuration, external network `web`, volume `./data:/app/data`, and multi-stage Alpine build.

- [ ] **Step 5: Install dependencies and verify build config**
Run: `npm install`
Expected: `package-lock.json` generated and dependencies resolved.

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example docker-compose.yml Dockerfile
git commit -m "chore: scaffold project structure and docker configuration"
```

---

### Task 2: Database Layer & Migrations

**Files:**
- Create: `src/types.ts`
- Create: `src/db/index.ts`
- Create: `tests/db.test.ts`

**Interfaces:**
- Consumes: SQLite via `better-sqlite3` and `DB_PATH` from environment.
- Produces: `getDb(dbPath?: string): Database`, `initDb(dbPath?: string): Database`, types for `Category`, `Debt`, `Payment`, `ExchangeRate`, `AppSettings`.

- [ ] **Step 1: Write failing database initialization test**
Test that `initDb(':memory:')` creates the tables: `categories`, `debts`, `payments`, `exchange_rates`, `app_settings` and seeds default categories ('Loans', 'Credit Cards', 'Installments', 'Subscriptions & Others').

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/db.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/types.ts` and `src/db/index.ts`**
Create TypeScript types for data models and write database initialization with WAL mode, foreign keys, schema creation, and seeding.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/types.ts src/db/index.ts tests/db.test.ts
git commit -m "feat(db): implement SQLite schema initialization and types"
```

---

### Task 3: Authentication & Security Service

**Files:**
- Create: `src/services/auth.ts`
- Create: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `AUTH_PASSWORD` and `SESSION_SECRET` from environment.
- Produces:
  - `verifyPassword(inputPassword: string): boolean`
  - `createSessionToken(secret: string): string`
  - `verifySessionToken(token: string, secret: string): boolean`
  - `authMiddleware(req, res, next)`

- [ ] **Step 1: Write failing authentication tests**
Test:
1. `verifyPassword` returns `true` for matching password, `false` for incorrect password (timing-safe).
2. `createSessionToken` creates a verifiable HMAC signature. Tampered tokens fail verification.
3. `authMiddleware` rejects requests without valid session cookie with 401.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/services/auth.ts`**
Implement SHA-256 + constant-time comparison via `crypto.timingSafeEqual`, cookie sign/verify using HMAC-SHA256, and Express middleware.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/auth.ts tests/auth.test.ts
git commit -m "feat(auth): implement master password verification and session middleware"
```

---

### Task 4: Currency Service & Exchange Rates

**Files:**
- Create: `src/services/currency.ts`
- Create: `tests/currency.test.ts`

**Interfaces:**
- Consumes: `getDb()` and external exchange rate API (`https://open.er-api.com/v6/latest/USD`).
- Produces:
  - `syncExchangeRates(db, force?: boolean): Promise<{ success: boolean, updatedCount: number }>`
  - `convertAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Map<string, number>): number`
  - `getExchangeRates(db): Map<string, number>`

- [ ] **Step 1: Write failing currency conversion and sync tests**
Test:
1. `convertAmount` converts accurately between currencies (e.g. EUR to USD, USD to GBP, EUR to GBP) using base USD rate table.
2. Identical currency returns original amount (`convertAmount(100, 'USD', 'USD', rates) === 100`).
3. Handles missing rates gracefully with 1:1 fallback.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/currency.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/services/currency.ts`**
Implement rate fetching with timeout and fallback to cached SQLite rates, conversion logic, and SQLite persistence.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/currency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/currency.ts tests/currency.test.ts
git commit -m "feat(currency): implement multi-currency conversion and rate synchronization"
```

---

### Task 5: Debts & Payments Core Service

**Files:**
- Create: `src/services/debt.ts`
- Create: `tests/debt.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `convertAmount()`.
- Produces:
  - `listCategories(db)`
  - `createCategory(db, { name, color, icon })`
  - `deleteCategory(db, id)`
  - `listDebtsWithMonthlyStatus(db, monthPeriod: string, baseCurrency: string)`
  - `createDebt(db, debtData)`
  - `updateDebt(db, id, debtData)`
  - `deleteDebt(db, id)`
  - `recordPayment(db, { debtId, amount, currency, paymentDate, monthPeriod, notes })`
  - `revertPayment(db, paymentId: number)`
  - `getMonthlySummary(db, monthPeriod: string, baseCurrency: string)`

- [ ] **Step 1: Write failing tests for debt CRUD, payment transactions, and summary**
Test:
1. Creating a debt with initial `remaining_balance`.
2. Recording a monthly payment decrements `remaining_balance` atomically.
3. Summary returns correct totals (`totalDebt`, `monthlyObligations`, `paidThisMonth`, `pendingThisMonth`).
4. Reverting payment restores `remaining_balance`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/debt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/services/debt.ts`**
Implement queries and atomic transactions (`db.transaction(...)`).

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/debt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/debt.ts tests/debt.test.ts
git commit -m "feat(debt): implement debt management and transactional payment operations"
```

---

### Task 6: Express REST API Endpoints & Server

**Files:**
- Create: `src/routes/auth.ts`
- Create: `src/routes/api.ts`
- Create: `src/server.ts`
- Create: `src/index.ts`
- Create: `tests/api.test.ts`

**Interfaces:**
- Consumes: Services from Tasks 2, 3, 4, 5.
- Produces: Running Express HTTP server exposing all documented REST endpoints with security middleware and static asset fallback.

- [ ] **Step 1: Write failing API route integration tests**
Use `supertest` to test:
1. `POST /api/auth/login` with correct password returns 200 and set-cookie.
2. `GET /api/debts` without cookie returns 401.
3. Authenticated `GET /api/debts`, `POST /api/debts`, `POST /api/payments`, `GET /api/summary`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement route handlers and Express server**
Implement `src/routes/auth.ts`, `src/routes/api.ts`, `src/server.ts`, and `src/index.ts` with error handling, rate limiting on `/api/auth/login`, and static file serving for `client/dist`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/routes/ src/server.ts src/index.ts tests/api.test.ts
git commit -m "feat(server): expose authenticated REST API and express application"
```

---

### Task 7: Frontend Scaffolding & API Client

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/tailwind.config.js`
- Create: `client/postcss.config.js`
- Create: `client/index.html`
- Create: `client/src/api/client.ts`
- Create: `client/src/types.ts`
- Create: `client/src/index.css`

**Interfaces:**
- Consumes: Backend REST API endpoints.
- Produces: Configured React + Tailwind client build setup with typed API client and authentication context.

- [ ] **Step 1: Initialize client directory and configuration files**
Set up Vite with React plugin, Tailwind CSS with typography and forms, Lucide React icons, and API client with cookie handling.

- [ ] **Step 2: Create API client with error handling**
Implement typed functions: `login`, `logout`, `checkAuth`, `fetchSummary`, `fetchDebts`, `recordPayment`, `revertPayment`, `createDebt`, `updateDebt`, `deleteDebt`, `fetchCategories`, `syncRates`.

- [ ] **Step 3: Test client build**
Run: `npm --prefix client install && npm --prefix client run build`
Expected: Clean build output in `client/dist`.

- [ ] **Step 4: Commit**
```bash
git add client/
git commit -m "feat(frontend): scaffold React Vite client with Tailwind and typed API layer"
```

---

### Task 8: Frontend Dashboard UI Implementation

**Files:**
- Create: `client/src/components/Login.tsx`
- Create: `client/src/components/Header.tsx`
- Create: `client/src/components/KpiSummary.tsx`
- Create: `client/src/components/DebtList.tsx`
- Create: `client/src/components/DebtCard.tsx`
- Create: `client/src/components/DebtModal.tsx`
- Create: `client/src/components/PaymentModal.tsx`
- Create: `client/src/components/CategoryModal.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `client/src/api/client.ts`
- Produces: Complete interactive debt management dashboard with month selector, KPI metrics, category grouping, mark-as-paid dialogs, undo actions, and modal forms.

- [ ] **Step 1: Implement `Login.tsx`**
Clean password login form with error alerts and focus auto-detection.

- [ ] **Step 2: Implement `Header.tsx` and `KpiSummary.tsx`**
Month navigation (`< Previous`, `Next >`, `This Month`), Base Currency dropdown, New Debt button, Logout button, and the 4 KPI cards (Total Debt Balance, Monthly Due, Paid This Month, Remaining Due).

- [ ] **Step 3: Implement `DebtCard.tsx` and `DebtList.tsx`**
Category-grouped lists, payoff progress bars, formatted currency values, "Mark Paid" button, Paid badge with Undo button, and click-to-edit drawer.

- [ ] **Step 4: Implement `DebtModal.tsx`, `PaymentModal.tsx`, and `CategoryModal.tsx`**
Forms for creating/editing debts, custom payment confirmation (prefilled with monthly payment amount), and category customization.

- [ ] **Step 5: Integrate into `App.tsx` and build client**
Run: `npm --prefix client run build`
Expected: Build succeeds with no TypeScript or bundle warnings.

- [ ] **Step 6: Commit**
```bash
git add client/src/
git commit -m "feat(frontend): implement comprehensive debt dashboard and interactive workflows"
```

---

### Task 9: Production Packaging, Docker Build & Droplet Deployment Verification

**Files:**
- Create: `deploy.sh`
- Create: `README.md`
- Modify: `package.json` (add unified `build` and `start` scripts)

**Interfaces:**
- Consumes: All backend and frontend code, Docker configuration.
- Produces: Production-ready distribution, executable deployment script, and setup documentation for `debt.jaymayu.com`.

- [ ] **Step 1: Configure top-level build and start scripts in `package.json`**
`npm run build` builds both backend and client; `npm start` runs `dist/index.js`.

- [ ] **Step 2: Verify production build locally**
Run: `npm run build && npm test`
Expected: All tests pass, server compiled into `dist/`, frontend compiled into `client/dist/`.

- [ ] **Step 3: Test Docker container build**
Run: `docker build -t monthly-planner:latest .`
Expected: Docker multi-stage build completes successfully with image `monthly-planner:latest`.

- [ ] **Step 4: Create `deploy.sh` and `README.md`**
Provide instructions for the Droplet: setting up `.env`, running `docker compose up -d`, and verifying Traefik routing to `debt.jaymayu.com`.

- [ ] **Step 5: Commit**
```bash
git add deploy.sh README.md package.json
git commit -m "chore: add droplet deployment script and setup documentation"
```
