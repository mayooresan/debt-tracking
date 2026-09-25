import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Inbox,
  CheckCircle,
} from 'lucide-react';
import { DebtWithMonthlyStatus, Category } from '../types';
import DebtCard from './DebtCard';
import { formatCurrency, getCategoryIcon } from '../utils/formatters';

interface DebtListProps {
  debts: DebtWithMonthlyStatus[];
  categories: Category[];
  baseCurrency: string;
  onMarkPaid: (debt: DebtWithMonthlyStatus) => void;
  onUndoPayment: (paymentId: number) => Promise<void> | void;
  onEdit: (debt: DebtWithMonthlyStatus) => void;
  onDelete: (debt: DebtWithMonthlyStatus) => void;
  onAddDebt: (categoryId?: number) => void;
  onMarkDone?: (debt: DebtWithMonthlyStatus) => void;
  onReactivate?: (debt: DebtWithMonthlyStatus) => Promise<void> | void;
}

export const DebtList: React.FC<DebtListProps> = ({
  debts,
  categories,
  baseCurrency,
  onMarkPaid,
  onUndoPayment,
  onEdit,
  onDelete,
  onAddDebt,
  onMarkDone,
  onReactivate,
}) => {
  // Collapsed categories state (default: all expanded)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<number, boolean>>({});

  const toggleCategory = (categoryId: number) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  // Group debts by category
  const categoriesWithDebts = categories.map((cat) => {
    const catDebts = debts.filter((d) => d.category_id === cat.id);
    const totalRemaining = catDebts.reduce(
      (sum, d) => sum + (d.converted_remaining_balance ?? d.remaining_balance),
      0
    );
    const totalMonthly = catDebts.reduce(
      (sum, d) => sum + (d.converted_monthly_payment ?? d.monthly_payment),
      0
    );
    const paidCount = catDebts.filter((d) => d.is_paid).length;

    return {
      category: cat,
      debts: catDebts,
      totalRemaining,
      totalMonthly,
      paidCount,
    };
  });

  // Check if there are debts with orphaned/unknown category IDs
  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const uncategorizedDebts = debts.filter((d) => !knownCategoryIds.has(d.category_id));

  // If there are absolutely no debts in the system
  if (debts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-12 text-center max-w-lg mx-auto my-8">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Inbox className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">No Debts Found</h3>
        <p className="text-sm text-gray-600 mb-6">
          You have no active debts tracked for this month. Start tracking your loans, credit
          cards, and recurring installments.
        </p>
        <button
          type="button"
          onClick={() => onAddDebt()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Your First Debt</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {categoriesWithDebts.map(({ category, debts: catDebts, totalRemaining, totalMonthly, paidCount }) => {
        const isCollapsed = Boolean(collapsedCategories[category.id]);
        const CategoryIcon = getCategoryIcon(category.icon);

        return (
          <section
            key={category.id}
            className="bg-gray-50/60 rounded-2xl border border-gray-200/80 overflow-hidden transition"
          >
            {/* Category Header Bar */}
            <div
              onClick={() => toggleCategory(category.id)}
              className="px-5 py-4 bg-white border-b border-gray-200/70 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/60 transition select-none"
            >
              {/* Left: Category Icon, Name & Count */}
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-xl text-white shadow-xs"
                  style={{ backgroundColor: category.color || '#3B82F6' }}
                >
                  <CategoryIcon className="w-4 h-4" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 tracking-tight">
                      {category.name}
                    </h2>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                      {catDebts.length} {catDebts.length === 1 ? 'debt' : 'debts'}
                    </span>
                  </div>

                  {catDebts.length > 0 && (
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        {paidCount} of {catDebts.length} paid
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Subtotals & Collapse Chevron */}
              <div className="flex items-center gap-4">
                {catDebts.length > 0 && (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-gray-500 font-medium">
                      Due: <span className="font-bold text-gray-800">{formatCurrency(totalMonthly, baseCurrency)}</span>
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Balance: {formatCurrency(totalRemaining, baseCurrency)}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategory(category.id);
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                  aria-label={isCollapsed ? 'Expand category' : 'Collapse category'}
                >
                  {isCollapsed ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Category Debts Grid */}
            {!isCollapsed && (
              <div className="p-5">
                {catDebts.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center">
                    <p className="text-xs text-gray-500 mb-3">
                      No debts tracked under {category.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => onAddDebt(category.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Debt to {category.name}</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catDebts.map((debt) => (
                      <DebtCard
                        key={debt.id}
                        debt={debt}
                        baseCurrency={baseCurrency}
                        onMarkPaid={onMarkPaid}
                        onUndoPayment={onUndoPayment}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onMarkDone={onMarkDone}
                        onReactivate={onReactivate}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Uncategorized Debts if any exist */}
      {uncategorizedDebts.length > 0 && (
        <section className="bg-gray-50/60 rounded-2xl border border-gray-200/80 overflow-hidden transition">
          <div className="px-5 py-4 bg-white border-b border-gray-200/70 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Uncategorized</h2>
            <span className="text-xs text-gray-500">{uncategorizedDebts.length} debts</span>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uncategorizedDebts.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                baseCurrency={baseCurrency}
                onMarkPaid={onMarkPaid}
                onUndoPayment={onUndoPayment}
                onEdit={onEdit}
                onDelete={onDelete}
                onMarkDone={onMarkDone}
                onReactivate={onReactivate}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default DebtList;
