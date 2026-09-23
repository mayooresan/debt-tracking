import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { DebtWithMonthlyStatus, CreatePaymentInput } from '../types';
import { formatCurrency, formatMonthYear } from '../utils/formatters';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentData: CreatePaymentInput) => Promise<void>;
  debt: DebtWithMonthlyStatus | null;
  selectedMonth: string; // "YYYY-MM"
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  debt,
  selectedMonth,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [monthPeriod, setMonthPeriod] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !debt) return;

    // Default to today's date YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);
    setAmount(debt.monthly_payment ? String(debt.monthly_payment) : '');
    setPaymentDate(today);
    setMonthPeriod(selectedMonth || today.slice(0, 7));
    setNotes('');
    setError(null);
  }, [isOpen, debt, selectedMonth]);

  if (!isOpen || !debt) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Payment amount must be greater than zero');
      return;
    }

    if (!paymentDate) {
      setError('Please select a payment date');
      return;
    }

    if (!monthPeriod || !monthPeriod.match(/^\d{4}-\d{2}$/)) {
      setError('Month period must be in YYYY-MM format');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        debt_id: debt.id,
        amount: parsedAmount,
        currency: debt.currency,
        payment_date: paymentDate,
        month_period: monthPeriod,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to record payment. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Check className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Confirm Payment</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Target Debt Card Preview */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/80">
            <div className="text-xs text-gray-500 font-medium">Marking obligation for</div>
            <div className="text-base font-bold text-gray-900 mt-0.5">{debt.name}</div>
            <div className="flex items-center justify-between text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200/60">
              <span>Remaining Balance:</span>
              <span className="font-semibold text-gray-800">
                {formatCurrency(debt.remaining_balance, debt.currency)}
              </span>
            </div>
          </div>

          {/* Amount & Currency */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Payment Amount ({debt.currency}) *
            </label>
            <div className="relative rounded-md">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-base font-bold text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-gray-400">
                {debt.currency}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Pre-filled with standard installment ({formatCurrency(debt.monthly_payment, debt.currency)}).
            </p>
          </div>

          {/* Payment Date & Month Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-gray-800 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Target Cycle *
              </label>
              <input
                type="month"
                required
                value={monthPeriod}
                onChange={(e) => setMonthPeriod(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-gray-800 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Payment Reference / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Confirmation #84920, via Autopay"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/60 leading-relaxed">
            Recording this payment will mark the obligation as paid for{' '}
            <span className="font-semibold">{formatMonthYear(monthPeriod)}</span> and
            automatically deduct{' '}
            <span className="font-semibold">
              {debt.currency} {amount || '0'}
            </span>{' '}
            from the remaining balance.
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
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Record Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
