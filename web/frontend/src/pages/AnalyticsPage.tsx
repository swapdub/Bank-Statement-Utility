import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
  AlertCircle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getAnalyticsSummary, getCategories, getTransactionBanks } from "@/lib/api";
import type { AnalyticsSummary, Category } from "@/lib/types";
import { formatINR } from "@/lib/format";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bankFilter, setBankFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [banks, setBanks] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    Promise.all([getTransactionBanks(), getCategories()])
      .then(([b, c]) => { setBanks(b); setCategories(c); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    getAnalyticsSummary({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      bank_name: bankFilter !== "__all__" ? bankFilter : undefined,
      category_id: categoryFilter !== "__all__" ? Number(categoryFilter) : undefined,
    })
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, bankFilter, categoryFilter]);

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground">Loading analytics...</div>;
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

  const pieData = summary.category_spending
    .filter((c) => c.total_debit > 0)
    .map((c) => ({
      name: c.category_name,
      value: c.total_debit,
      color: c.color || "#9ca3af",
    }));

  const categorizationPct = Math.round(
    (summary.categorized_count / summary.transaction_count) * 100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Spending Analytics</h1>
          <p className="text-muted-foreground">
            {summary.transaction_count.toLocaleString()} transactions analyzed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
          />
          {banks.length > 0 && (
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="w-[160px]">
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
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
          )}
        </div>
      </div>

      {/* Summary Cards */}
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
            <p className="text-xs text-muted-foreground">
              {summary.uncategorized_count} uncategorized
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie Chart - Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieIcon className="h-4 w-4" /> Spending by Category
            </CardTitle>
            <CardDescription>Debit amounts grouped by category</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value?: number | string) => formatINR(Number(value ?? 0))}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center text-muted-foreground">
                Categorize keywords to see the breakdown
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart - Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Monthly Trends
            </CardTitle>
            <CardDescription>Debit vs Credit by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={summary.monthly_trends}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <RechartsTooltip formatter={(value?: number | string) => formatINR(Number(value ?? 0))} />
                <Legend />
                <Bar dataKey="total_debit" name="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_credit" name="Received" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Spending over time line chart */}
      <Card>
        <CardHeader>
          <CardTitle>Spending Over Time</CardTitle>
          <CardDescription>Monthly debit trend line</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={summary.monthly_trends}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} className="text-xs" />
              <RechartsTooltip formatter={(value?: number | string) => formatINR(Number(value ?? 0))} />
              <Line
                type="monotone"
                dataKey="total_debit"
                name="Spent"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="total_credit"
                name="Received"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category spending table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.category_spending.map((cat) => {
              const pct = summary.total_debit > 0
                ? (cat.total_debit / summary.total_debit) * 100
                : 0;
              return (
                <div key={cat.category_id ?? "uncategorized"} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: cat.color || "#9ca3af" }}
                      />
                      <span className="font-medium">{cat.category_name}</span>
                      <span className="text-muted-foreground">
                        ({cat.transaction_count} txns)
                      </span>
                    </div>
                    <span className="font-mono font-medium text-red-600">
                      {formatINR(cat.total_debit)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: cat.color || "#9ca3af",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>Top Keywords</CardTitle>
          <CardDescription>Most frequent keywords across transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {summary.top_keywords.map((kw) => (
              <Badge
                key={kw.id}
                variant={kw.category_id ? "default" : "outline"}
                className="text-sm"
                style={kw.category_name ? {} : undefined}
              >
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
