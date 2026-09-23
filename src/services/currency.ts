import { getDb } from '../db/index';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

export interface SyncRatesResult {
  success: boolean;
  updatedCount: number;
  rates: Record<string, number>;
}

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
];

export const DEFAULT_FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
  CHF: 0.90,
  SGD: 1.35,
  INR: 83.5,
  NZD: 1.65,
  CNY: 7.25,
  BRL: 5.40,
  MXN: 18.2,
  HKD: 7.81,
  SEK: 10.6,
  NOK: 10.7,
  KRW: 1375.0,
  TRY: 33.0,
  ZAR: 18.1,
  PHP: 58.5,
  IDR: 16200.0,
  MYR: 4.70,
  THB: 36.5,
  VND: 25400.0,
  AED: 3.67,
  SAR: 3.75,
  PLN: 4.0,
};

export const EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest/USD';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Retrieves the current exchange rates against base currency USD.
 * Reads cached rates from the SQLite exchange_rates table.
 * If no rates exist in the database, returns default fallback rates.
 */
export function getExchangeRates(db?: any): Record<string, number> {
  const database = db || getDb();

  try {
    const rows = database
      .prepare('SELECT target_currency, rate FROM exchange_rates WHERE base_currency = ?')
      .all('USD') as { target_currency: string; rate: number }[];

    const rates: Record<string, number> = { ...DEFAULT_FALLBACK_RATES, USD: 1.0 };
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (typeof row.rate === 'number' && !isNaN(row.rate)) {
          rates[row.target_currency.toUpperCase()] = row.rate;
        }
      }
    }
    return rates;
  } catch {
    return { ...DEFAULT_FALLBACK_RATES };
  }
}

/**
 * Retrieves exchange rates as a Map for convenience.
 */
export function getExchangeRatesMap(db?: any): Map<string, number> {
  const rates = getExchangeRates(db);
  return new Map(Object.entries(rates));
}

/**
 * Synchronizes exchange rates from the external API into the SQLite database.
 * Throttles requests: skips if last_rates_sync was within 24 hours unless force === true.
 * In case of any network or API error, seamlessly falls back to cached SQLite rates without throwing.
 */
export async function syncExchangeRates(db?: any, force: boolean = false): Promise<SyncRatesResult> {
  const database = db || getDb();

  // Check last sync timestamp from app_settings
  if (!force) {
    try {
      const setting = database
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get('last_rates_sync') as { value: string } | undefined;

      if (setting && setting.value) {
        const lastSyncTime = new Date(setting.value).getTime();
        const now = Date.now();
        if (!isNaN(lastSyncTime) && now - lastSyncTime < SYNC_INTERVAL_MS) {
          return {
            success: true,
            updatedCount: 0,
            rates: getExchangeRates(database),
          };
        }
      }
    } catch {
      // Continue to attempt sync if check fails
    }
  }

  // Fetch exchange rates from public API
  try {
    const response = await fetch(EXCHANGE_RATE_API_URL, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API responded with status ${response.status}`);
    }

    const data = (await response.json()) as any;
    if (!data || typeof data !== 'object' || !data.rates || typeof data.rates !== 'object') {
      throw new Error('Exchange rate API response missing rates payload');
    }

    const ratesData = data.rates as Record<string, unknown>;

    const insertStmt = database.prepare(`
      INSERT OR REPLACE INTO exchange_rates (base_currency, target_currency, rate, updated_at)
      VALUES ('USD', ?, ?, CURRENT_TIMESTAMP)
    `);

    const updateSettingStmt = database.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value)
      VALUES ('last_rates_sync', ?)
    `);

    let updatedCount = 0;
    const syncTx = database.transaction(() => {
      for (const [code, rateVal] of Object.entries(ratesData)) {
        if (typeof rateVal === 'number' && !isNaN(rateVal) && rateVal > 0) {
          insertStmt.run(code.toUpperCase(), rateVal);
          updatedCount++;
        }
      }
      // Ensure USD is recorded
      insertStmt.run('USD', 1.0);
      updateSettingStmt.run(new Date().toISOString());
    });

    syncTx();

    return {
      success: true,
      updatedCount,
      rates: getExchangeRates(database),
    };
  } catch {
    // Offline fallback: never crash or throw; return locally cached rates
    return {
      success: false,
      updatedCount: 0,
      rates: getExchangeRates(database),
    };
  }
}

/**
 * Converts an amount from one currency to another using base USD rates.
 * Formula: (amount / rate(USD -> fromCurrency)) * rate(USD -> toCurrency)
 * Returns amount rounded to 2 decimal places.
 * If fromCurrency === toCurrency, returns exact amount.
 * Handles missing or invalid rates with a 1:1 fallback.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> | Map<string, number>
): number {
  if (amount === 0) {
    return 0;
  }

  const from = (fromCurrency || 'USD').trim().toUpperCase();
  const to = (toCurrency || 'USD').trim().toUpperCase();

  // If identical currency, return exact amount without rounding or alterations
  if (from === to) {
    return amount;
  }

  let fromRate = rates instanceof Map ? rates.get(from) : rates?.[from];
  let toRate = rates instanceof Map ? rates.get(to) : rates?.[to];

  // Missing, zero, or non-positive rates fall back to 1.0
  if (typeof fromRate !== 'number' || isNaN(fromRate) || fromRate <= 0) {
    fromRate = 1.0;
  }
  if (typeof toRate !== 'number' || isNaN(toRate) || toRate <= 0) {
    toRate = 1.0;
  }

  const converted = (amount / fromRate) * toRate;

  // Round to 2 decimal places
  const sign = converted < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(converted) + Number.EPSILON) * 100) / 100);
}
