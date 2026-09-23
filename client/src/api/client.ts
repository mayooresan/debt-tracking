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
  Currency,
  AuthStatus,
} from '../types';

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Base fetch wrapper with credentials: 'include' for session cookie transport.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') || endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorData: any = null;
    let errorMessage = response.statusText || 'API request failed';

    try {
      errorData = await response.json();
      if (errorData && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      } else if (errorData && typeof errorData.message === 'string') {
        errorMessage = errorData.message;
      }
    } catch {
      // response body was not valid JSON
    }

    throw new ApiError(errorMessage, response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ==========================================
// Authentication
// ==========================================

export async function login(password: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function checkAuth(): Promise<{ authenticated: boolean; baseCurrency: string }> {
  const res = await apiFetch<AuthStatus>('/api/auth/status');
  return {
    authenticated: Boolean(res.authenticated),
    baseCurrency: res.baseCurrency || res.base_currency || 'USD',
  };
}

// ==========================================
// Summary & Debts
// ==========================================

export async function fetchSummary(
  month: string,
  currency?: string
): Promise<MonthlySummary> {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (currency) params.append('currency', currency);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<MonthlySummary>(`/api/summary${query}`);
}

export async function fetchDebts(
  month: string,
  currency?: string
): Promise<DebtWithMonthlyStatus[]> {
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (currency) params.append('currency', currency);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<DebtWithMonthlyStatus[]>(`/api/debts${query}`);
}

export async function createDebt(data: CreateDebtInput): Promise<Debt> {
  return apiFetch<Debt>('/api/debts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDebt(id: number, data: UpdateDebtInput): Promise<Debt> {
  return apiFetch<Debt>(`/api/debts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDebt(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/debts/${id}`, {
    method: 'DELETE',
  });
}

// ==========================================
// Payments
// ==========================================

export async function recordPayment(
  data: CreatePaymentInput
): Promise<{ payment: Payment; debt: Debt }> {
  return apiFetch<{ payment: Payment; debt: Debt }>('/api/payments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revertPayment(
  paymentId: number
): Promise<{ success: boolean; debt: Debt }> {
  return apiFetch<{ success: boolean; debt: Debt }>(`/api/payments/${paymentId}`, {
    method: 'DELETE',
  });
}

// ==========================================
// Categories
// ==========================================

export async function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/api/categories');
}

export async function createCategory(
  data: CreateCategoryInput
): Promise<Category> {
  return apiFetch<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCategory(
  id: number,
  data: UpdateCategoryInput
): Promise<Category> {
  return apiFetch<Category>(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/categories/${id}`, {
    method: 'DELETE',
  });
}

// ==========================================
// Currencies & Settings
// ==========================================

export async function fetchCurrencies(): Promise<{
  baseCurrency: string;
  currencies: Currency[];
  rates: Record<string, number>;
}> {
  const [currencies, settings, ratesData] = await Promise.all([
    apiFetch<Currency[]>('/api/currencies'),
    apiFetch<Record<string, string>>('/api/settings').catch(
      (): Record<string, string> => ({ base_currency: 'USD' })
    ),
    apiFetch<{ success?: boolean; rates: Record<string, number> }>('/api/rates').catch(() => ({
      rates: { USD: 1.0 },
    })),
  ]);

  const baseCurrency = settings.base_currency || settings['baseCurrency'] || 'USD';
  const rates =
    ratesData && ratesData.rates
      ? ratesData.rates
      : (ratesData as unknown as Record<string, number>) || { USD: 1.0 };

  return {
    baseCurrency,
    currencies,
    rates,
  };
}

export async function updateSettings(
  settings: { base_currency?: string }
): Promise<{ success: boolean; settings: Record<string, string> }> {
  const res = await apiFetch<
    Record<string, string> | { success: boolean; settings: Record<string, string> }
  >('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

  if (res && 'settings' in res && typeof res.success === 'boolean') {
    return res as { success: boolean; settings: Record<string, string> };
  }

  return {
    success: true,
    settings: res as Record<string, string>,
  };
}

export async function syncRates(
  force?: boolean
): Promise<{ success: boolean; rates: Record<string, number> }> {
  return apiFetch<{ success: boolean; rates: Record<string, number> }>('/api/rates/sync', {
    method: 'POST',
    body: JSON.stringify({ force: Boolean(force) }),
  });
}

export const api = {
  login,
  logout,
  checkAuth,
  fetchSummary,
  fetchDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  recordPayment,
  revertPayment,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  fetchCurrencies,
  updateSettings,
  syncRates,
};

export default api;
