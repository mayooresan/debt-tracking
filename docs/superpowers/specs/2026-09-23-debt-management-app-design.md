# Debt Management Application Design Specification

* **Date:** 2026-09-23
* **Target Domain:** `debt.jaymayu.com`
* **Deployment Platform:** DigitalOcean Droplet (Docker Compose + Traefik reverse proxy)
* **Status:** Validated Design / Ready for Implementation Planning

---

## 1. Overview & Goals

The Debt Management Application is a self-hosted, single-user, mobile-responsive web application designed to help individuals regain control of their debts. It tracks various debt liabilities—such as fixed-term installment loans, revolving credit card balances, and recurring installment payments—grouped by category.

### Key Objectives
1. **Unified Monthly View:** Know exactly how much money is due across all installments and debt minimums for any given calendar month (current, past, or future).
2. **Total Debt Visibility:** Track aggregate remaining debt balance across all categories and currencies in real time.
3. **Full Payment Workflow:** Mark monthly obligations as paid, automatically recording payment transaction history and decrementing remaining balances.
4. **Multi-Currency Support:** Track debts in their native currencies (e.g., USD, EUR, GBP, etc.) with automatic background currency conversion to a user-selected primary base currency.
5. **Lightweight & Self-Contained:** Stored locally in SQLite, requiring minimal Droplet resources (~40–60MB RAM), secured with a master password from `.env`, and ready for Traefik ingress.

---

## 2. Architecture & Tech Stack

### High-Level Architecture
```
                   Internet
                      │
                      ▼
           [Traefik Reverse Proxy]
            (debt.jaymayu.com:443)
                      │ (Docker Network: "web")
                      ▼
        ┌─────────────────────────────┐
        │  monthly-planner Container  │
        │  Express.js (Port 3000)     │
        │  ├── Static React Vite SPA  │
        │  ├── API Routes             │
        │  └── SQLite (better-sqlite3)│
        └──────────────┬──────────────┘
                       │
                       ▼
              [./data/budget.db]
           (Host Mounted Volume)
```

### Components
* **Backend:** Node.js with TypeScript and Express.js.
  * Fast, lightweight, robust.
  * Direct interface with SQLite via `better-sqlite3` for synchronous, performant, zero-drift database transactions.
* **Frontend:** React 18+ with Vite, TypeScript, and Tailwind CSS.
  * Polished, modern dark/light-compatible UI with Lucide icons.
  * Responsive layout tailored for both mobile devices and desktop browsers.
  * Client-side reactivity for immediate feedback when toggling payments, switching months, or changing base currencies.
* **Database:** SQLite (`/app/data/budget.db`) with WAL (Write-Ahead Logging) enabled.
* **Containerization:** Multi-stage Docker build packaging both static assets and the Node API into a single Alpine image.

---

## 3. Data Model & SQLite Schema

The database will be initialized at `./data/budget.db` with foreign key constraints enabled.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

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
  total_amount REAL NOT NULL,           -- Initial or baseline debt amount
  remaining_balance REAL NOT NULL,      -- Current remaining amount owed
  monthly_payment REAL NOT NULL,        -- Amount due each month (installment or min payment)
  currency TEXT NOT NULL DEFAULT 'USD', -- ISO 3-letter code (USD, EUR, GBP, etc.)
  due_day INTEGER NOT NULL DEFAULT 1,   -- Day of month (1-31)
  interest_rate REAL DEFAULT 0.0,       -- Optional APR % (e.g. 18.5)
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = paid off / archived
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,                 -- Amount paid in the debt's currency
  currency TEXT NOT NULL,
  payment_date TEXT NOT NULL,           -- ISO date: YYYY-MM-DD
  month_period TEXT NOT NULL,           -- Target month cycle: YYYY-MM
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

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('base_currency', 'USD'),
  ('last_rates_sync', '1970-01-01T00:00:00.000Z');
