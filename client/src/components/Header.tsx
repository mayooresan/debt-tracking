import React from 'react';
import {
  Landmark,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  FolderKanban,
  Calendar,
  Globe,
} from 'lucide-react';
import { Currency } from '../types';
import {
  formatMonthYear,
  getCurrentMonth,
  getPreviousMonth,
  getNextMonth,
} from '../utils/formatters';

interface HeaderProps {
  currentMonth: string;
  onMonthChange: (month: string) => void;
  baseCurrency: string;
  currencies: Currency[];
  onBaseCurrencyChange: (currency: string) => void;
  onOpenAddDebt: () => void;
  onOpenCategories: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMonth,
  onMonthChange,
  baseCurrency,
  currencies,
  onBaseCurrencyChange,
  onOpenAddDebt,
  onOpenCategories,
  onLogout,
}) => {
  const isCurrentMonth = currentMonth === getCurrentMonth();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-3">
          {/* Logo & Month Navigator */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/20">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                  Debt Management
                </h1>
                <p className="text-[11px] text-gray-500 font-medium">
                  Track & Paydown
                </p>
              </div>
            </div>

            {/* Month Navigator */}
            <div className="flex items-center bg-gray-50 border border-gray-200/80 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => onMonthChange(getPreviousMonth(currentMonth))}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white transition shadow-sm hover:shadow"
                title="Previous Month"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-sm font-semibold text-gray-800 min-w-[130px] text-center select-none">
                {formatMonthYear(currentMonth)}
              </span>

              <button
                type="button"
                onClick={() => onMonthChange(getNextMonth(currentMonth))}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white transition shadow-sm hover:shadow"
                title="Next Month"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={() => onMonthChange(getCurrentMonth())}
                  className="ml-1 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition flex items-center gap-1"
                  title="Jump to Current Month"
                >
                  <Calendar className="w-3 h-3" />
                  <span>Today</span>
                </button>
              )}
            </div>
          </div>

          {/* Controls: Base Currency, Categories, Add Debt, Logout */}
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {/* Currency selector */}
            <div className="relative flex items-center">
              <div className="absolute left-2.5 pointer-events-none text-gray-400">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <select
                id="base-currency-select"
                aria-label="Base Currency"
                value={baseCurrency}
                onChange={(e) => onBaseCurrencyChange(e.target.value)}
                className="pl-8 pr-7 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer appearance-none"
              >
                {currencies && currencies.length > 0 ? (
                  currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </option>
                  ))
                ) : (
                  <option value={baseCurrency}>{baseCurrency}</option>
                )}
              </select>
              <div className="absolute right-2 pointer-events-none text-gray-400 text-[10px]">
                ▼
              </div>
            </div>

            {/* Manage Categories Button */}
            <button
              type="button"
              onClick={onOpenCategories}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl shadow-sm transition hover:border-gray-300"
            >
              <FolderKanban className="w-3.5 h-3.5 text-gray-500" />
              <span className="hidden sm:inline">Categories</span>
            </button>

            {/* + Add Debt Button */}
            <button
              type="button"
              onClick={onOpenAddDebt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Debt</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
