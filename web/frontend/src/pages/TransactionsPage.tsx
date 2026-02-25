import { useEffect, useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

import { getTransactions, getCategories, getSupportedFormats } from "@/lib/api";
import type { Transaction, TransactionFilters, Category, BankInfo } from "@/lib/types";
import { formatINR, formatDate } from "@/lib/format";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banks, setBanks] = useState<BankInfo[]>([]);

  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    page_size: 50,
    sort_by: "transaction_date",
    sort_order: "desc",
  });

  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Load metadata once
  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
    getSupportedFormats().then((d) => setBanks(d.banks)).catch(console.error);
  }, []);

  // Fetch transactions when filters change
  useEffect(() => {
    setLoading(true);
    getTransactions(filters)
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const totalPages = Math.ceil(total / (filters.page_size || 50));

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
  };

  const updateFilter = (key: keyof TransactionFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
  };

  const clearFilters = () => {
    setSearchInput("");
    setFilters({ page: 1, page_size: 50, sort_by: "transaction_date", sort_order: "desc" });
  };

  const toggleSort = (col: string) => {
    setFilters((prev) => ({
      ...prev,
      sort_by: col,
      sort_order: prev.sort_by === col && prev.sort_order === "asc" ? "desc" : "asc",
    }));
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            {total.toLocaleString()} transaction{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

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
        <Button variant="outline" onClick={handleSearch}>
          Search
        </Button>

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

        {/* Quick amount filters */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateFilter("min_amount", 10000)}
          >
            {">"} ₹10,000
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateFilter("max_amount", 1000)}
          >
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
                  {banks.map((b) => (
                    <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                  ))}
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
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From Date</label>
              <Input
                type="date"
                value={filters.date_from || ""}
                onChange={(e) => updateFilter("date_from", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To Date</label>
              <Input
                type="date"
                value={filters.date_to || ""}
                onChange={(e) => updateFilter("date_to", e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Min Amount</label>
              <Input
                type="number"
                placeholder="₹0"
                value={filters.min_amount ?? ""}
                onChange={(e) => updateFilter("min_amount", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Max Amount</label>
              <Input
                type="number"
                placeholder="₹99,999"
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
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("transaction_date")}
                >
                  <div className="flex items-center gap-1">
                    Date <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("debit_amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Debit <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-right"
                  onClick={() => toggleSort("credit_amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Credit <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No transactions found. Upload a statement to get started.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(txn.transaction_date)}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm" title={txn.description}>
                      {txn.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {txn.bank_name}
                      </Badge>
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
                      {txn.category_name ? (
                        <Badge variant="secondary">{txn.category_name}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">—</Badge>
                      )}
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
          <p className="text-sm text-muted-foreground">
            Page {filters.page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page || 1) <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page || 1) >= totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
