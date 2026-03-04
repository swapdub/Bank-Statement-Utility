// TypeScript types matching the backend Pydantic schemas

export interface BankAccountType {
  type: string;
  formats: string[];
}

export interface BankInfo {
  name: string;
  account_types: BankAccountType[];
}

export interface SupportedFormatsResponse {
  banks: BankInfo[];
}

export interface UploadResponse {
  session_id: number;
  filename: string;
  bank_name: string;
  account_type: string;
  record_count: number;
  failed_count: number;
  duplicate_count: number;
  status: string;
  message: string;
  error_details?: string[] | null;
}

export interface Transaction {
  id: number;
  upload_session_id: number;
  bank_name: string;
  account_type: string;
  transaction_date: string;
  description: string;
  debit_amount: number | null;
  credit_amount: number | null;
  cheque_ref_number: string | null;
  closing_balance: number | null;
  value_date: string | null;
  category_id: number | null;
  category_name: string | null;
  is_transfer: boolean;
  transfer_link_id: number | null;
  transfer_counterpart_id: number | null;
  tags: Tag[];
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface TransactionFilters {
  search?: string;
  bank_name?: string;      // single value (legacy)
  bank_names?: string;     // comma-separated for multi-select
  account_type?: string;
  category_id?: number;    // single value (legacy)
  category_ids?: string;   // comma-separated for multi-select
  uncategorized?: boolean;
  tag_ids?: string;  // comma-separated
  untagged?: boolean;
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  amount_type?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  keyword_count: number;
  transaction_count: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface Keyword {
  id: number;
  keyword: string;
  frequency: number;
  is_noise: boolean;
  is_user_added: boolean;
  category_id: number | null;
  category_name: string | null;
  tags: Tag[];
}

export interface TagSpending {
  tag_id: number;
  tag_name: string;
  color: string | null;
  total_debit: number;
  total_credit: number;
  transaction_count: number;
}

export interface CategorySpending {
  category_id: number | null;
  category_name: string;
  color: string | null;
  total_debit: number;
  total_credit: number;
  transaction_count: number;
}

export interface MonthlyTrend {
  month: string;
  total_debit: number;
  total_credit: number;
}

export interface AnalyticsSummary {
  total_debit: number;
  total_credit: number;
  transaction_count: number;
  categorized_count: number;
  uncategorized_count: number;
  untagged_count: number;
  category_spending: CategorySpending[];
  tag_spending: TagSpending[];
  monthly_trends: MonthlyTrend[];
  top_keywords: Keyword[];
}

// ── Transfer links ────────────────────────────────────────────────────────────

export interface TransferLinkTransaction {
  id: number;
  bank_name: string;
  account_type: string;
  transaction_date: string;
  description: string;
  debit_amount: number | null;
  credit_amount: number | null;
}

export interface TransferLink {
  id: number;
  debit_txn: TransferLinkTransaction;
  credit_txn: TransferLinkTransaction;
  status: "suggested" | "confirmed" | "denied";
  confidence: number | null;
  created_at: string | null;
  confirmed_at: string | null;
}

export interface TransferCounts {
  suggested: number;
  confirmed: number;
  denied: number;
}
