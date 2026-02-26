import { useEffect, useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  X,
  Tag,
  CheckSquare,
  Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

import {
  getTransactions,
  getCategories,
  getSupportedFormats,
  getTags,
  bulkAssignTransactionCategory,
  setTransactionCategory,
  updateTransactionTags,
  bulkUpdateTransactionTags,
} from "@/lib/api";
import type { Transaction, TransactionFilters, Category, BankInfo, Tag as TagType } from "@/lib/types";
import { formatINR, formatDate } from "@/lib/format";
import { useTransactionFilters } from "@/lib/filterContext";

export default function TransactionsPage() {
  const navigate = useNavigate();
  const { filters: ctxFilters, set: setCtxFilters } = useTransactionFilters();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    page: 1,
    page_size: 50,
    sort_by: "transaction_date",
    sort_order: "desc",
    // Restore from context on mount
    search: ctxFilters.search || undefined,
    bank_name: ctxFilters.bankName || undefined,
    category_id: ctxFilters.categoryId ?? undefined,
    date_from: ctxFilters.dateFrom || undefined,
    date_to: ctxFilters.dateTo || undefined,
    tag_ids: ctxFilters.tagIds.length ? ctxFilters.tagIds.join(",") : undefined,
  }));

  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
    getSupportedFormats().then((d) => setBanks(d.banks)).catch(console.error);
    getTags().then(setAllTags).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    getTransactions(filters)
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
        setSelectedIds(new Set());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const totalPages = Math.ceil(total / (filters.page_size || 50));

  const handleSearch = () =>
    setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));

  const updateFilter = (key: keyof TransactionFilters, value: unknown) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters({ page: 1, page_size: 50, sort_by: "transaction_date", sort_order: "desc" });
    setCtxFilters({ fromAnalytics: false });
  };

  const toggleSort = (col: string) =>
    setFilters((prev) => ({
      ...prev,
      sort_by: col,
      sort_order: prev.sort_by === col && prev.sort_order === "asc" ? "desc" : "asc",
    }));

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.bank_name) count++;
    if (filters.account_type) count++;
    if (filters.category_id) count++;
    if (filters.uncategorized) count++;
    if (filters.date_from) count++;
    if (filters.date_to) count++;
    if (filters.min_amount) count++;
    if (filters.max_amount) count++;
    return count;
  }, [filters]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const isAllSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected || isSomeSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  // ── Inline single-row tag toggle ───────────────────────────────────────────
  const handleTagToggle = async (txn: Transaction, tagId: number) => {
    const currentTagIds = txn.tags.map((t) => t.id);
    const hasTag = currentTagIds.includes(tagId);
    const tag = allTags.find((t) => t.id === tagId);
    try {
      await updateTransactionTags(
        txn.id,
        hasTag ? [] : [tagId],
        hasTag ? [tagId] : []
      );
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== txn.id) return t;
          const newTags = hasTag
            ? t.tags.filter((tg) => tg.id !== tagId)
            : tag ? [...t.tags, tag] : t.tags;
          return { ...t, tags: newTags };
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tag");
    }
  };

  // ── Bulk tag assign ──────────────────────────────────────────────────────
  const handleBulkTagAdd = async (tagId: number) => {
    try {
      await bulkUpdateTransactionTags([...selectedIds], [tagId]);
      const tag = allTags.find((t) => t.id === tagId);
      if (tag) {
        setTransactions((prev) =>
          prev.map((t) =>
            selectedIds.has(t.id) && !t.tags.find((tg) => tg.id === tagId)
              ? { ...t, tags: [...t.tags, tag] }
              : t
          )
        );
      }
      toast.success(`Tag added to ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tag");
    }
  };

  const handleBulkTagRemove = async (tagId: number) => {
    try {
      await bulkUpdateTransactionTags([...selectedIds], [], [tagId]);
      setTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id)
            ? { ...t, tags: t.tags.filter((tg) => tg.id !== tagId) }
            : t
        )
      );
      toast.success(`Tag removed from ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove tag");
    }
  };

  // ── Inline single-row category assign ─────────────────────────────────────
  const handleSingleCategoryAssign = async (txnId: number, catId: number | null) => {
    try {
      await setTransactionCategory(txnId, catId);
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === txnId
            ? {
                ...t,
                category_id: catId,
                category_name: catId ? categories.find((c) => c.id === catId)?.name ?? null : null,
              }
            : t
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign category");
    }
  };

  // ── Bulk category assign ───────────────────────────────────────────────────
  const handleBulkCategoryAssign = async (catId: number | null) => {
    try {
      await bulkAssignTransactionCategory([...selectedIds], catId);
      const catName = catId ? categories.find((c) => c.id === catId)?.name ?? null : null;
      setTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id)
            ? { ...t, category_id: catId, category_name: catName }
            : t
        )
      );
      toast.success(
        `Assigned ${selectedIds.size} transaction${selectedIds.size > 1 ? "s" : ""} to ${catName ?? "Uncategorized"}`
      );
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign category");
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            {total.toLocaleString()} transaction{total !== 1 ? "s" : ""}
            {selectedIds.size > 0 && (
              <span className="ml-2 font-medium text-primary">
                · {selectedIds.size} selected
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Analytics carry-over banner */}
      {ctxFilters.fromAnalytics && (
        <div className="flex items-center justify-between rounded-lg border border-blue-400/40 bg-blue-50 px-4 py-2.5 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-300">
            <Info className="h-4 w-4 shrink-0" />
            <span>Filtered from Analytics. Showing a subset of transactions matching your selection.</span>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
            clearFilters();
            navigate("/analytics");
          }}>← Back to Analytics</Button>
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search descriptions..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>Search</Button>

        <Button
          variant={showFilters ? "secondary" : "outline"}
          onClick={() => setShowFilters((prev) => !prev)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-2">{activeFilterCount}</Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" /> Clear all
          </Button>
        )}

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => updateFilter("min_amount", 10000)}>
            {">"} ₹10,000
          </Button>
          <Button variant="outline" size="sm" onClick={() => updateFilter("max_amount", 1000)}>
            {"<"} ₹1,000
          </Button>
        </div>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4 lg:grid-cols-6">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Bank</label>
              <Select
                value={filters.bank_name || "all"}
                onValueChange={(v) => updateFilter("bank_name", v === "all" ? undefined : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {banks.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select
                value={filters.uncategorized ? "uncategorized" : String(filters.category_id || "all")}
                onValueChange={(v) => {
                  if (v === "uncategorized") {
                    setFilters((prev) => ({ ...prev, category_id: undefined, uncategorized: true, page: 1 }));
                  } else if (v === "all") {
                    setFilters((prev) => ({ ...prev, category_id: undefined, uncategorized: undefined, page: 1 }));
                  } else {
                    setFilters((prev) => ({ ...prev, category_id: Number(v), uncategorized: undefined, page: 1 }));
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From Date</label>
              <Input type="date" value={filters.date_from || ""} onChange={(e) => updateFilter("date_from", e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To Date</label>
              <Input type="date" value={filters.date_to || ""} onChange={(e) => updateFilter("date_to", e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Min Amount</label>
              <Input
                type="number" placeholder="₹0"
                value={filters.min_amount ?? ""}
                onChange={(e) => updateFilter("min_amount", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max Amount</label>
              <Input
                type="number" placeholder="₹99,999"
                value={filters.max_amount ?? ""}
                onChange={(e) => updateFilter("max_amount", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-4">
                  <Checkbox
                    checked={isAllSelected}
                    data-indeterminate={isSomeSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("transaction_date")}>
                  <div className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("debit_amount")}>
                  <div className="flex items-center justify-end gap-1">Debit <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("credit_amount")}>
                  <div className="flex items-center justify-end gap-1">Credit <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No transactions found. Upload a statement to get started.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((txn) => (
                  <TableRow key={txn.id} className={selectedIds.has(txn.id) ? "bg-primary/5" : ""}>
                    <TableCell className="px-4">
                      <Checkbox
                        checked={selectedIds.has(txn.id)}
                        onCheckedChange={() => toggleSelect(txn.id)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(txn.transaction_date)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm" title={txn.description}>
                      {txn.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{txn.bank_name}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {txn.debit_amount ? formatINR(txn.debit_amount) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600">
                      {txn.credit_amount ? formatINR(txn.credit_amount) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatINR(txn.closing_balance)}
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="rounded px-1 hover:bg-muted transition-colors">
                            {txn.category_name ? (
                              <Badge
                                className="cursor-pointer border text-xs"
                                style={{
                                  backgroundColor: (categories.find((c) => c.id === txn.category_id)?.color ?? "#6366f1") + "22",
                                  borderColor: categories.find((c) => c.id === txn.category_id)?.color ?? "#6366f1",
                                  color: categories.find((c) => c.id === txn.category_id)?.color ?? "#6366f1",
                                }}
                              >
                                {txn.category_name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="cursor-pointer text-muted-foreground text-xs">
                                — assign
                              </Badge>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" align="start">
                          <div className="flex flex-col gap-0.5">
                            <button
                              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted text-muted-foreground"
                              onClick={() => handleSingleCategoryAssign(txn.id, null)}
                            >
                              — Remove category
                            </button>
                            {categories.map((c) => (
                              <button
                                key={c.id}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                                onClick={() => handleSingleCategoryAssign(txn.id, c.id)}
                              >
                                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color || "#ccc" }} />
                                {c.name}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    {/* Tags cell */}
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <div className="flex min-w-[60px] cursor-pointer flex-wrap gap-1">
                            {txn.tags && txn.tags.length > 0 ? (
                              txn.tags.map((tg) => (
                                <Badge
                                  key={tg.id}
                                  className="border text-xs"
                                  style={{
                                    backgroundColor: (tg.color ?? "#6366f1") + "22",
                                    borderColor: tg.color ?? "#6366f1",
                                    color: tg.color ?? "#6366f1",
                                  }}
                                >
                                  {tg.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground hover:text-foreground">+ tag</span>
                            )}
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" align="start">
                          <div className="flex flex-col gap-0.5">
                            {allTags.length === 0 && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet. Create tags in Settings.</p>
                            )}
                            {allTags.map((tg) => {
                              const active = txn.tags?.some((t) => t.id === tg.id);
                              return (
                                <button
                                  key={tg.id}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                                  onClick={() => handleTagToggle(txn, tg.id)}
                                >
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full ring-1"
                                    style={{ backgroundColor: active ? (tg.color ?? "#6366f1") : "transparent", outline: `2px solid ${tg.color ?? "#6366f1"}`, outlineOffset: "1px" }}
                                  />
                                  <span className={active ? "font-medium" : ""}>{tg.name}</span>
                                  {active && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {filters.page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={(filters.page || 1) <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={(filters.page || 1) >= totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Floating bulk action bar ─────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur ring-1 ring-border">
            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-border" />
            <Select onValueChange={(v) => handleBulkCategoryAssign(v === "none" ? null : Number(v))}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <Tag className="mr-1 h-3 w-3 shrink-0" />
                <SelectValue placeholder="Assign category…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Remove category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.color || "#ccc" }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Bulk tag popover */}
            <Popover open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Tag className="mr-1 h-3 w-3" /> Tags
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="end">
                <p className="mb-1 px-1 text-xs font-semibold text-muted-foreground">Add tag to selected</p>
                {allTags.map((tg) => (
                  <button
                    key={tg.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => { handleBulkTagAdd(tg.id); setBulkTagOpen(false); }}
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tg.color ?? "#6366f1" }} />
                    {tg.name}
                  </button>
                ))}
                {allTags.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No tags yet.</p>
                )}
                <div className="my-1 border-t" />
                <p className="mb-1 px-1 text-xs font-semibold text-muted-foreground">Remove tag from selected</p>
                {allTags.map((tg) => (
                  <button
                    key={tg.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted text-muted-foreground"
                    onClick={() => { handleBulkTagRemove(tg.id); setBulkTagOpen(false); }}
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tg.color ?? "#6366f1" }} />
                    <span className="line-through">{tg.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
