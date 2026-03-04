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
  includeUncategorized: boolean; // show uncategorized transactions in analytics
  tagIds: number[];        // selected to INCLUDE (empty = all)
  includeUntagged: boolean; // show untagged transactions in analytics
  preset: string;          // "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "all"
}

export interface TransactionFilters {
  search: string;
  bankNames: string[];
  categoryIds: number[];
  uncategorized: boolean;
  tagIds: number[];
  untagged: boolean;
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
  dateFrom: "", dateTo: "", bankName: "", categoryIds: [], includeUncategorized: false, tagIds: [], includeUntagged: false, preset: "all",
};
const defaultTransactions: TransactionFilters = {
  search: "", bankNames: [], categoryIds: [], uncategorized: false, tagIds: [], untagged: false, dateFrom: "", dateTo: "",
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