```

---

## 4. Authentication & Security

1. **Master Password Gate:**
   * Reads `AUTH_PASSWORD` (or fallback `APP_PASSWORD`) from `.env`.
   * If not set, logs a warning on boot and instructs user to set `AUTH_PASSWORD` in `.env`.
2. **Timing-Safe Verification:**
   * Incoming password strings are compared with `crypto.timingSafeEqual` after hashing with SHA-256 to prevent timing attacks.
3. **Session Management:**
   * A signed, HTTP-only cookie (`debt_session`) is set upon successful authentication, valid for 30 days.
   * `SESSION_SECRET` in `.env` is used to sign the cookie. If not provided, a stable cryptographic key is generated and stored in `./data/.session_secret`.
4. **Brute Force Defense:**
   * `express-rate-limit` limits login attempts to 10 requests per 15-minute window per IP.
5. **CSRF & Security Headers:**
   * Helmet middleware configured with appropriate content security policies and secure headers.
   * Cookie configured with `sameSite: 'lax'` and `httpOnly: true` (and `secure: true` when accessed via HTTPS under Traefik).

---

## 5. Multi-Currency Engine

1. **Exchange Rates Cache:**
   * Supported currencies include USD, EUR, GBP, CAD, AUD, JPY, CHF, SGD, INR, and others.
   * Automatic background sync checks whether `last_rates_sync` is older than 24 hours on server startup and daily.
   * Rates fetched from a free, reliable public API (`https://open.er-api.com/v6/latest/USD` or `https://api.frankfurter.app/latest`).
   * Fetched rates are stored in the `exchange_rates` SQLite table.
   * If the external API fails (e.g. no internet connectivity), the system silently falls back to the locally cached rates.
2. **Conversion Logic:**
   * Standard conversion formula:
     $$\text{amount\_in\_base} = \frac{\text{amount}}{\text{rate}(USD \to native)} \times \text{rate}(USD \to base)$$
   * Both native amount and converted base currency amount are exposed via API endpoints.
   * The user can switch their preferred Base Currency in the dashboard at any time, instantly recalculating all monthly totals and remaining balances.

---

## 6. Payment & Balance Lifecycle

1. **Monthly View Computation:**
   * Given a target month `YYYY-MM`:
     * For each active debt, check if a record exists in `payments` where `month_period = :month`.
     * If a payment exists: `is_paid = true`, `paid_amount = payment.amount`, `paid_at = payment.payment_date`.
     * If no payment exists: `is_paid = false`, `paid_amount = 0`.
2. **Marking as Paid (`POST /api/payments`):**
   * Performed inside a single SQLite transaction:
     ```sql
     BEGIN TRANSACTION;
     INSERT INTO payments (debt_id, amount, currency, payment_date, month_period, notes)
     VALUES (?, ?, ?, ?, ?, ?);
     
     UPDATE debts 
     SET remaining_balance = MAX(0, remaining_balance - ?),
         is_active = CASE WHEN remaining_balance - ? <= 0 THEN 0 ELSE is_active END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;
     COMMIT;
     ```
3. **Reverting a Payment (`DELETE /api/payments/:id`):**
   * If a user clicks "Undo" or removes a mistaken payment, a transaction restores the debt's `remaining_balance` and reactivates the debt if it was previously marked 0.

---

## 7. REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with master password, set session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/status` | Check if session is authenticated |
| `GET` | `/api/categories` | List all categories with associated debt counts |
| `POST` | `/api/categories` | Create a new category |
| `PUT` | `/api/categories/:id` | Update category name, color, or icon |
| `DELETE` | `/api/categories/:id` | Delete category (forbidden if debts are attached) |
| `GET` | `/api/debts?month=YYYY-MM` | List debts with payment status for the requested month |
| `POST` | `/api/debts` | Create a new debt obligation |
| `GET` | `/api/debts/:id` | Get details and payment history for a debt |
| `PUT` | `/api/debts/:id` | Update debt details |
| `DELETE` | `/api/debts/:id` | Delete or archive a debt |
| `GET` | `/api/payments?month=YYYY-MM` | List payments for a month |
| `POST` | `/api/payments` | Record payment, update balance atomically |
| `DELETE` | `/api/payments/:id` | Revert payment and restore balance |
| `GET` | `/api/summary?month=YYYY-MM` | Total debt, total due this month, paid vs pending, category breakdown |
| `GET` | `/api/settings` | Get user settings (base currency, rate sync status) |
| `PUT` | `/api/settings` | Update base currency |
| `POST` | `/api/rates/sync` | Trigger immediate exchange rates refresh |

