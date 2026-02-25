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
} from "./types";

const BASE = "/api";

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
  const res = await fetch(`${BASE}/upload/`, { method: "POST", body: form });
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
  const res = await fetch(`${BASE}/transactions/?${params}`);
  return handleResponse(res);
}

export async function setTransactionCategory(
  transactionId: number,
  categoryId: number | null
): Promise<void> {
  const params = categoryId !== null ? `?category_id=${categoryId}` : "";
  const res = await fetch(`${BASE}/transactions/${transactionId}/category${params}`, {
    method: "PUT",
  });
  await handleResponse(res);
}

export async function bulkAssignTransactionCategory(
  transactionIds: number[],
  categoryId: number | null
): Promise<void> {
  const res = await fetch(`${BASE}/transactions/bulk/category`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds, category_id: categoryId }),
  });
  await handleResponse(res);
}

export async function getTransactionBanks(): Promise<string[]> {
  const res = await fetch(`${BASE}/transactions/banks`);
  return handleResponse(res);
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/categories/`);
  return handleResponse(res);
}

export async function createCategory(data: {
  name: string;
  color?: string;
  icon?: string;
}): Promise<Category> {
  const res = await fetch(`${BASE}/categories/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`${BASE}/categories/${id}`, { method: "DELETE" });
  await handleResponse(res);
}

export async function updateCategory(
  id: number,
  data: { name?: string; color?: string }
): Promise<Category> {
  const res = await fetch(`${BASE}/categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const res = await fetch(`${BASE}/tags/`);
  return handleResponse(res);
}

export async function createTag(data: {
  name: string;
  color?: string;
}): Promise<Tag> {
  const res = await fetch(`${BASE}/tags/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`${BASE}/tags/${id}`, { method: "DELETE" });
  await handleResponse(res);
}

export async function updateTag(
  id: number,
  data: { name?: string; color?: string }
): Promise<Tag> {
  const res = await fetch(`${BASE}/tags/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`${BASE}/keywords/?${urlParams}`);
  return handleResponse(res);
}

export async function createKeyword(keyword: string): Promise<Keyword> {
  const res = await fetch(`${BASE}/keywords/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword }),
  });
  return handleResponse(res);
}

export async function deleteKeyword(id: number): Promise<void> {
  const res = await fetch(`${BASE}/keywords/${id}`, { method: "DELETE" });
  await handleResponse(res);
}

export async function toggleKeywordNoise(id: number): Promise<{ is_noise: boolean }> {
  const res = await fetch(`${BASE}/keywords/${id}/noise`, { method: "PUT" });
  return handleResponse(res);
}

export async function assignKeywordCategory(
  keywordId: number,
  categoryId: number | null
): Promise<void> {
  await fetch(`${BASE}/keywords/${keywordId}/category`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId }),
  });
}

export async function bulkAssignCategory(
  keywordIds: number[],
  categoryId: number | null
): Promise<void> {
  const res = await fetch(`${BASE}/keywords/bulk/category`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
  });
  return handleResponse(res);
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(params?: {
  date_from?: string;
  date_to?: string;
  bank_name?: string;
  category_id?: number;
  uncategorized?: boolean;
}): Promise<AnalyticsSummary> {
  const urlParams = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") urlParams.set(k, String(v));
    }
  }
  const res = await fetch(`${BASE}/analytics/summary?${urlParams}`);
  return handleResponse(res);
}
