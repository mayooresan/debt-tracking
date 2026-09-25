import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Clock, Calculator, Gem } from 'lucide-react';
import {
  Category,
  Currency,
  DebtWithMonthlyStatus,
  CreateDebtInput,
  UpdateDebtInput,
  DebtType,
} from '../types';
import { formatCurrency, formatMonthYear } from '../utils/formatters';

interface DebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (debtData: CreateDebtInput | UpdateDebtInput) => Promise<void>;
  debt?: DebtWithMonthlyStatus | null;
  categories: Category[];
  currencies: Currency[];
  baseCurrency: string;
  defaultCategoryId?: number;
  selectedMonth?: string;
}

export const DebtModal: React.FC<DebtModalProps> = ({
  isOpen,
  onClose,
  onSave,
  debt,
  categories,
  currencies,
  baseCurrency,
  defaultCategoryId,
  selectedMonth,
}) => {
  const isEditing = Boolean(debt);

  const [debtType, setDebtType] = useState<DebtType>('standard');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [currency, setCurrency] = useState('USD');
  const [startMonth, setStartMonth] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [remainingBalance, setRemainingBalance] = useState<string>('');
  const [monthlyPayment, setMonthlyPayment] = useState<string>('');
  const [termMonths, setTermMonths] = useState<string>('');
  const [dueDay, setDueDay] = useState<number>(1);
  const [interestRate, setInterestRate] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form state
  useEffect(() => {
    if (!isOpen) return;

    if (debt) {
      const type = (debt.debt_type || debt.debtType || 'standard') as DebtType;
      setDebtType(type);
      setName(debt.name);
      setCategoryId(debt.category_id);
      setCurrency(debt.currency || baseCurrency || 'USD');
      setStartMonth(
        debt.start_month || debt.startMonth || selectedMonth || new Date().toISOString().slice(0, 7)
      );
      setTotalAmount(debt.total_amount ? String(debt.total_amount) : '');
      setRemainingBalance(
        debt.remaining_balance !== undefined ? String(debt.remaining_balance) : ''
      );
      setMonthlyPayment(debt.monthly_payment ? String(debt.monthly_payment) : '');
      setTermMonths(
        debt.term_months
          ? String(debt.term_months)
          : debt.monthly_payment > 0 && debt.total_amount
          ? String(Math.ceil(debt.total_amount / debt.monthly_payment))
          : ''
      );
      setDueDay(debt.due_day || 1);
      setInterestRate(
        debt.interest_rate !== null && debt.interest_rate !== undefined
          ? String(debt.interest_rate)
          : ''
      );
      setNotes(debt.notes || '');
    } else {
      const defaultCat = categories.find((c) => c.id === defaultCategoryId);
      const isDefaultPawn =
        defaultCat &&
        (defaultCat.name.toLowerCase() === 'pawning' || defaultCat.name.toLowerCase() === 'pawn');
      setDebtType(isDefaultPawn ? 'pawning' : 'standard');
      setName('');
      setCategoryId(defaultCategoryId || (categories[0] ? categories[0].id : 1));
      setCurrency(baseCurrency || 'USD');
      setStartMonth(selectedMonth || new Date().toISOString().slice(0, 7));
      setTotalAmount('');
      setRemainingBalance('');
      setMonthlyPayment('');
      setTermMonths('');
      setDueDay(1);
      setInterestRate('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, debt, categories, baseCurrency, defaultCategoryId, selectedMonth]);

  if (!isOpen) return null;

  // Handle switching debt type tab
  const handleDebtTypeChange = (type: DebtType) => {
    setDebtType(type);
    if (type === 'pawning') {
      const pawnCat = categories.find(
        (c) => c.name.toLowerCase() === 'pawning' || c.name.toLowerCase() === 'pawn'
      );
      if (pawnCat && (!isEditing || !categoryId)) {
        setCategoryId(pawnCat.id);
      }
    }
  };

  // When Monthly Payment changes: if termMonths is set, calculate total amount
  const handleMonthlyPaymentChange = (val: string) => {
    setMonthlyPayment(val);
    const monthly = parseFloat(val);
    const months = parseInt(termMonths, 10);
    if (!isNaN(monthly) && monthly > 0 && !isNaN(months) && months > 0) {
      const calculatedTotal = (monthly * months).toFixed(2);
      setTotalAmount(calculatedTotal);
      if (!isEditing && (!remainingBalance || remainingBalance === totalAmount)) {
        setRemainingBalance(calculatedTotal);
      }
    }
  };

  // When Number of Months changes: if monthly payment is set, calculate total amount
  const handleTermMonthsChange = (val: string) => {
    setTermMonths(val);
    const months = parseInt(val, 10);
    const monthly = parseFloat(monthlyPayment);
    if (!isNaN(monthly) && monthly > 0 && !isNaN(months) && months > 0) {
      const calculatedTotal = (monthly * months).toFixed(2);
      setTotalAmount(calculatedTotal);
      if (!isEditing && (!remainingBalance || remainingBalance === totalAmount)) {
        setRemainingBalance(calculatedTotal);
      }
    }
  };

  // When Total Amount is edited manually
  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
    if (!isEditing && (!remainingBalance || remainingBalance === totalAmount)) {
      setRemainingBalance(val);
    }
    if (debtType === 'standard') {
      const total = parseFloat(val);
      const monthly = parseFloat(monthlyPayment);
      if (!isNaN(total) && total > 0 && !isNaN(monthly) && monthly > 0) {
        setTermMonths(String(Math.ceil(total / monthly)));
      }
    }
  };

  // Live monthly interest preview for pawning debts
  const pawningMonthlyInterest = (() => {
    const base = parseFloat(totalAmount);
    const rate = parseFloat(interestRate);
    if (isNaN(base) || base <= 0) return 0;
    if (isNaN(rate) || rate < 0) return 0;
    return Math.round(base * (rate / 100) * 100) / 100;
  })();

  // Calculate live payoff projection (standard debts only)
  const payoffProjection = (() => {
    if (debtType === 'pawning') return null;

    const monthly = parseFloat(monthlyPayment);
    const rem = remainingBalance ? parseFloat(remainingBalance) : parseFloat(totalAmount);
    const monthsCount =
      !isNaN(rem) && rem > 0 && !isNaN(monthly) && monthly > 0
        ? Math.ceil(rem / monthly)
        : termMonths
        ? parseInt(termMonths, 10)
        : 0;

    if (!monthsCount || monthsCount <= 0 || isNaN(monthsCount)) return null;

    const [sYearStr, sMonthStr] = (startMonth || '').split('-');
    let sYear = parseInt(sYearStr, 10);
    let sMonth = parseInt(sMonthStr, 10);
    if (isNaN(sYear) || isNaN(sMonth)) {
      const now = new Date();
      sYear = now.getFullYear();
      sMonth = now.getMonth() + 1;
    }
    const totalMonths = sYear * 12 + (sMonth - 1) + (monthsCount - 1);
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1;
    const targetPeriod = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const totalToPay =
      !isNaN(rem) && rem > 0
        ? rem
        : !isNaN(monthly) && termMonths
        ? monthly * parseInt(termMonths, 10)
        : 0;

    return {
      months: monthsCount,
      payoffDateStr: formatMonthYear(targetPeriod),
      totalToPay,
    };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedTotal = parseFloat(totalAmount);
    const parsedRemaining = remainingBalance ? parseFloat(remainingBalance) : parsedTotal;
    const parsedDueDay = parseInt(String(dueDay), 10);
    const parsedInterest = interestRate ? parseFloat(interestRate) : undefined;
    const trimmedStartMonth = startMonth.trim();

    if (!name.trim()) {
      setError('Please provide a name for this debt');
      return;
    }

    if (!trimmedStartMonth || !/^\d{4}-\d{2}$/.test(trimmedStartMonth)) {
      setError('Please provide a valid start month (YYYY-MM)');
      return;
    }

    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      setError(
        debtType === 'pawning'
          ? 'Pawn base amount must be greater than zero'
          : 'Total amount must be greater than zero'
      );
      return;
    }

    if (isNaN(parsedRemaining) || parsedRemaining < 0) {
      setError('Remaining balance cannot be negative');
      return;
    }

    let parsedMonthly: number;
    let parsedTermMonths: number | undefined;

    if (debtType === 'pawning') {
      if (parsedInterest !== undefined && (isNaN(parsedInterest) || parsedInterest < 0)) {
        setError('Interest rate cannot be negative');
        return;
      }
      parsedMonthly =
        Math.round(parsedTotal * (parseFloat(interestRate || '0') / 100) * 100) / 100;
      parsedTermMonths = undefined;
    } else {
      parsedMonthly = parseFloat(monthlyPayment);
      if (isNaN(parsedMonthly) || parsedMonthly <= 0) {
        setError('Monthly payment must be greater than zero');
        return;
      }
      parsedTermMonths = termMonths ? parseInt(termMonths, 10) : undefined;
      if (parsedTermMonths !== undefined && (isNaN(parsedTermMonths) || parsedTermMonths <= 0)) {
        setError('Number of months must be a positive number');
        return;
      }
    }

    if (isNaN(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setError('Due day must be between 1 and 31');
      return;
    }

    if (!categoryId) {
      setError('Please select a valid category');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && debt) {
        const updateData: UpdateDebtInput = {
          name: name.trim(),
          category_id: categoryId,
          currency,
          total_amount: parsedTotal,
          remaining_balance: parsedRemaining,
          monthly_payment: parsedMonthly,
          due_day: parsedDueDay,
          interest_rate: parsedInterest !== undefined ? parsedInterest : undefined,
          term_months: parsedTermMonths,
          start_month: trimmedStartMonth,
          debt_type: debtType,
          notes: notes.trim() || undefined,
        };
        await onSave(updateData);
      } else {
        const createData: CreateDebtInput = {
          name: name.trim(),
          category_id: categoryId,
          currency,
          total_amount: parsedTotal,
          remaining_balance: parsedRemaining,
          monthly_payment: parsedMonthly,
          due_day: parsedDueDay,
          interest_rate: parsedInterest !== undefined ? parsedInterest : undefined,
          term_months: parsedTermMonths,
          start_month: trimmedStartMonth,
          debt_type: debtType,
          notes: notes.trim() || undefined,
        };
        await onSave(createData);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save debt. Please review your inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">
              {isEditing
                ? `Edit ${debtType === 'pawning' ? 'Pawn' : 'Debt'}: ${debt?.name}`
                : debtType === 'pawning'
                ? 'Add New Pawn Debt'
                : 'Add New Debt'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Debt Type Selector Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => handleDebtTypeChange('standard')}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                debtType === 'standard'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Standard Debt
            </button>
            <button
              type="button"
              onClick={() => handleDebtTypeChange('pawning')}
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                debtType === 'pawning'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Gem className="w-3.5 h-3.5 text-amber-600" />
              Pawning
            </button>
          </div>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {debtType === 'pawning' ? 'Pawned Item / Name *' : 'Debt Name *'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  debtType === 'pawning'
                    ? 'e.g. Gold Jewelry, Camera Pawn'
                    : 'e.g. Car Loan, Chase Visa'
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Standard: Currency, Monthly Payment & Number of Months (Installment Term) */}
          {debtType === 'standard' ? (
            <div className="bg-blue-50/40 p-3.5 rounded-xl border border-blue-100/70 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                <Calculator className="w-3.5 h-3.5 text-blue-600" />
                <span>Installment & Payment Details</span>
                <span className="text-[10px] font-normal text-blue-600 ml-auto hidden sm:inline">
                  Monthly × Months auto-calculates Balance
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Start Month *
                  </label>
                  <input
                    type="month"
                    required
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Currency *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  >
                    {currencies && currencies.length > 0 ? (
                      currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol})
                        </option>
                      ))
                    ) : (
                      <option value="USD">USD ($)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Monthly Payment *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={monthlyPayment}
                    onChange={(e) => handleMonthlyPaymentChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Number of Months
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 12, 24"
                    value={termMonths}
                    onChange={(e) => handleTermMonthsChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Total Amount & Remaining Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Total Debt Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => handleTotalAmountChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Remaining Balance *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={remainingBalance}
                    onChange={(e) => setRemainingBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Live Payoff Projection Banner */}
              {payoffProjection && (
                <div className="p-2.5 bg-white border border-blue-200/80 rounded-xl flex items-center justify-between text-xs shadow-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <span className="text-gray-500">Finish Paying: </span>
                      <strong className="text-blue-900 font-bold">{payoffProjection.payoffDateStr}</strong>
                      <span className="text-gray-500 ml-1.5 font-medium">({payoffProjection.months} {payoffProjection.months === 1 ? 'month' : 'months'} left)</span>
                    </div>
                  </div>
                  <div className="text-right font-bold text-blue-700">
                    {formatCurrency(payoffProjection.totalToPay, currency)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Pawning: Base Amount, Interest Rate, Live Preview Box, No Term Months */
            <div className="bg-amber-50/40 p-3.5 rounded-xl border border-amber-200/70 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <Gem className="w-3.5 h-3.5 text-amber-600" />
                <span>Pawning & Collateral Details</span>
                <span className="text-[10px] font-normal text-amber-700 ml-auto hidden sm:inline">
                  Start month enables back-dating pawns
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Start Month *
                  </label>
                  <input
                    type="month"
                    required
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Currency *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  >
                    {currencies && currencies.length > 0 ? (
                      currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol})
                        </option>
                      ))
                    ) : (
                      <option value="USD">USD ($)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Pawn Base Amount & Remaining Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Pawn Base Amount / Principal *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => handleTotalAmountChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Remaining Balance *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={remainingBalance}
                    onChange={(e) => setRemainingBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Due Day & Monthly Interest Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Due Day of Month (1-31) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={dueDay}
                    onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Monthly Interest Rate (% / month)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 2.5"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Live Preview Box */}
              <div className="p-2.5 bg-white border border-amber-200/80 rounded-xl flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2">
                  <Gem className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <div>
                    <span className="text-gray-500">Monthly Interest: </span>
                    <span className="text-gray-700 font-medium">
                      {parseFloat(totalAmount) > 0
                        ? formatCurrency(parseFloat(totalAmount), currency)
                        : 'Base Amount'}{' '}
                      × {interestRate ? `${interestRate}%` : '0%'} =
                    </span>
                    <strong className="text-amber-900 font-bold ml-1.5">
                      {formatCurrency(pawningMonthlyInterest, currency)} / month
                    </strong>
                  </div>
                </div>
                <div className="text-right font-bold text-amber-700 hidden sm:block">
                  {formatCurrency(pawningMonthlyInterest, currency)}
                </div>
              </div>
            </div>
          )}

          {/* Due Day & APR (for Standard Debt) */}
          {debtType === 'standard' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Due Day of Month (1-31) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={dueDay}
                  onChange={(e) => setDueDay(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  APR % (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 14.5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder={
                debtType === 'pawning'
                  ? 'Pawn ticket #, item description, location, or terms...'
                  : 'Account numbers, payoff strategy notes, or terms...'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-md transition disabled:opacity-60 ${
                debtType === 'pawning'
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>
                  {isEditing
                    ? 'Save Changes'
                    : debtType === 'pawning'
                    ? 'Create Pawn Debt'
                    : 'Create Debt'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DebtModal;
