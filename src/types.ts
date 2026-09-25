export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface CreateCategoryInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
  icon?: string;
}

export type DebtType = 'standard' | 'pawning';

export interface Debt {
  id: number;
  category_id: number;
  name: string;
  total_amount: number;
  remaining_balance: number;
  monthly_payment: number;
  currency: string;
  due_day: number;
  interest_rate: number | null;
  term_months: number | null;
  start_month: string;
  notes: string | null;
  is_active: number;
  debt_type?: DebtType;
  debtType?: DebtType;
  created_at: string;
  updated_at: string;
}

export interface CreateDebtInput {
  category_id: number;
  name: string;
  total_amount: number;
  remaining_balance?: number;
  monthly_payment: number;
  currency?: string;
  due_day?: number;
  interest_rate?: number;
  term_months?: number;
  start_month?: string;
  startMonth?: string;
  debt_type?: DebtType;
  debtType?: DebtType;
  notes?: string;
}

export interface UpdateDebtInput {
  category_id?: number;
  name?: string;
  total_amount?: number;
  remaining_balance?: number;
  monthly_payment?: number;
  currency?: string;
  due_day?: number;
  interest_rate?: number;
  term_months?: number;
  start_month?: string;
  startMonth?: string;
  debt_type?: DebtType;
  debtType?: DebtType;
  notes?: string;
  is_active?: number;
}

export interface DebtWithMonthlyStatus extends Debt {
  category_name?: string;
  category_color?: string;
  category_icon?: string | null;
  is_paid: boolean;
  is_upcoming: boolean;
  paid_amount: number;
  paid_at: string | null;
  payment_id: number | null;
  remaining_months: number;
  projected_payoff_date: string | null;
  converted_monthly_payment?: number;
  converted_remaining_balance?: number;
  accrued_interest?: number;
  total_pawn_payoff?: number;
}

export interface Payment {
  id: number;
  debt_id: number;
  amount: number;
  currency: string;
  payment_date: string;
  month_period: string;
  notes: string | null;
  created_at: string;
}

export interface CreatePaymentInput {
  debt_id: number;
  amount: number;
  currency: string;
  payment_date: string;
  month_period: string;
  notes?: string;
}

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  updated_at: string;
}

export interface AppSettings {
  key: string;
  value: string;
}

export interface CategorySummary {
  category_id: number;
  category_name: string;
  category_color: string;
  total_due: number;
  total_paid: number;
  remaining_balance: number;
  debt_count?: number;
  totalDebt?: number;
  monthlyObligations?: number;
  debtCount?: number;
}

export interface MonthlySummary {
  month: string;
  base_currency: string;
  total_debt: number;
  monthly_obligations: number;
  paid_this_month: number;
  pending_this_month: number;
  percentage_paid: number;
  category_breakdown: CategorySummary[];
}
