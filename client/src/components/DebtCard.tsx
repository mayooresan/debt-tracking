import React, { useState } from 'react';
import {
  Check,
  RotateCcw,
  Edit2,
  Trash2,
  Calendar,
  Percent,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { DebtWithMonthlyStatus } from '../types';
import {
  formatCurrency,
  formatOrdinalDay,
  formatDate,
  getCategoryIcon,
} from '../utils/formatters';

interface DebtCardProps {
  debt: DebtWithMonthlyStatus;
  baseCurrency: string;
  onMarkPaid: (debt: DebtWithMonthlyStatus) => void;
  onUndoPayment: (paymentId: number) => Promise<void> | void;
  onEdit: (debt: DebtWithMonthlyStatus) => void;
  onDelete: (debt: DebtWithMonthlyStatus) => void;
}

export const DebtCard: React.FC<DebtCardProps> = ({
  debt,
  baseCurrency,
  onMarkPaid,
  onUndoPayment,
  onEdit,
  onDelete,
}) => {
  const [isUndoing, setIsUndoing] = useState(false);
  const CategoryIcon = getCategoryIcon(debt.category_icon);

  // Payoff progress
  const payoffPercent =
    debt.total_amount > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((debt.total_amount - debt.remaining_balance) / debt.total_amount) * 100
            )
          )
        )
      : 100;

  const isMultiCurrency = debt.currency.toUpperCase() !== baseCurrency.toUpperCase();

  const handleUndo = async () => {
    if (!debt.payment_id) return;
    setIsUndoing(true);
    try {
      await onUndoPayment(debt.payment_id);
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        debt.is_paid
          ? 'border-emerald-200/90 shadow-sm bg-gradient-to-b from-white to-emerald-50/20'
          : 'border-gray-200/90 shadow-sm hover:shadow-md hover:border-gray-300'
      }`}
    >
      {/* Top Section */}
      <div className="p-5">
        {/* Header: Name, Category Badge & Action Buttons */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-xs"
                style={{
                  backgroundColor: `${debt.category_color || '#3B82F6'}15`,
                  color: debt.category_color || '#3B82F6',
                  border: `1px solid ${debt.category_color || '#3B82F6'}30`,
                }}
              >
                <CategoryIcon className="w-3 h-3" />
                <span className="truncate max-w-[120px]">
                  {debt.category_name || 'General'}
                </span>
              </span>

              {debt.interest_rate !== null &&
                debt.interest_rate !== undefined &&
                debt.interest_rate > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                    <Percent className="w-2.5 h-2.5" />
                    <span>{debt.interest_rate}% APR</span>
                  </span>
                )}
            </div>

            <h3 className="text-base font-bold text-gray-900 truncate tracking-tight" title={debt.name}>
              {debt.name}
            </h3>
          </div>

          {/* Edit & Delete toolbar */}
          <div className="flex items-center gap-1 flex-shrink-0 text-gray-400">
            <button
              type="button"
              onClick={() => onEdit(debt)}
              className="p-1.5 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="Edit Debt"
              aria-label={`Edit ${debt.name}`}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(debt)}
              className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Delete Debt"
              aria-label={`Delete ${debt.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Due Date & Monthly Payment */}
        <div className="grid grid-cols-2 gap-3 py-3 px-3.5 bg-gray-50/70 rounded-xl mb-4 border border-gray-100">
          <div>
            <span className="text-[11px] font-medium text-gray-500 flex items-center gap-1 mb-0.5">
              <Calendar className="w-3 h-3" />
              Due Date
            </span>
            <span className="text-xs font-bold text-gray-800">
              {formatOrdinalDay(debt.due_day)} of month
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-gray-500 block mb-0.5">
              Monthly Payment
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-900">
                {formatCurrency(debt.monthly_payment, debt.currency)}
              </span>
              {isMultiCurrency && debt.converted_monthly_payment !== undefined && (
                <span className="text-[10px] text-gray-500 font-medium">
                  ~{formatCurrency(debt.converted_monthly_payment, baseCurrency)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remaining Balance & Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline text-xs">
            <span className="text-gray-500 font-medium">Balance</span>
            <div className="text-right">
              <span className="font-bold text-gray-900">
                {formatCurrency(debt.remaining_balance, debt.currency)}
              </span>
              <span className="text-gray-400 font-normal ml-1">
                / {formatCurrency(debt.total_amount, debt.currency)}
              </span>
              {isMultiCurrency && debt.converted_remaining_balance !== undefined && (
                <div className="text-[10px] text-gray-500">
                  ~{formatCurrency(debt.converted_remaining_balance, baseCurrency)} remaining
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                debt.remaining_balance === 0
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600'
              }`}
              style={{ width: `${payoffPercent}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-gray-500">
            <span>{payoffPercent}% paid off</span>
            {debt.remaining_balance === 0 && (
              <span className="font-semibold text-emerald-600">Fully Paid!</span>
            )}
          </div>
        </div>

        {/* Notes, if present */}
        {debt.notes && (
          <div className="mt-3 text-xs text-gray-500 flex items-start gap-1.5 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100/60">
            <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{debt.notes}</span>
          </div>
        )}
      </div>

      {/* Bottom Payment Action Bar */}
      <div className="px-5 py-3.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-3">
        {debt.is_paid ? (
          <>
            <div className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="text-xs font-semibold leading-tight">
                <span>Paid ✓</span>
                {debt.paid_at && (
                  <span className="text-[11px] text-emerald-600/80 font-normal ml-1">
                    ({formatDate(debt.paid_at, false)})
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={isUndoing}
              onClick={handleUndo}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 hover:border-red-200 transition disabled:opacity-50"
              title="Undo monthly payment"
            >
              {isUndoing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              <span>Undo</span>
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-gray-500 font-medium">
              Due: {formatCurrency(debt.monthly_payment, debt.currency)}
            </div>

            <button
              type="button"
              onClick={() => onMarkPaid(debt)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs shadow-emerald-600/20 transition active:scale-[0.98]"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark Paid</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default DebtCard;
