import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import {
  Category,
  Currency,
  DebtWithMonthlyStatus,
  CreateDebtInput,
  UpdateDebtInput,
} from '../types';

interface DebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (debtData: CreateDebtInput | UpdateDebtInput) => Promise<void>;
  debt?: DebtWithMonthlyStatus | null;
  categories: Category[];
  currencies: Currency[];
  baseCurrency: string;
  defaultCategoryId?: number;
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
}) => {
  const isEditing = Boolean(debt);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [currency, setCurrency] = useState('USD');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [remainingBalance, setRemainingBalance] = useState<string>('');
  const [monthlyPayment, setMonthlyPayment] = useState<string>('');
  const [dueDay, setDueDay] = useState<number>(1);
  const [interestRate, setInterestRate] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form state
  useEffect(() => {
    if (!isOpen) return;

    if (debt) {
      setName(debt.name);
      setCategoryId(debt.category_id);
      setCurrency(debt.currency || baseCurrency || 'USD');
      setTotalAmount(debt.total_amount ? String(debt.total_amount) : '');
      setRemainingBalance(
        debt.remaining_balance !== undefined ? String(debt.remaining_balance) : ''
      );
      setMonthlyPayment(debt.monthly_payment ? String(debt.monthly_payment) : '');
      setDueDay(debt.due_day || 1);
      setInterestRate(
        debt.interest_rate !== null && debt.interest_rate !== undefined
          ? String(debt.interest_rate)
          : ''
      );
      setNotes(debt.notes || '');
    } else {
      setName('');
      setCategoryId(defaultCategoryId || (categories[0] ? categories[0].id : 1));
      setCurrency(baseCurrency || 'USD');
      setTotalAmount('');
      setRemainingBalance('');
      setMonthlyPayment('');
      setDueDay(1);
      setInterestRate('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, debt, categories, baseCurrency, defaultCategoryId]);

  if (!isOpen) return null;

  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
    // In create mode, if remaining balance is unset or matched previous total, auto-update it
    if (!isEditing && (!remainingBalance || remainingBalance === totalAmount)) {
      setRemainingBalance(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedTotal = parseFloat(totalAmount);
    const parsedRemaining = remainingBalance ? parseFloat(remainingBalance) : parsedTotal;
    const parsedMonthly = parseFloat(monthlyPayment);
    const parsedDueDay = parseInt(String(dueDay), 10);
    const parsedInterest = interestRate ? parseFloat(interestRate) : undefined;

    if (!name.trim()) {
      setError('Please provide a name for this debt');
      return;
    }

    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      setError('Total amount must be greater than zero');
      return;
    }

    if (isNaN(parsedRemaining) || parsedRemaining < 0) {
      setError('Remaining balance cannot be negative');
      return;
    }

    if (isNaN(parsedMonthly) || parsedMonthly <= 0) {
      setError('Monthly payment must be greater than zero');
      return;
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
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {isEditing ? `Edit Debt: ${debt?.name}` : 'Add New Debt'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
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
                Debt Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Car Loan, Chase Visa"
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

          {/* Currency, Total Amount & Remaining Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Total Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => handleTotalAmountChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Monthly Payment, Due Day, Interest Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                onChange={(e) => setMonthlyPayment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Due Day (1-31) *
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

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Account numbers, payoff strategy notes, or terms..."
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
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Create Debt'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DebtModal;
