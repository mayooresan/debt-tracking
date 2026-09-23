import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, closeDb } from '../src/db/index';
import {
  SUPPORTED_CURRENCIES,
  convertAmount,
  getExchangeRates,
  getExchangeRatesMap,
  syncExchangeRates,
  DEFAULT_FALLBACK_RATES,
} from '../src/services/currency';

describe('Currency Service & Exchange Rates', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  describe('SUPPORTED_CURRENCIES', () => {
    it('should be a non-empty array of currencies with code, name, and symbol', () => {
      expect(Array.isArray(SUPPORTED_CURRENCIES)).toBe(true);
      expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(10);

      for (const curr of SUPPORTED_CURRENCIES) {
        expect(curr).toHaveProperty('code');
        expect(curr).toHaveProperty('name');
        expect(curr).toHaveProperty('symbol');
        expect(typeof curr.code).toBe('string');
        expect(typeof curr.name).toBe('string');
        expect(typeof curr.symbol).toBe('string');
        expect(curr.code).toMatch(/^[A-Z]{3}$/);
      }
    });

    it('should include required core currencies: USD, EUR, GBP, CAD, AUD, JPY, CHF, SGD, INR', () => {
      const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
      const requiredCodes = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'INR'];
      for (const req of requiredCodes) {
        expect(codes).toContain(req);
      }
    });

    it('should contain unique currency codes', () => {
      const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('convertAmount', () => {
    const mockRates: Record<string, number> = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.75,
      JPY: 150.0,
      CAD: 1.35,
    };

    it('should return exact amount without alteration when fromCurrency === toCurrency', () => {
      expect(convertAmount(100, 'USD', 'USD', mockRates)).toBe(100);
      expect(convertAmount(50.456, 'EUR', 'EUR', mockRates)).toBe(50.456);
      expect(convertAmount(0, 'GBP', 'GBP', mockRates)).toBe(0);
      // Case insensitivity
      expect(convertAmount(99.99, 'usd', 'USD', mockRates)).toBe(99.99);
    });

    it('should convert USD to target currency accurately', () => {
      // 100 USD -> EUR at 0.85: (100 / 1.0) * 0.85 = 85.00
      expect(convertAmount(100, 'USD', 'EUR', mockRates)).toBe(85);
      // 10 USD -> JPY at 150.0: (10 / 1.0) * 150.0 = 1500.00
      expect(convertAmount(10, 'USD', 'JPY', mockRates)).toBe(1500);
    });

    it('should convert target currency to USD accurately', () => {
      // 85 EUR -> USD at 0.85: (85 / 0.85) * 1.0 = 100.00
      expect(convertAmount(85, 'EUR', 'USD', mockRates)).toBe(100);
      // 1500 JPY -> USD at 150.0: (1500 / 150.0) * 1.0 = 10.00
      expect(convertAmount(1500, 'JPY', 'USD', mockRates)).toBe(10);
    });

    it('should convert between two non-USD currencies using base USD rates and round to 2 decimals', () => {
      // 100 EUR to GBP: (100 / 0.85) * 0.75 = 88.235294... -> 88.24
      expect(convertAmount(100, 'EUR', 'GBP', mockRates)).toBe(88.24);
      // 100 GBP to EUR: (100 / 0.75) * 0.85 = 113.333333... -> 113.33
      expect(convertAmount(100, 'GBP', 'EUR', mockRates)).toBe(113.33);
    });

    it('should handle missing rates gracefully with 1:1 fallback', () => {
      // Unknown fromCurrency defaults to rate 1.0: (100 / 1.0) * 0.85 = 85.00
      expect(convertAmount(100, 'XYZ', 'EUR', mockRates)).toBe(85);

      // Unknown toCurrency defaults to rate 1.0: (85 / 0.85) * 1.0 = 100.00
      expect(convertAmount(85, 'EUR', 'XYZ', mockRates)).toBe(100);

      // Both currencies unknown: (100 / 1.0) * 1.0 = 100.00
      expect(convertAmount(100, 'ABC', 'XYZ', mockRates)).toBe(100);

      // Empty rates object fallback
      expect(convertAmount(250, 'EUR', 'GBP', {})).toBe(250);
    });

    it('should handle Map input as well as Record input', () => {
      const mapRates = new Map<string, number>([
        ['USD', 1.0],
        ['EUR', 0.85],
        ['GBP', 0.75],
      ]);
      expect(convertAmount(100, 'EUR', 'GBP', mapRates)).toBe(88.24);
      expect(convertAmount(100, 'USD', 'EUR', mapRates)).toBe(85);
    });

    it('should handle zero, negative, and invalid rate edge cases safely', () => {
      expect(convertAmount(0, 'USD', 'EUR', mockRates)).toBe(0);
      // Negative amount conversion
      expect(convertAmount(-100, 'USD', 'EUR', mockRates)).toBe(-85);

      // Rates with invalid/zero numbers should fall back to 1.0 and not cause NaN or Infinity
      const badRates = { USD: 1.0, ZERO: 0, NEG: -2.5, NAN: NaN };
      expect(convertAmount(100, 'ZERO', 'USD', badRates)).toBe(100);
      expect(convertAmount(100, 'USD', 'NEG', badRates)).toBe(100);
      expect(convertAmount(100, 'NAN', 'USD', badRates)).toBe(100);
    });
  });

  describe('getExchangeRates & getExchangeRatesMap', () => {
    it('should return default fallback rates when exchange_rates table is empty', () => {
      const rates = getExchangeRates(db);
      expect(rates).toBeDefined();
      expect(rates.USD).toBe(1.0);
      expect(rates.EUR).toBeGreaterThan(0);
      expect(rates.GBP).toBeGreaterThan(0);
      expect(Object.keys(rates).length).toBeGreaterThanOrEqual(10);
    });

    it('should return rates cached in the database when present', () => {
      db.prepare(`
        INSERT INTO exchange_rates (base_currency, target_currency, rate)
        VALUES ('USD', 'EUR', 0.88), ('USD', 'GBP', 0.77), ('USD', 'CAD', 1.33)
      `).run();

      const rates = getExchangeRates(db);
      expect(rates.USD).toBe(1.0);
      expect(rates.EUR).toBe(0.88);
      expect(rates.GBP).toBe(0.77);
      expect(rates.CAD).toBe(1.33);
    });

    it('should preserve fallback rates for uncached currencies when database has partial cache', () => {
      // Only insert EUR into database
      db.prepare(`
        INSERT INTO exchange_rates (base_currency, target_currency, rate)
        VALUES ('USD', 'EUR', 0.88)
      `).run();

      const rates = getExchangeRates(db);
      // Cached rate is used
      expect(rates.EUR).toBe(0.88);
      expect(rates.USD).toBe(1.0);
      // Uncached currencies still have fallback rates
      expect(rates.GBP).toBe(DEFAULT_FALLBACK_RATES.GBP);
      expect(rates.JPY).toBe(DEFAULT_FALLBACK_RATES.JPY);
      expect(rates.INR).toBe(DEFAULT_FALLBACK_RATES.INR);
    });

    it('should return Map from getExchangeRatesMap', () => {
      db.prepare(`
        INSERT INTO exchange_rates (base_currency, target_currency, rate)
        VALUES ('USD', 'EUR', 0.88)
      `).run();

      const map = getExchangeRatesMap(db);
      expect(map instanceof Map).toBe(true);
      expect(map.get('USD')).toBe(1.0);
      expect(map.get('EUR')).toBe(0.88);
    });
  });

  describe('syncExchangeRates', () => {
    it('should skip sync if already synced within the last 24 hours and force is false', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'last_rates_sync'").run(recentTime);
      db.prepare("INSERT INTO exchange_rates (base_currency, target_currency, rate) VALUES ('USD', 'EUR', 0.91)").run();

      const result = await syncExchangeRates(db, false);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(0);
      expect(result.rates.EUR).toBe(0.91);
    });

    it('should bypass 24h throttling when force is true', async () => {
      const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'last_rates_sync'").run(recentTime);

      const mockApiResponse = {
        result: 'success',
        base_code: 'USD',
        rates: {
          USD: 1.0,
          EUR: 0.93,
          GBP: 0.81,
          CAD: 1.38,
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const result = await syncExchangeRates(db, true);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBeGreaterThanOrEqual(4);
      expect(result.rates.EUR).toBe(0.93);
      expect(result.rates.GBP).toBe(0.81);

      // Verify database updated
      const row = db.prepare("SELECT rate FROM exchange_rates WHERE target_currency = 'EUR'").get() as { rate: number };
      expect(row.rate).toBe(0.93);

      const syncSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'last_rates_sync'").get() as { value: string };
      const syncDate = new Date(syncSetting.value);
      expect(Date.now() - syncDate.getTime()).toBeLessThan(5000);
    });

    it('should sync rates when last_rates_sync is older than 24 hours', async () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'last_rates_sync'").run(oldTime);

      const mockApiResponse = {
        result: 'success',
        base_code: 'USD',
        rates: {
          USD: 1.0,
          EUR: 0.94,
          JPY: 155.5,
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const result = await syncExchangeRates(db, false);

      expect(result.success).toBe(true);
      expect(result.rates.EUR).toBe(0.94);
      expect(result.rates.JPY).toBe(155.5);
    });

    it('should seamlessly fall back to cached rates when API fetch fails (network error)', async () => {
      // Pre-seed some cached rates
      db.prepare("INSERT INTO exchange_rates (base_currency, target_currency, rate) VALUES ('USD', 'EUR', 0.89)").run();

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error: DNS lookup failed'));

      // Must never throw or crash
      const result = await syncExchangeRates(db, true);

      expect(result.success).toBe(false);
      expect(result.updatedCount).toBe(0);
      expect(result.rates.EUR).toBe(0.89);
      expect(result.rates.USD).toBe(1.0);
    });

    it('should seamlessly fall back to cached rates when API returns HTTP non-200 error', async () => {
      db.prepare("INSERT INTO exchange_rates (base_currency, target_currency, rate) VALUES ('USD', 'EUR', 0.89)").run();

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as any);

      const result = await syncExchangeRates(db, true);

      expect(result.success).toBe(false);
      expect(result.updatedCount).toBe(0);
      expect(result.rates.EUR).toBe(0.89);
    });

    it('should seamlessly fall back to cached rates when API returns invalid payload', async () => {
      db.prepare("INSERT INTO exchange_rates (base_currency, target_currency, rate) VALUES ('USD', 'EUR', 0.89)").run();

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: 'Invalid API key or response' }), // missing rates
      } as any);

      const result = await syncExchangeRates(db, true);

      expect(result.success).toBe(false);
      expect(result.updatedCount).toBe(0);
      expect(result.rates.EUR).toBe(0.89);
    });
  });
});
