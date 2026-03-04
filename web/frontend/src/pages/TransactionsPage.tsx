import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  X,
  Tag,
  CheckSquare,
  Info,
  ArrowLeftRight,
  Link2,
  Loader2,
  Plus,
  Unlink2,
  Pencil,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { EditTransactionModal } from "@/components/EditTransactionModal";

import {
  getTransactions,
  getTransactionAggregate,
  getCategories,
  getSupportedFormats,
  getTags,
  bulkAssignTransactionCategory,
  setTransactionCategory,
  updateTransactionTags,
  bulkUpdateTransactionTags,
  getTransferCounts,
  detectTransfers,
  manualLinkTransfer,
  unlinkTransfer,
} from "@/lib/api";
import type { Transaction, TransactionFilters, Category, BankInfo, Tag as TagType, TransferCounts } from "@/lib/types";
import { formatINR, formatDate } from "@/lib/format";
import { useTransactionFilters } from "@/lib/filterContext";
import TransferReviewDialog from "@/components/TransferReviewDialog";

export default function TransactionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { filters: ctxFilters, set: setCtxFilters } = useTransactionFilters();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [highlightedTxnId, setHighlightedTxnId] = useState<number | null>(null);
  const [aggregate, setAggregate] = useState<{ debit_sum: number; credit_sum: number; net: number; count: number } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shift-select tracking
  const lastClickedIdxRef = useRef<number | null>(null);
  // Unlink confirmation
  const [unlinkConfirmLinkId, setUnlinkConfirmLinkId] = useState<number | null>(null);
  // Edit modal
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Transfer state
  const [transferCounts, setTransferCounts] = useState<TransferCounts>({ suggested: 0, confirmed: 0, denied: 0 });
  const [transferReviewOpen, setTransferReviewOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    page: 1,
    page_size: 50,
    sort_by: "transaction_date",
    sort_order: "desc",
    // Restore from context on mount
    search: ctxFilters.search || undefined,
    bank_names: ctxFilters.bankNames.length ? ctxFilters.bankNames.join(",") : undefined,
    category_ids: ctxFilters.categoryIds.length ? ctxFilters.categoryIds.join(",") : undefined,
    uncategorized: ctxFilters.uncategorized || undefined,
    date_from: ctxFilters.dateFrom || undefined,
    date_to: ctxFilters.dateTo || undefined,
    tag_ids: ctxFilters.tagIds.length ? ctxFilters.tagIds.join(",") : undefined,
    untagged: ctxFilters.untagged || undefined,
  }));

  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
    getSupportedFormats().then((d) => setBanks(d.banks)).catch(console.error);
    getTags().then(setAllTags).catch(console.error);
    getTransferCounts().then(setTransferCounts).catch(console.error);
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

  // Fetch aggregate sums whenever filters change (excluding pagination)
  useEffect(() => {
    getTransactionAggregate(filters)
      .then(setAggregate)
      .catch(() => setAggregate(null));
  }, [filters]);

  // Handle navigation from TransferReviewDialog "View" button
  useEffect(() => {
    const state = location.state as { goToTxnId?: number; txnDate?: string } | null;
    if (state?.goToTxnId) {
      const txnId = state.goToTxnId;
      const txnDate = state.txnDate;
      // Clear state so refresh doesn't re-trigger
      window.history.replaceState({}, "");
      // Filter to just that date so we land on page 1 with the txn visible
      if (txnDate) {
        setFilters({ page: 1, page_size: 50, sort_by: "transaction_date", sort_order: "desc", date_from: txnDate, date_to: txnDate });
      }
      // Schedule highlight — data will arrive shortly after filter change
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedTxnId(txnId);
      highlightTimerRef.current = setTimeout(() => setHighlightedTxnId(null), 3000);
    }
  }, [location.state]);

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

  // ── Multi-select filter helpers ─────────────────────────────────────────
  const selectedBankNames = useMemo(
    () => (filters.bank_names ? filters.bank_names.split(",").filter(Boolean) : []),
    [filters.bank_names],
  );
  const toggleBank = (name: string) => {
    const next = selectedBankNames.includes(name)
      ? selectedBankNames.filter((b) => b !== name)
      : [...selectedBankNames, name];
    setFilters((prev) => ({ ...prev, bank_names: next.length ? next.join(",") : undefined, bank_name: undefined, page: 1 }));
  };

  const selectedCategoryIds = useMemo(
    () => (filters.category_ids ? filters.category_ids.split(",").map(Number).filter(Boolean) : []),
    [filters.category_ids],
  );
  const toggleCategoryFilter = (id: number) => {
    const next = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((c) => c !== id)
      : [...selectedCategoryIds, id];
    setFilters((prev) => ({ ...prev, category_ids: next.length ? next.join(",") : undefined, category_id: undefined, uncategorized: undefined, page: 1 }));
  };
  const setUncategorizedFilter = (val: boolean) => {
    setFilters((prev) => ({
      ...prev,
      uncategorized: val || undefined,
      category_id: undefined,
      category_ids: val ? undefined : prev.category_ids,
      page: 1,
    }));
  };

  const selectedTagIds = useMemo(
    () => (filters.tag_ids ? filters.tag_ids.split(",").map(Number).filter(Boolean) : []),
    [filters.tag_ids],
  );
  const toggleTagFilter = (id: number) => {
    const next = selectedTagIds.includes(id)
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id];
    setFilters((prev) => ({ ...prev, tag_ids: next.length ? next.join(",") : undefined, page: 1 }));
  };
  const setUntaggedFilter = (val: boolean) => {
    setFilters((prev) => ({
      ...prev,
      untagged: val || undefined,
      tag_ids: val ? undefined : prev.tag_ids,
      page: 1,
    }));
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.bank_name || filters.bank_names) count++;
    if (filters.account_type) count++;
    if (filters.category_id || filters.category_ids) count++;
    if (filters.uncategorized) count++;
    if (filters.tag_ids) count++;
    if (filters.untagged) count++;
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

  const handleRowCheckboxClick = (e: React.MouseEvent, txnId: number, idx: number) => {
    if (e.shiftKey && lastClickedIdxRef.current !== null) {
      const min = Math.min(lastClickedIdxRef.current, idx);
      const max = Math.max(lastClickedIdxRef.current, idx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = min; i <= max; i++) {
          if (transactions[i]) next.add(transactions[i].id);
        }
        return next;
      });
    } else {
      toggleSelect(txnId);
      lastClickedIdxRef.current = idx;
    }
  };

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

  // ── Highlight a transaction row (with auto-clear) ────────────────────────
  const highlightTxn = useCallback((txnId: number) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedTxnId(txnId);
    highlightTimerRef.current = setTimeout(() => setHighlightedTxnId(null), 2500);
    // Scroll to the highlighted row
    setTimeout(() => {
      const el = document.getElementById(`txn-row-${txnId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  // ── Handle Transfer badge click — highlight counterpart if visible ───────
  const handleTransferBadgeClick = useCallback((txn: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    const counterpartId = txn.transfer_counterpart_id;
    if (!counterpartId) return;
    const onPage = transactions.find((t) => t.id === counterpartId);
    if (onPage) {
      highlightTxn(counterpartId);
    } else {
      // Navigate to find counterpart
      navigate("/transactions", { state: { goToTxnId: counterpartId } });
    }
  }, [transactions, highlightTxn, navigate]);

  // ── Handle "View" button from TransferReviewDialog ───────────────────────
  const handleGoToTransaction = useCallback((txnId: number, txnDate: string) => {
    setTransferReviewOpen(false);
    const onPage = transactions.find((t) => t.id === txnId);
    if (onPage) {
      highlightTxn(txnId);
    } else {
      navigate("/transactions", { state: { goToTxnId: txnId, txnDate } });
    }
  }, [transactions, highlightTxn, navigate]);

  // ── Transfer helpers ─────────────────────────────────────────────────────
  const refreshTransfers = () => {
    getTransferCounts().then(setTransferCounts).catch(console.error);
    // Re-fetch current page to update is_transfer badges
    setFilters((prev) => ({ ...prev }));
  };

  const handleConfirmUnlink = async () => {
    if (!unlinkConfirmLinkId) return;
    try {
      await unlinkTransfer(unlinkConfirmLinkId);
      setUnlinkConfirmLinkId(null);
      refreshTransfers();
      toast.success("Transfer unlinked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const result = await detectTransfers();
      if (result.new_suggestions > 0) {
        toast.success(`Found ${result.new_suggestions} possible transfer${result.new_suggestions > 1 ? "s" : ""}`);
        refreshTransfers();
      } else {
        toast.info("No new transfers detected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const handleManualLink = async () => {
    const ids = [...selectedIds];
    if (ids.length !== 2) return;

    // Determine which is debit and which is credit
    const txn1 = transactions.find((t) => t.id === ids[0]);
    const txn2 = transactions.find((t) => t.id === ids[1]);
    if (!txn1 || !txn2) return;

    let debitId: number, creditId: number;
    if (txn1.debit_amount && txn2.credit_amount) {
      debitId = txn1.id;
      creditId = txn2.id;
    } else if (txn2.debit_amount && txn1.credit_amount) {
      debitId = txn2.id;
      creditId = txn1.id;
    } else {
      toast.error("Select one debit and one credit transaction to link");
      return;
    }

    try {
      await manualLinkTransfer(debitId, creditId);
      toast.success("Transactions linked as transfer");
      setSelectedIds(new Set());
      refreshTransfers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link");
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

      {/* Transfer suggestions banner */}
      <div className="flex items-center gap-2 rounded-lg border px-4 py-2.5">
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm flex-1">
          {transferCounts.suggested > 0 ? (
            <>
              <span className="font-medium">{transferCounts.suggested}</span> possible transfer{transferCounts.suggested > 1 ? "s" : ""} detected
              {transferCounts.confirmed > 0 && (
                <span className="text-muted-foreground"> · {transferCounts.confirmed} confirmed</span>
              )}
            </>
          ) : transferCounts.confirmed > 0 ? (
            <span className="text-muted-foreground">{transferCounts.confirmed} confirmed transfer{transferCounts.confirmed > 1 ? "s" : ""}</span>
          ) : (
            <span className="text-muted-foreground">Detect inter-account transfers to avoid double-counting in analytics</span>
          )}
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={detecting} onClick={handleDetect}>
          {detecting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowLeftRight className="mr-1 h-3 w-3" />}
          Detect
        </Button>
        {(transferCounts.suggested > 0 || transferCounts.confirmed > 0 || transferCounts.denied > 0) && (
          <Button size="sm" variant={transferCounts.suggested > 0 ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTransferReviewOpen(true)}>
            Review{transferCounts.suggested > 0 && ` (${transferCounts.suggested})`}
          </Button>
        )}
      </div>

      <TransferReviewDialog
        open={transferReviewOpen}
        onOpenChange={setTransferReviewOpen}
        onChanged={refreshTransfers}
        onGoToTransaction={handleGoToTransaction}
      />

      {/* Unlink confirmation dialog */}
      <Dialog open={unlinkConfirmLinkId !== null} onOpenChange={(o) => !o && setUnlinkConfirmLinkId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlink Transfer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the transfer link between both transactions. They will no longer be excluded from analytics as a transfer. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinkConfirmLinkId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmUnlink}>Unlink</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit transaction modal */}
      <EditTransactionModal
        transaction={editTxn}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSaved={(updated) => {
          setTransactions((prev) => prev.map((t) => t.id === updated.id ? updated : t));
          toast.success("Transaction updated");
        }}
      />

      {/* Search bar */}
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

      {/* Filters — always visible */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4 lg:grid-cols-7">
          {/* Bank multi-select */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Bank</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-full justify-between text-xs font-normal">
                  {selectedBankNames.length === 0
                    ? "All Banks"
                    : `${selectedBankNames.length} bank${selectedBankNames.length > 1 ? "s" : ""}`}
                  <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="mb-1 flex gap-1">
                  <button className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted text-left"
                    onClick={() => setFilters((prev) => ({ ...prev, bank_names: banks.map((b) => b.name).join(","), bank_name: undefined, page: 1 }))}>
                    ✓ All
                  </button>
                  {selectedBankNames.length > 0 && (
                    <button className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted text-left"
                      onClick={() => setFilters((prev) => ({ ...prev, bank_names: undefined, bank_name: undefined, page: 1 }))}>
                      × Clear
                    </button>
                  )}
                </div>
                {banks.map((b) => (
                  <label key={b.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox checked={selectedBankNames.includes(b.name)} onCheckedChange={() => toggleBank(b.name)} className="h-3.5 w-3.5" />
                    {b.name}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Category multi-select */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <MultiSelectFilter
              allLabel="All Categories"
              items={categories.map((c) => ({ id: c.id, label: c.name, color: c.color || "#ccc" }))}
              selectedIds={selectedCategoryIds}
              onToggle={toggleCategoryFilter}
              onSelectAll={() => setFilters((prev) => ({ ...prev, category_ids: categories.map((c) => c.id).join(","), category_id: undefined, uncategorized: undefined, page: 1 }))}
              onClear={() => setFilters((prev) => ({ ...prev, category_ids: undefined, category_id: undefined, uncategorized: undefined, page: 1 }))}
              special={{
                label: "Uncategorized",
                color: "#9ca3af",
                checked: !!filters.uncategorized,
                onToggle: () => setUncategorizedFilter(!filters.uncategorized),
              }}
              triggerClassName="w-full"
              popoverWidth="w-52"
            />
          </div>

          {/* Tag multi-select */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tags</label>
            <MultiSelectFilter
              allLabel="All Tags"
              items={allTags.map((t) => ({ id: t.id, label: t.name, color: t.color || "#6366f1" }))}
              selectedIds={selectedTagIds}
              onToggle={toggleTagFilter}
              onSelectAll={() => setFilters((prev) => ({ ...prev, tag_ids: allTags.map((t) => t.id).join(","), untagged: undefined, page: 1 }))}
              onClear={() => setFilters((prev) => ({ ...prev, tag_ids: undefined, untagged: undefined, page: 1 }))}
              special={{
                label: "Untagged",
                color: "#9ca3af",
                checked: !!filters.untagged,
                onToggle: () => setUntaggedFilter(!filters.untagged),
              }}
              triggerClassName="w-full"
              popoverWidth="w-52"
            />
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

      {/* Summary bar */}
      {aggregate && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            {aggregate.count.toLocaleString()} transaction{aggregate.count !== 1 ? "s" : ""} shown
          </span>
          <span className="h-4 w-px bg-border hidden sm:block" />
          <span>
            <span className="text-muted-foreground">Debits: </span>
            <span className="font-mono font-medium text-red-600">{formatINR(aggregate.debit_sum)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Credits: </span>
            <span className="font-mono font-medium text-green-600">{formatINR(aggregate.credit_sum)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Net: </span>
            <span className={`font-mono font-medium ${aggregate.net >= 0 ? "text-green-600" : "text-red-600"}`}>
              {aggregate.net >= 0 ? "+" : ""}{formatINR(aggregate.net)}
            </span>
          </span>
        </div>
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
                transactions.map((txn, txnIdx) => (
                  <TableRow
                    key={txn.id}
                    id={`txn-row-${txn.id}`}
                    className={`transition-colors duration-300 ${
                      selectedIds.has(txn.id) ? "bg-primary/5" :
                      highlightedTxnId === txn.id ? "bg-yellow-100 dark:bg-yellow-900/30 ring-2 ring-inset ring-yellow-400" : ""
                    }`}
                  >
                    <TableCell className="px-4">
                      <Checkbox
                        checked={selectedIds.has(txn.id)}
                        onClick={(e: React.MouseEvent) => handleRowCheckboxClick(e, txn.id, txnIdx)}
                        onCheckedChange={() => {}}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(txn.transaction_date)}</TableCell>
                    <TableCell className="max-w-[280px] text-sm group/desc" title={txn.description}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate flex-1">{txn.description}</span>
                        {txn.is_transfer && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px] px-1.5 py-0 gap-0.5 border-slate-400 text-slate-500 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Click to highlight counterpart transaction"
                            onClick={(e) => handleTransferBadgeClick(txn, e)}
                          >
                            <ArrowLeftRight className="h-2.5 w-2.5" /> Transfer
                          </Badge>
                        )}
                        {txn.is_transfer && txn.transfer_link_id && (
                          <button
                            className="shrink-0 opacity-0 group-hover/desc:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded"
                            title="Unlink transfer"
                            onClick={(e) => { e.stopPropagation(); setUnlinkConfirmLinkId(txn.transfer_link_id); }}
                          >
                            <Unlink2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          className="shrink-0 opacity-0 group-hover/desc:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded"
                          title="Edit transaction"
                          onClick={(e) => { e.stopPropagation(); setEditTxn(txn); setEditModalOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
                        <PopoverContent className="w-48 p-1 max-h-72 overflow-y-auto" align="start" side="bottom" sideOffset={4}>
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
                    {/* Tags cell — inline chips with × remove, + to add */}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {txn.tags && txn.tags.map((tg) => (
                          <span
                            key={tg.id}
                            className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"
                            style={{
                              backgroundColor: (tg.color ?? "#6366f1") + "20",
                              borderColor: tg.color ?? "#6366f1",
                              color: tg.color ?? "#6366f1",
                            }}
                          >
                            {tg.name}
                            <button
                              className="ml-0.5 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/20"
                              onClick={(e) => { e.stopPropagation(); handleTagToggle(txn, tg.id); }}
                              aria-label={`Remove ${tg.name}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Add tag"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-1 max-h-48 overflow-y-auto" align="start" side="bottom" sideOffset={4}>
                            {allTags.filter((tg) => !txn.tags?.some((t) => t.id === tg.id)).map((tg) => (
                              <button
                                key={tg.id}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                                onClick={() => handleTagToggle(txn, tg.id)}
                              >
                                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tg.color ?? "#6366f1" }} />
                                {tg.name}
                              </button>
                            ))}
                            {allTags.filter((tg) => !txn.tags?.some((t) => t.id === tg.id)).length === 0 && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">All tags applied.</p>
                            )}
                            {allTags.length === 0 && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet.</p>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
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
            {/* Manual link as transfer — only when exactly 2 selected */}
            {selectedIds.size === 2 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleManualLink}>
                <Link2 className="mr-1 h-3 w-3" /> Link as Transfer
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
