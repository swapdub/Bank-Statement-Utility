import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
  AlertCircle,
  ChevronDown,
  Tag as TagIcon,
  Layers,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { getAnalyticsSummary, getCategories, getTransactionBanks, getTags } from "@/lib/api";
import type { AnalyticsSummary, Category, Tag } from "@/lib/types";
import { formatINR } from "@/lib/format";
import { useAnalyticsFilters, useTransactionFilters } from "@/lib/filterContext";

// ── Quick presets ────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "5Y", months: 60 },
  { label: "All", months: 0 },
] as const;

// ── Month label helper ───────────────────────────────────────────────────────
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

// ── Custom tooltip for monthly charts ───────────────────────────────────────
function MonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="mb-1 font-semibold">{label ? monthLabel(label) : ""}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatINR(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { filters, set: setFilters } = useAnalyticsFilters();
  const { set: setTxnFilters } = useTransactionFilters();

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);

  useEffect(() => {
    Promise.all([getTransactionBanks(), getCategories(), getTags()])
      .then(([b, c, t]) => { setBanks(b); setCategories(c); setAllTags(t); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    getAnalyticsSummary({
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      bank_name: filters.bankName || undefined,
      category_ids: filters.categoryIds.length ? filters.categoryIds.join(",") : undefined,
      tag_ids: filters.tagIds.length ? filters.tagIds.join(",") : undefined,
    })
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.bankName, filters.categoryIds, filters.tagIds]);

  const applyPreset = (months: number, label: string) => {
    if (months === 0) {
      setFilters({ dateFrom: "", dateTo: "", preset: "all" });
    } else {
      const now = new Date();
      const from = new Date(now);
      from.setMonth(from.getMonth() - months);
      setFilters({ dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10), preset: label });
    }
  };

  const goToTransactions = (categoryId: number | null = null, tagId: number | null = null) => {
    setTxnFilters({
      categoryId,
      tagIds: tagId ? [tagId] : [],
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      bankName: filters.bankName,
      fromAnalytics: true,
    });
    navigate("/transactions");
  };

  const toggleCategory = (id: number) =>
    setFilters({ categoryIds: filters.categoryIds.includes(id) ? filters.categoryIds.filter((c) => c !== id) : [...filters.categoryIds, id] });

  const toggleTag = (id: number) =>
    setFilters({ tagIds: filters.tagIds.includes(id) ? filters.tagIds.filter((t) => t !== id) : [...filters.tagIds, id] });

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">Loading analytics...</div>
    );
  }

  if (!summary || summary.transaction_count === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
        <AlertCircle className="mb-4 h-12 w-12" />
        <h2 className="text-lg font-semibold">No data yet</h2>
        <p>Upload bank statements to see spending analytics.</p>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const spendingPieData = summary.category_spending
    .filter((c) => c.total_debit > 0)
    .map((c) => ({ name: c.category_name, value: c.total_debit, color: c.color || "#9ca3af", id: c.category_id }));

  const incomeByCategoryData = summary.category_spending
    .filter((c) => c.total_credit > 0)
    .map((c) => ({ name: c.category_name, value: c.total_credit, color: c.color || "#9ca3af", id: c.category_id }));

  const incomeByTagData = (summary.tag_spending ?? [])
    .filter((t) => t.total_credit > 0)
    .map((t) => ({ name: t.tag_name, value: t.total_credit, color: t.color || "#6366f1", id: t.tag_id }));

  const categorizationPct = Math.round(
    (summary.categorized_count / summary.transaction_count) * 100
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spending Analytics</h1>
        <p className="text-muted-foreground">
          {summary.transaction_count.toLocaleString()} transactions analyzed
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-3">
          {/* Time presets */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={filters.preset === (p.months === 0 ? "all" : p.label) ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => applyPreset(p.months, p.label)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ dateFrom: e.target.value, preset: "" })}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={filters.dateTo}
              onChange={(e) => setFilters({ dateTo: e.target.value, preset: "" })}
            />

            {banks.length > 0 && (
              <Select
                value={filters.bankName || "__all__"}
                onValueChange={(v) => setFilters({ bankName: v === "__all__" ? "" : v })}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="All banks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All banks</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {categories.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Layers className="h-3 w-3" />
                    {filters.categoryIds.length === 0
                      ? "All categories"
                      : `${filters.categoryIds.length} categor${filters.categoryIds.length === 1 ? "y" : "ies"}`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
                    Filter categories (empty = all)
                  </p>
                  {filters.categoryIds.length > 0 && (
                    <button
                      className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setFilters({ categoryIds: [] })}
                    >
                      × Clear
                    </button>
                  )}
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={filters.categoryIds.includes(c.id)}
                        onCheckedChange={() => toggleCategory(c.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color || "#ccc" }} />
                      {c.name}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            {allTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <TagIcon className="h-3 w-3" />
                    {filters.tagIds.length === 0
                      ? "All tags"
                      : `${filters.tagIds.length} tag${filters.tagIds.length === 1 ? "" : "s"}`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" align="start">
                  <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
                    Filter tags (empty = all)
                  </p>
                  {filters.tagIds.length > 0 && (
                    <button
                      className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setFilters({ tagIds: [] })}
                    >
                      × Clear
                    </button>
                  )}
                  {allTags.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={filters.tagIds.includes(t.id)}
                        onCheckedChange={() => toggleTag(t.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                      {t.name}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            {(filters.dateFrom || filters.dateTo || filters.bankName || filters.categoryIds.length > 0 || filters.tagIds.length > 0) && (
              <Button
                variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => setFilters({ dateFrom: "", dateTo: "", bankName: "", categoryIds: [], tagIds: [], preset: "" })}
              >
                × Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatINR(summary.total_debit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatINR(summary.total_credit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Flow</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.total_credit - summary.total_debit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatINR(summary.total_credit - summary.total_debit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Categorized</CardTitle>
            <PieIcon className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categorizationPct}%</div>
            <p className="text-xs text-muted-foreground">{summary.uncategorized_count} uncategorized</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Spending Pie + Monthly Bar ───────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PieIcon className="h-4 w-4" /> Spending by Category</CardTitle>
            <CardDescription>Click a slice to view transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {spendingPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={spendingPieData} cx="50%" cy="50%"
                    innerRadius={60} outerRadius={120} paddingAngle={2} dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {spendingPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} className="cursor-pointer opacity-90 hover:opacity-100" onClick={() => goToTransactions(entry.id)} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value?: number | string) => formatINR(Number(value ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center text-muted-foreground">
                Categorize keywords to see the breakdown
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Monthly Trends</CardTitle>
            <CardDescription>Click a bar to view that month's transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={summary.monthly_trends}
                onClick={(e) => {
                  if (e?.activeLabel) {
                    const [y, m] = (e.activeLabel as string).split("-");
                    const lastDay = new Date(Number(y), Number(m), 0).getDate();
                    setTxnFilters({
                      dateFrom: `${y}-${m}-01`,
                      dateTo: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
                      bankName: filters.bankName,
                      fromAnalytics: true,
                    });
                    navigate("/transactions");
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} className="text-xs" tick={{ fontSize: 11 }} />
                <RechartsTooltip content={<MonthlyTooltip />} />
                <Legend />
                <Bar dataKey="total_debit" name="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} className="cursor-pointer" />
                <Bar dataKey="total_credit" name="Received" fill="#22c55e" radius={[4, 4, 0, 0]} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Income Pies ─────────────────────────────────────────────────────── */}
      {(incomeByCategoryData.length > 0 || incomeByTagData.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-green-500" /> Income by Category
              </CardTitle>
              <CardDescription>Click a slice to filter transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {incomeByCategoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={incomeByCategoryData} cx="50%" cy="50%"
                      innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {incomeByCategoryData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} className="cursor-pointer opacity-90 hover:opacity-100" onClick={() => goToTransactions(entry.id)} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value?: number | string) => formatINR(Number(value ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">No income by category data</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TagIcon className="h-4 w-4 text-blue-500" /> Income by Tag
              </CardTitle>
              <CardDescription>Click a slice to filter transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {incomeByTagData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={incomeByTagData} cx="50%" cy="50%"
                      innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {incomeByTagData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} className="cursor-pointer opacity-90 hover:opacity-100" onClick={() => goToTransactions(null, entry.id)} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value?: number | string) => formatINR(Number(value ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                  No income by tag — add tags to transactions first
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Spending Over Time ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Spending Over Time</CardTitle>
          <CardDescription>Monthly debit &amp; credit trend</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={summary.monthly_trends}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} className="text-xs" tick={{ fontSize: 11 }} />
              <RechartsTooltip content={<MonthlyTooltip />} />
              <Line type="monotone" dataKey="total_debit" name="Spent" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="total_credit" name="Received" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Category Breakdown ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Click a row to view matching transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.category_spending.map((cat) => {
              const pct = summary.total_debit > 0 ? (cat.total_debit / summary.total_debit) * 100 : 0;
              return (
                <div
                  key={cat.category_id ?? "uncategorized"}
                  className="cursor-pointer space-y-1 rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors"
                  onClick={() => goToTransactions(cat.category_id)}
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color || "#9ca3af" }} />
                      <span className="font-medium">{cat.category_name}</span>
                      <span className="text-muted-foreground">({cat.transaction_count} txns)</span>
                      {cat.total_credit > 0 && (
                        <span className="text-xs text-green-600">+{formatINR(cat.total_credit)}</span>
                      )}
                    </div>
                    <span className="font-mono font-medium text-red-600">{formatINR(cat.total_debit)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cat.color || "#9ca3af" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Tag Breakdown ────────────────────────────────────────────────────── */}
      {summary.tag_spending && summary.tag_spending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TagIcon className="h-4 w-4" /> Tag Breakdown</CardTitle>
            <CardDescription>Click a row to view matching transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.tag_spending.map((tag) => {
                const pct = (summary.total_debit + summary.total_credit) > 0
                  ? ((tag.total_debit + tag.total_credit) / (summary.total_debit + summary.total_credit)) * 100
                  : 0;
                return (
                  <div
                    key={tag.tag_id}
                    className="cursor-pointer space-y-1 rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors"
                    onClick={() => goToTransactions(null, tag.tag_id)}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color || "#6366f1" }} />
                        <span className="font-medium">{tag.tag_name}</span>
                        <span className="text-muted-foreground">({tag.transaction_count} txns)</span>
                        {tag.total_credit > 0 && <span className="text-xs text-green-600">+{formatINR(tag.total_credit)}</span>}
                      </div>
                      {tag.total_debit > 0 && (
                        <span className="font-mono font-medium text-red-600">{formatINR(tag.total_debit)}</span>
                      )}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: tag.color || "#6366f1" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Top Keywords ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Top Keywords</CardTitle>
          <CardDescription>Most frequent keywords across transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {summary.top_keywords.map((kw) => (
              <Badge key={kw.id} variant={kw.category_id ? "default" : "outline"} className="text-sm">
                {kw.keyword}
                <span className="ml-1 opacity-60">({kw.frequency})</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

