import {
  Landmark,
  CreditCard,
  CalendarClock,
  Tag,
  Wallet,
  Home,
  Car,
  GraduationCap,
  ShoppingBag,
  FileText,
  PiggyBank,
  Shield,
  HeartPulse,
  DollarSign,
  Briefcase,
  Receipt,
  LucideIcon,
} from 'lucide-react';

/**
 * Format a number as currency in the given currency code (e.g. $1,234.56, €50.00).
 */
export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code is not supported by Intl
    const formatted = Math.abs(amount).toFixed(2);
    const sign = amount < 0 ? '-' : '';
    return `${sign}${currency.toUpperCase()} ${formatted}`;
  }
}

/**
 * Convert YYYY-MM string to human readable Month Year (e.g. "2026-09" -> "September 2026").
 */
export function formatMonthYear(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) {
    return monthStr;
  }
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthNumStr, 10) - 1;

  if (isNaN(year) || isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return monthStr;
  }

  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Returns current local date in YYYY-MM-DD format (avoids UTC timezone shift).
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the current month string in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the previous month in YYYY-MM format given YYYY-MM.
 */
export function getPreviousMonth(monthStr: string): string {
  const [yearStr, monthNumStr] = (monthStr || getCurrentMonth()).split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthNumStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Returns the next month in YYYY-MM format given YYYY-MM.
 */
export function getNextMonth(monthStr: string): string {
  const [yearStr, monthNumStr] = (monthStr || getCurrentMonth()).split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthNumStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Format day of month with ordinal suffix (e.g. 1 -> "1st", 22 -> "22nd").
 */
export function formatOrdinalDay(day: number): string {
  if (!day || day < 1 || day > 31) return `${day}`;
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

/**
 * Format date string (YYYY-MM-DD) into readable format (e.g. "Sep 15, 2026" or "Sep 15").
 */
export function formatDate(dateStr: string | null | undefined, includeYear: boolean = true): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {}),
      });
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
    });
  } catch {
    return dateStr;
  }
}

/**
 * Map of string names to Lucide icons.
 */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  landmark: Landmark,
  'credit-card': CreditCard,
  creditcard: CreditCard,
  'calendar-clock': CalendarClock,
  calendarclock: CalendarClock,
  tag: Tag,
  wallet: Wallet,
  home: Home,
  car: Car,
  'graduation-cap': GraduationCap,
  graduationcap: GraduationCap,
  'shopping-bag': ShoppingBag,
  shoppingbag: ShoppingBag,
  'file-text': FileText,
  filetext: FileText,
  'piggy-bank': PiggyBank,
  piggybank: PiggyBank,
  shield: Shield,
  'heart-pulse': HeartPulse,
  heartpulse: HeartPulse,
  'dollar-sign': DollarSign,
  dollarsign: DollarSign,
  briefcase: Briefcase,
  receipt: Receipt,
};

export function getCategoryIcon(iconName?: string | null): LucideIcon {
  if (!iconName) return Wallet;
  const key = iconName.toLowerCase().trim();
  return CATEGORY_ICON_MAP[key] || Wallet;
}

/**
 * Popular icons available for category selection.
 */
export const POPULAR_CATEGORY_ICONS = [
  { name: 'wallet', label: 'Wallet', icon: Wallet },
  { name: 'landmark', label: 'Bank / Loan', icon: Landmark },
  { name: 'credit-card', label: 'Credit Card', icon: CreditCard },
  { name: 'calendar-clock', label: 'Installment', icon: CalendarClock },
  { name: 'tag', label: 'Tag / General', icon: Tag },
  { name: 'home', label: 'Mortgage / Home', icon: Home },
  { name: 'car', label: 'Auto / Vehicle', icon: Car },
  { name: 'graduation-cap', label: 'Education', icon: GraduationCap },
  { name: 'shopping-bag', label: 'Shopping', icon: ShoppingBag },
  { name: 'piggy-bank', label: 'Savings', icon: PiggyBank },
  { name: 'shield', label: 'Insurance', icon: Shield },
  { name: 'receipt', label: 'Bills', icon: Receipt },
];

/**
 * Preset colors for category selection.
 */
export const PRESET_CATEGORY_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#64748B', // Slate
];