---

## 8. Frontend Interface & Experience

### Key Views & Components
1. **Login Page:** Clean, focused single-input form for the master password with feedback on invalid entries.
2. **Dashboard Header:**
   * App title ("Debt Management")
   * Month Navigator: `[<] [September 2026] [>]` + `[This Month]` quick jump
   * Base Currency Picker dropdown (e.g. `USD ($)`, `EUR (€)`, `GBP (£)`)
   * Quick Add Debt `[+ New Debt]` button
   * Logout button
3. **Summary KPI Cards:**
   * **Total Debt Balance:** Converted sum of all remaining balances across all active debts, with comparison to original total balance.
   * **Monthly Due:** Total installment commitments due this month.
   * **Paid This Month:** Green card showing paid amount and progress bar (`% paid`).
   * **Pending This Month:** Amber card showing remaining balance due before month end.
4. **Debts & Installments List:**
   * Grouped by Category tabs or expandable sections (e.g., Loans, Credit Cards, Monthly Installments).
   * Each card features:
     * Due date pill (`Due on 15th`)
     * Name and category icon
     * Monthly installment amount (with converted base currency tooltip)
     * Progress bar showing payoff percentage (`remaining_balance / total_amount`)
     * Action button:
       * If unpaid: **"Mark Paid"** button (pre-fills monthly installment amount with option to edit)
       * If paid: **"Paid ✓"** green badge with payment date and quick "Undo" option
5. **Debt Detail / Payment History Drawer:**
   * History of all payments made to this debt.
   * Add extra one-time payment button.
   * Edit / Delete debt.
6. **New / Edit Debt Modal:**
   * Debt Name
   * Category (with option to manage categories)
   * Total Initial Debt Amount
   * Current Remaining Balance
   * Monthly Payment / Installment Due
   * Currency selector
   * Due Day of the Month (1-31)
   * Interest Rate (APR, optional)
   * Notes / description

---

## 9. Deployment Configuration

### `docker-compose.yml`
Configured to match the user's Traefik network and routing:

```yaml
version: '3.8'

services:
  monthly-planner:
    build:
      context: .
      dockerfile: Dockerfile
    image: monthly-planner:latest
    container_name: monthly-planner
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/budget.db
      - AUTH_PASSWORD=${AUTH_PASSWORD:-}
      - BASE_CURRENCY=${BASE_CURRENCY:-USD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.monthly-planner.rule=Host(`debt.jaymayu.com`)"
      - "traefik.http.routers.monthly-planner.entrypoints=websecure"
      - "traefik.http.routers.monthly-planner.tls.certresolver=letsencrypt"
      - "traefik.http.services.monthly-planner.loadbalancer.server.port=3000"
    networks:
      - web

networks:
  web:
    external: true
```

### `.env.example`
```env
AUTH_PASSWORD=change_this_to_a_secure_master_password
SESSION_SECRET=optional_random_secret_string
BASE_CURRENCY=USD
PORT=3000
```

### `Dockerfile` (Multi-stage)
```dockerfile
# Stage 1: Build client and server
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/server/index.js"]
```

---

## 10. Testing & Verification

1. **Unit & Integration Tests:**
   * Test database schema migrations and seed scripts.
   * Test authentication: invalid passwords rejected, valid password issues signed cookie, rate limiting triggers.
   * Test payment recording: verify atomic balance deduction and debt closure when balance hits zero.
   * Test currency conversions with mock exchange rates.
2. **Build Verification:**
   * TypeScript compilation verification (`tsc --noEmit`).
   * Vite client production build (`vite build`).
   * Docker image build test (`docker build -t monthly-planner:test .`).
