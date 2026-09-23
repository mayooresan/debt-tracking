import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  DebtWithMonthlyStatus,
  Category,
  Currency,
  MonthlySummary,
  CreateDebtInput,
  UpdateDebtInput,
  CreatePaymentInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './types';
import { api, ApiError } from './api/client';
import { getCurrentMonth } from './utils/formatters';

import Login from './components/Login';
import Header from './components/Header';
import KpiSummary from './components/KpiSummary';
import DebtList from './components/DebtList';
import DebtModal from './components/DebtModal';
import PaymentModal from './components/PaymentModal';
import CategoryModal from './components/CategoryModal';

export const App: React.FC = () => {
  // Authentication State
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // App Selection & Data State
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [debts, setDebts] = useState<DebtWithMonthlyStatus[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);

  // Loading & Error States
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals State
  const [isDebtModalOpen, setIsDebtModalOpen] = useState<boolean>(false);
  const [editingDebt, setEditingDebt] = useState<DebtWithMonthlyStatus | null>(null);
  const [defaultCategoryForNewDebt, setDefaultCategoryForNewDebt] = useState<number | undefined>(
    undefined
  );

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [payingDebt, setPayingDebt] = useState<DebtWithMonthlyStatus | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const auth = await api.checkAuth();
        setIsAuthenticated(auth.authenticated);
        if (auth.baseCurrency) {
          setBaseCurrency(auth.baseCurrency);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsAuthChecking(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Fetch full dashboard data
  const loadDashboardData = useCallback(
    async (month: string, curr: string) => {
      setIsLoadingData(true);
      setErrorMessage(null);

      try {
        const [currenciesData, categoriesData, debtsData, summaryData] = await Promise.all([
          api.fetchCurrencies(),
          api.fetchCategories(),
          api.fetchDebts(month, curr),
          api.fetchSummary(month, curr),
        ]);

        if (currenciesData.currencies) {
          setCurrencies(currenciesData.currencies);
        }
        if (currenciesData.rates) {
          setRates(currenciesData.rates);
        }

        setCategories(categoriesData || []);
        setDebts(debtsData || []);
        setSummary(summaryData || null);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          setIsAuthenticated(false);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Failed to load dashboard data. Please try again.');
        }
      } finally {
        setIsLoadingData(false);
      }
    },
    []
  );

  // Load data when authenticated or when month/currency changes
  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData(selectedMonth, baseCurrency);
    }
  }, [isAuthenticated, selectedMonth, baseCurrency, loadDashboardData]);

  // Auth Handlers
  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    try {
      const auth = await api.checkAuth();
      if (auth.baseCurrency) {
        setBaseCurrency(auth.baseCurrency);
      }
    } catch {
      // fallback
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      setIsAuthenticated(false);
      setDebts([]);
      setSummary(null);
    }
  };

  // Base Currency Change Handler - updates backend setting and state; useEffect handles data load
  const handleBaseCurrencyChange = async (newCurrency: string) => {
    if (newCurrency === baseCurrency) return;
    try {
      await api.updateSettings({ base_currency: newCurrency });
    } catch (err) {
      console.warn('Failed to update base currency setting in backend', err);
    }
    setBaseCurrency(newCurrency);
  };

  // Month Change Handler
  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
  };

  // Modal Open Handlers
  const handleOpenAddDebt = (categoryId?: number) => {
    setEditingDebt(null);
    setDefaultCategoryForNewDebt(categoryId);
    setIsDebtModalOpen(true);
  };

  const handleOpenEditDebt = (debt: DebtWithMonthlyStatus) => {
    setEditingDebt(debt);
    setDefaultCategoryForNewDebt(undefined);
    setIsDebtModalOpen(true);
  };

  const handleOpenPayment = (debt: DebtWithMonthlyStatus) => {
    setPayingDebt(debt);
    setIsPaymentModalOpen(true);
  };

  // Debt CRUD Operations
  const handleSaveDebt = async (debtData: CreateDebtInput | UpdateDebtInput) => {
    if (editingDebt) {
      await api.updateDebt(editingDebt.id, debtData as UpdateDebtInput);
    } else {
      await api.createDebt(debtData as CreateDebtInput);
    }
    await loadDashboardData(selectedMonth, baseCurrency);
  };

  const handleDeleteDebt = async (debt: DebtWithMonthlyStatus) => {
    if (confirm(`Are you sure you want to delete the debt "${debt.name}"? This will also remove associated payment records.`)) {
      try {
        await api.deleteDebt(debt.id);
        await loadDashboardData(selectedMonth, baseCurrency);
      } catch (err: unknown) {
        if (err instanceof Error) {
          alert(`Failed to delete debt: ${err.message}`);
        }
      }
    }
  };

  // Payment Operations
  const handleConfirmPayment = async (paymentData: CreatePaymentInput) => {
    await api.recordPayment(paymentData);
    await loadDashboardData(selectedMonth, baseCurrency);
  };

  const handleUndoPayment = async (paymentId: number) => {
    if (confirm('Are you sure you want to undo this payment? This will restore the debt balance.')) {
      try {
        await api.revertPayment(paymentId);
        await loadDashboardData(selectedMonth, baseCurrency);
      } catch (err: unknown) {
        if (err instanceof Error) {
          alert(`Failed to undo payment: ${err.message}`);
        }
      }
    }
  };

  // Category Operations
  const handleCreateCategory = async (input: CreateCategoryInput) => {
    await api.createCategory(input);
    const updatedCategories = await api.fetchCategories();
    setCategories(updatedCategories);
  };

  const handleUpdateCategory = async (id: number, input: UpdateCategoryInput) => {
    await api.updateCategory(id, input);
    const updatedCategories = await api.fetchCategories();
    setCategories(updatedCategories);
    await loadDashboardData(selectedMonth, baseCurrency);
  };

  const handleDeleteCategory = async (id: number) => {
    await api.deleteCategory(id);
    const updatedCategories = await api.fetchCategories();
    setCategories(updatedCategories);
    await loadDashboardData(selectedMonth, baseCurrency);
  };

  // 1. Initial Authentication Check Screen
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-gray-500">Initializing Debt Management...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Login Screen
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Compute baseline total debt for overall payoff calculation (preserving paid-off debts)
  const totalBaselineDebt = debts.reduce((sum, d) => {
    let rate = 1;
    if (d.currency.toUpperCase() === baseCurrency.toUpperCase()) {
      rate = 1;
    } else if (d.remaining_balance > 0 && d.converted_remaining_balance !== undefined) {
      rate = d.converted_remaining_balance / d.remaining_balance;
    } else if (d.monthly_payment > 0 && d.converted_monthly_payment !== undefined) {
      rate = d.converted_monthly_payment / d.monthly_payment;
    } else if (rates[baseCurrency] && rates[d.currency]) {
      rate = rates[baseCurrency] / rates[d.currency];
    }
    return sum + d.total_amount * rate;
  }, 0);

  // 3. Authenticated Dashboard
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        currentMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        baseCurrency={baseCurrency}
        currencies={currencies}
        onBaseCurrencyChange={handleBaseCurrencyChange}
        onOpenAddDebt={() => handleOpenAddDebt()}
        onOpenCategories={() => setIsCategoryModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 border border-red-200 flex items-center justify-between gap-3 text-red-700">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => loadDashboardData(selectedMonth, baseCurrency)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-xl transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading Indicator Overlay / Bar */}
        {isLoadingData && (
          <div className="mb-4 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-600 bg-blue-50/80 border border-blue-200/60 rounded-xl animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Updating dashboard...</span>
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <KpiSummary
          summary={summary}
          baseCurrency={baseCurrency}
          totalBaselineDebt={totalBaselineDebt}
          monthStr={selectedMonth}
        />

        {/* Category-Grouped Debts & Obligations List */}
        <DebtList
          debts={debts}
          categories={categories}
          baseCurrency={baseCurrency}
          onMarkPaid={handleOpenPayment}
          onUndoPayment={handleUndoPayment}
          onEdit={handleOpenEditDebt}
          onDelete={handleDeleteDebt}
          onAddDebt={handleOpenAddDebt}
        />
      </main>

      {/* Modals */}
      <DebtModal
        isOpen={isDebtModalOpen}
        onClose={() => setIsDebtModalOpen(false)}
        onSave={handleSaveDebt}
        debt={editingDebt}
        categories={categories}
        currencies={currencies}
        baseCurrency={baseCurrency}
        defaultCategoryId={defaultCategoryForNewDebt}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirm={handleConfirmPayment}
        debt={payingDebt}
        selectedMonth={selectedMonth}
      />

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onCreateCategory={handleCreateCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
      />
    </div>
  );
};

export default App;
