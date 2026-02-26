/**
 * Global filter context — persists filter state across tab switches in the SPA.
 * Analytics and Transactions each have their own filter slate.
 * When Analytics navigates to Transactions it uses `navigateToTransactions()`.
 */
import { createContext, useContext, useReducer, useCallback } from "react";
import type { ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AnalyticsFilters {
  dateFrom: string;
  dateTo: string;
  bankName: string;
  categoryIds: number[];   // selected to INCLUDE (empty = all)
  tagIds: number[];        // selected to INCLUDE (empty = all)
  preset: string;          // "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "all"
}

export interface TransactionFilters {
  search: string;
  bankName: string;
  categoryId: number | null;
  tagIds: number[];
  dateFrom: string;
  dateTo: string;
  /** Set to "analytics" when the user clicked through from an analytics chart */
  fromAnalytics: boolean;
}

interface FilterContextValue {
  analyticsFilters: AnalyticsFilters;
  updateAnalyticsFilters: (patch: Partial<AnalyticsFilters>) => void;
  transactionFilters: TransactionFilters;
  updateTransactionFilters: (patch: Partial<TransactionFilters>) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const defaultAnalytics: AnalyticsFilters = {
  dateFrom: "", dateTo: "", bankName: "", categoryIds: [], tagIds: [], preset: "all",
};
const defaultTransactions: TransactionFilters = {
  search: "", bankName: "", categoryId: null, tagIds: [], dateFrom: "", dateTo: "",
  fromAnalytics: false,
};

// ── Context ───────────────────────────────────────────────────────────────────
const FilterContext = createContext<FilterContextValue | null>(null);

function reducer<T>(state: T, patch: Partial<T>): T {
  return { ...state, ...patch };
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [analyticsFilters, dispatchAnalytics] = useReducer(reducer<AnalyticsFilters>, defaultAnalytics);
  const [transactionFilters, dispatchTransactions] = useReducer(reducer<TransactionFilters>, defaultTransactions);

  const updateAnalyticsFilters = useCallback((patch: Partial<AnalyticsFilters>) => {
    dispatchAnalytics(patch);
  }, []);

  const updateTransactionFilters = useCallback((patch: Partial<TransactionFilters>) => {
    dispatchTransactions(patch);
  }, []);

  return (
    <FilterContext.Provider value={{
      analyticsFilters,
      updateAnalyticsFilters,
      transactionFilters,
      updateTransactionFilters,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useAnalyticsFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useAnalyticsFilters must be inside FilterProvider");
  return { filters: ctx.analyticsFilters, set: ctx.updateAnalyticsFilters };
}

export function useTransactionFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useTransactionFilters must be inside FilterProvider");
  return { filters: ctx.transactionFilters, set: ctx.updateTransactionFilters };
}
