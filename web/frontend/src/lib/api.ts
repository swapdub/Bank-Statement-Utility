/**
 * API client — all calls go through Vite's proxy (/api → localhost:8000).
 */

import type {
  SupportedFormatsResponse,
  UploadResponse,
  TransactionListResponse,
  TransactionFilters,
  Category,
  Tag,
  Keyword,
  AnalyticsSummary,
  TransferLink,
  TransferCounts,
} from "./types";
import { getAuthHeaders } from "./authContext";

const BASE = "/api";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...getAuthHeaders(), ...extra };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function getSupportedFormats(): Promise<SupportedFormatsResponse> {
  const res = await fetch(`${BASE}/upload/supported-formats`);
  return handleResponse(res);
}

export async function uploadStatement(
  file: File,
  bankName: string,
  accountType: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("bank_name", bankName);
  form.append("account_type", accountType);
  const res = await fetch(`${BASE}/upload/`, { method: "POST", body: form, headers: authHeaders() });
  return handleResponse(res);
}

// ── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(
  filters: TransactionFilters = {}
): Promise<TransactionListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const res = await fetch(`${BASE}/transactions/?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function setTransactionCategory(
  transactionId: number,
  categoryId: number | null
): Promise<void> {
  const params = categoryId !== null ? `?category_id=${categoryId}` : "";
  const res = await fetch(`${BASE}/transactions/${transactionId}/category${params}`, {
    method: "PUT",
    headers: authHeaders(),
  });
  await handleResponse(res);
}

export async function bulkAssignTransactionCategory(
  transactionIds: number[],
  categoryId: number | null
): Promise<void> {
  const res = await fetch(`${BASE}/transactions/bulk/category`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ transaction_ids: transactionIds, category_id: categoryId }),
  });
  await handleResponse(res);
}

export async function updateTransactionTags(
  transactionId: number,
  addTagIds: number[],
  removeTagIds: number[] = []
): Promise<Tag[]> {
  const res = await fetch(`${BASE}/transactions/${transactionId}/tags`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ transaction_ids: [transactionId], add_tag_ids: addTagIds, remove_tag_ids: removeTagIds }),
  });
  return handleResponse(res);
}

export async function bulkUpdateTransactionTags(
  transactionIds: number[],
  addTagIds: number[],
  removeTagIds: number[] = []
): Promise<void> {
  const res = await fetch(`${BASE}/transactions/bulk/tags`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ transaction_ids: transactionIds, add_tag_ids: addTagIds, remove_tag_ids: removeTagIds }),
  });
  await handleResponse(res);
}

export async function getTransactionBanks(): Promise<string[]> {
  const res = await fetch(`${BASE}/transactions/banks`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getTransactionAggregate(
  filters: TransactionFilters = {}
): Promise<{ debit_sum: number; credit_sum: number; net: number; count: number }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "" && !["page", "page_size", "sort_by", "sort_order"].includes(k))
      params.set(k, String(v));
  }
  const res = await fetch(`${BASE}/transactions/aggregate?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getTransactionById(id: number): Promise<import("./types").Transaction> {
  const res = await fetch(`${BASE}/transactions/${id}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateTransaction(
  id: number,
  data: Record<string, unknown>
): Promise<import("./types").Transaction> {
  const res = await fetch(`${BASE}/transactions/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/categories/`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createCategory(data: {
  name: string;
  color?: string;
  icon?: string;
}): Promise<Category> {
  const res = await fetch(`${BASE}/categories/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`${BASE}/categories/${id}`, { method: "DELETE", headers: authHeaders() });
  await handleResponse(res);
}

export async function updateCategory(
  id: number,
  data: { name?: string; color?: string }
): Promise<Category> {
  const res = await fetch(`${BASE}/categories/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const res = await fetch(`${BASE}/tags/`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createTag(data: {
  name: string;
  color?: string;
}): Promise<Tag> {
  const res = await fetch(`${BASE}/tags/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`${BASE}/tags/${id}`, { method: "DELETE", headers: authHeaders() });
  await handleResponse(res);
}

export async function updateTag(
  id: number,
  data: { name?: string; color?: string }
): Promise<Tag> {
  const res = await fetch(`${BASE}/tags/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── Keywords ─────────────────────────────────────────────────────────────────

export async function getKeywords(params?: {
  category_id?: number;
  uncategorized?: boolean;
  has_tag?: number;
  search?: string;
  min_frequency?: number;
  show_noise?: boolean;
}): Promise<Keyword[]> {
  const urlParams = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) urlParams.set(k, String(v));
    }
  }
  const res = await fetch(`${BASE}/keywords/?${urlParams}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createKeyword(keyword: string): Promise<Keyword> {
  const res = await fetch(`${BASE}/keywords/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ keyword }),
  });
  return handleResponse(res);
}

export async function deleteKeyword(id: number): Promise<void> {
  const res = await fetch(`${BASE}/keywords/${id}`, { method: "DELETE", headers: authHeaders() });
  await handleResponse(res);
}

export async function toggleKeywordNoise(id: number): Promise<{ is_noise: boolean }> {
  const res = await fetch(`${BASE}/keywords/${id}/noise`, { method: "PUT", headers: authHeaders() });
  return handleResponse(res);
}

export async function assignKeywordCategory(
  keywordId: number,
  categoryId: number | null
): Promise<void> {
  await fetch(`${BASE}/keywords/${keywordId}/category`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ category_id: categoryId }),
  });
}

export async function bulkAssignCategory(
  keywordIds: number[],
  categoryId: number | null
): Promise<void> {
  const res = await fetch(`${BASE}/keywords/bulk/category`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ keyword_ids: keywordIds, category_id: categoryId }),
  });
  await handleResponse(res);
}

export async function bulkUpdateTags(
  keywordIds: number[],
  addTagIds: number[] = [],
  removeTagIds: number[] = []
): Promise<void> {
  const res = await fetch(`${BASE}/keywords/bulk/tags`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      keyword_ids: keywordIds,
      add_tag_ids: addTagIds,
      remove_tag_ids: removeTagIds,
    }),
  });
  await handleResponse(res);
}

export async function applyKeywordCategories(): Promise<{
  updated: number;
  conflicts: number;
}> {
  const res = await fetch(`${BASE}/keywords/apply-categories`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(params?: {
  date_from?: string;
  date_to?: string;
  bank_name?: string;
  category_ids?: string;  // comma-separated
  tag_ids?: string;       // comma-separated
  include_uncategorized?: boolean;
  include_untagged?: boolean;
}): Promise<AnalyticsSummary> {
  const urlParams = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") urlParams.set(k, String(v));
    }
  }
  const res = await fetch(`${BASE}/analytics/summary?${urlParams}`, { headers: authHeaders() });
  return handleResponse(res);
}

// ── Transfers ────────────────────────────────────────────────────────────────

export async function detectTransfers(): Promise<{ status: string; new_suggestions: number }> {
  const res = await fetch(`${BASE}/transfers/detect`, { method: "POST", headers: authHeaders() });
  return handleResponse(res);
}

export async function getTransferSuggestions(): Promise<TransferLink[]> {
  const res = await fetch(`${BASE}/transfers/suggestions`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getConfirmedTransfers(): Promise<TransferLink[]> {
  const res = await fetch(`${BASE}/transfers/confirmed`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getDeniedTransfers(): Promise<TransferLink[]> {
  const res = await fetch(`${BASE}/transfers/denied`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getTransferCounts(): Promise<TransferCounts> {
  const res = await fetch(`${BASE}/transfers/count`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function confirmTransfer(linkId: number): Promise<void> {
  const res = await fetch(`${BASE}/transfers/${linkId}/confirm`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function denyTransfer(linkId: number): Promise<void> {
  const res = await fetch(`${BASE}/transfers/${linkId}/deny`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function restoreTransfer(linkId: number): Promise<void> {
  const res = await fetch(`${BASE}/transfers/${linkId}/restore`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function unlinkTransfer(linkId: number): Promise<void> {
  const res = await fetch(`${BASE}/transfers/${linkId}/unlink`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function manualLinkTransfer(
  debitTxnId: number,
  creditTxnId: number
): Promise<TransferLink> {
  const res = await fetch(`${BASE}/transfers/link`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ debit_txn_id: debitTxnId, credit_txn_id: creditTxnId }),
  });
  return handleResponse(res);
}

// ── Export ────────────────────────────────────────────────────────────────────

function _buildExportParams(
  filters: TransactionFilters,
  exportAll: boolean
): string {
  const params = new URLSearchParams();
  if (exportAll) {
    params.set("export_all", "true");
  } else {
    for (const [k, v] of Object.entries(filters)) {
      if (
        v !== undefined &&
        v !== null &&
        v !== "" &&
        !["page", "page_size"].includes(k)
      )
        params.set(k, String(v));
    }
  }
  return params.toString();
}

export async function exportCSV(
  filters: TransactionFilters,
  exportAll: boolean = false
): Promise<void> {
  const qs = _buildExportParams(filters, exportAll);
  const res = await fetch(`${BASE}/export/csv?${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  _downloadBlob(blob, _extractFilename(res, "transactions.csv"));
}

export async function exportXLSX(
  filters: TransactionFilters,
  exportAll: boolean = false
): Promise<void> {
  const qs = _buildExportParams(filters, exportAll);
  const res = await fetch(`${BASE}/export/xlsx?${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  _downloadBlob(blob, _extractFilename(res, "transactions.xlsx"));
}

export async function exportJSON(
  filters: TransactionFilters,
  exportAll: boolean = false
): Promise<void> {
  const qs = _buildExportParams(filters, exportAll);
  const res = await fetch(`${BASE}/export/json?${qs}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  _downloadBlob(blob, _extractFilename(res, "transactions.json"));
}

function _extractFilename(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition");
  if (cd) {
    const match = cd.match(/filename="?([^"]+)"?/);
    if (match) return match[1];
  }
  return fallback;
}

function _downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Admin: User management ───────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string | null;
}

export async function getUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${BASE}/auth/users`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function adminResetPassword(
  userId: number,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${BASE}/auth/users/${userId}/reset-password`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ new_password: newPassword }),
  });
  await handleResponse(res);
}

export async function adminDeleteUser(userId: number): Promise<void> {
  const res = await fetch(`${BASE}/auth/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse(res);
}

export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${BASE}/auth/change-password`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  await handleResponse(res);
}
