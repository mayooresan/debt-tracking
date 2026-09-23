import React from 'react';
import {
  DollarSign,
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { MonthlySummary } from '../types';
import { formatCurrency, formatMonthYear } from '../utils/formatters';

interface KpiSummaryProps {
  summary: MonthlySummary | null;
  baseCurrency: string;
  totalBaselineDebt?: number;
  monthStr: string;
}

export const KpiSummary: React.FC<KpiSummaryProps> = ({
  summary,
  baseCurrency,
  totalBaselineDebt = 0,
  monthStr,
}) => {
  const totalDebt = summary?.total_debt ?? 0;
  const monthlyDue = summary?.monthly_obligations ?? 0;
  const paidThisMonth = summary?.paid_this_month ?? 0;
  const pendingThisMonth = summary?.pending_this_month ?? 0;
  const percentagePaid = Math.min(100, Math.max(0, Math.round(summary?.percentage_paid ?? 0)));

  // Calculate total debt payoff progress if baseline is available
  const overallPayoffPercent =
    totalBaselineDebt > 0
      ? Math.min(100, Math.max(0, Math.round(((totalBaselineDebt - totalDebt) / totalBaselineDebt) * 100)))
      : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 1. Total Debt Balance */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Total Debt Balance
          </span>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {formatCurrency(totalDebt, baseCurrency)}
        </div>
        <div className="mt-3">
          {overallPayoffPercent !== null && overallPayoffPercent > 0 ? (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Overall Paid Off</span>
                <span className="font-semibold text-blue-600">{overallPayoffPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${overallPayoffPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
              <span>Current outstanding balance</span>
            </p>
          )}
        </div>
      </div>

      {/* 2. Monthly Obligations */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Monthly Due ({formatMonthYear(monthStr).split(' ')[0]})
          </span>
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <CalendarClock className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">
          {formatCurrency(monthlyDue, baseCurrency)}
        </div>
        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1">
          <span>Target obligations for {formatMonthYear(monthStr)}</span>
        </p>
      </div>

      {/* 3. Paid This Month */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Paid This Month
          </span>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-emerald-600 tracking-tight">
            {formatCurrency(paidThisMonth, baseCurrency)}
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {percentagePaid}%
          </span>
        </div>
        <div className="mt-3">
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${percentagePaid}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. Remaining Due This Month */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Remaining Due
          </span>
          <div
            className={`p-2 rounded-xl ${
              pendingThisMonth > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {pendingThisMonth > 0 ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <div
            className={`text-2xl font-bold tracking-tight ${
              pendingThisMonth > 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {formatCurrency(pendingThisMonth, baseCurrency)}
          </div>
          {pendingThisMonth > 0 ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Pending
            </span>
          ) : (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              All Settled
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {pendingThisMonth > 0
            ? 'Pending payment before month end'
            : 'All monthly obligations completed! 🎉'}
        </p>
      </div>
    </div>
  );
};

export default KpiSummary;
