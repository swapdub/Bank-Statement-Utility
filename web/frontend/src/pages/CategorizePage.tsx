import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Trash2,
  Tag,
  X,
  EyeOff,
  Eye,
  Zap,
  AlertTriangle,
  Pencil,
  Check,
  CheckSquare,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  getKeywords,
  getCategories,
  getTags,
  createCategory,
  createTag,
  deleteKeyword,
  createKeyword,
  toggleKeywordNoise,
  bulkAssignCategory,
  bulkUpdateTags,
  applyKeywordCategories,
  deleteCategory,
  deleteTag,
  updateCategory,
  updateTag,
} from "@/lib/api";
import type { Keyword, Category as CategoryType, Tag as TagType } from "@/lib/types";

export default function CategorizePage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  // allKeywords: loaded without filters, used for categories/noise tabs
  const [allKeywords, setAllKeywords] = useState<Keyword[]>([]);
  const [noiseKeywords, setNoiseKeywords] = useState<Keyword[]>([]);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [minFreq, setMinFreq] = useState(2);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6366f1");

  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#06b6d4");

  const [newKwOpen, setNewKwOpen] = useState(false);

  // Pending apply state
  const [pendingApply, setPendingApply] = useState(false);

  // Inline editing state for categories/tags
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingCatColor, setEditingCatColor] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingTagColor, setEditingTagColor] = useState("");

  // Manage-Tags dialog: initial state + pending selection
  const [dialogInitialSelected, setDialogInitialSelected] = useState<Set<number>>(new Set());
  const [dialogPendingSelected, setDialogPendingSelected] = useState<Set<number>>(new Set());
  // Tag filter for keyword list
  const [filterTagIds, setFilterTagIds] = useState<number[]>([]);
  const [newKwValue, setNewKwValue] = useState("");

  const [tagAssignOpen, setTagAssignOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [kws, allKws, noiseKws, cats, ts] = await Promise.all([
        getKeywords({
          min_frequency: minFreq,
          search: searchQuery || undefined,
          category_id: filterCategory !== "all" && filterCategory !== "uncategorized" ? Number(filterCategory) : undefined,
          uncategorized: filterCategory === "uncategorized" ? true : undefined,
        }),
        getKeywords({ min_frequency: 1 }),           // all, for categories tab
        getKeywords({ show_noise: true, min_frequency: 1 }).then(all => all.filter(k => k.is_noise)),
        getCategories(),
        getTags(),
      ]);
      setKeywords(kws);
      setAllKeywords(allKws);
      setNoiseKeywords(noiseKws);
      setCategories(cats);
      setTags(ts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterCategory, minFreq]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tag-filtered view of the keyword list (client-side)
  const visibleKeywords = filterTagIds.length === 0
    ? keywords
    : keywords.filter((kw) => filterTagIds.some((tid) => kw.tags.some((t) => t.id === tid)));

  // Selection helpers
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => {
    if (selectedIds.size === visibleKeywords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleKeywords.map((k) => k.id)));
    }
  };

  // Actions
  const handleBulkCategoryAssign = async (catId: number | null) => {
    if (selectedIds.size === 0) return toast.error("Select keywords first");
    try {
      await bulkAssignCategory([...selectedIds], catId);
      toast.success(`Assigned ${selectedIds.size} keyword${selectedIds.size > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setPendingApply(true);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign category");
    }
  };


  const handleApplyCategories = async () => {
    const res = await applyKeywordCategories();
    toast.success(`Updated ${res.updated} transactions${res.conflicts > 0 ? ` (${res.conflicts} conflicts resolved)` : ""}`);
    setPendingApply(false);
    refresh();
  };

  const handleSaveCatName = async (id: number) => {
    if (!editingCatName.trim()) return;
    await updateCategory(id, { name: editingCatName.trim(), color: editingCatColor || undefined });
    setEditingCatId(null);
    toast.success("Category updated");
    refresh();
  };

  const handleSaveTagName = async (id: number) => {
    if (!editingTagName.trim()) return;
    await updateTag(id, { name: editingTagName.trim(), color: editingTagColor || undefined });
    setEditingTagId(null);
    toast.success("Tag updated");
    refresh();
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory({ name: newCatName.trim(), color: newCatColor });
    toast.success("Category created");
    setNewCatOpen(false);
    setNewCatName("");
    refresh();
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    await createTag({ name: newTagName.trim(), color: newTagColor });
    toast.success("Tag created");
    setNewTagOpen(false);
    setNewTagName("");
    refresh();
  };

  const handleCreateKeyword = async () => {
    if (!newKwValue.trim()) return;
    await createKeyword(newKwValue.trim());
    toast.success("Keyword added");
    setNewKwOpen(false);
    setNewKwValue("");
    refresh();
  };

  const handleDeleteKeyword = async (id: number) => {
    await deleteKeyword(id);
    toast.success("Keyword deleted");
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
    refresh();
  };

  const handleToggleNoise = async (id: number) => {
    await toggleKeywordNoise(id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorize Expenses</h1>
          <p className="text-muted-foreground">
            Assign keywords to categories, then apply to transactions.
          </p>
        </div>
        <Button onClick={handleApplyCategories} className="gap-2">
          <Zap className="h-4 w-4" />
          Apply Categories to Transactions
        </Button>
      </div>

      {/* Pending-apply banner */}
      {pendingApply && (
        <div className="flex items-center justify-between rounded-lg border border-yellow-400/50 bg-yellow-50 px-4 py-3 dark:bg-yellow-950/30">
          <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Keywords were assigned to categories — click <strong>Apply</strong> to update transactions.</span>
          </div>
          <Button size="sm" onClick={handleApplyCategories} className="gap-1.5 bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-500">
            <Zap className="h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      )}

      <Tabs defaultValue="keywords" className="space-y-4">
        <TabsList>
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="categories">Category Buckets</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="noise">
            Noise
            {noiseKeywords.length > 0 && (
              <span className="ml-1.5 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-300">
                {noiseKeywords.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Keywords Tab ───────────────────────────────────────────── */}
        <TabsContent value="keywords" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search keywords..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Keywords</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tag filter */}
            {tags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    {filterTagIds.length === 0
                      ? "All tags"
                      : `${filterTagIds.length} tag${filterTagIds.length > 1 ? "s" : ""}`}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" align="start">
                  <p className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">Filter by tag</p>
                  <div className="mb-1 flex gap-1">
                    <button
                      className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted text-left"
                      onClick={() => setFilterTagIds(tags.map((t) => t.id))}
                    >
                      ✓ All
                    </button>
                    {filterTagIds.length > 0 && (
                      <button
                        className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted text-left"
                        onClick={() => setFilterTagIds([])}
                      >
                        × Clear
                      </button>
                    )}
                  </div>
                  {tags.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={filterTagIds.includes(t.id)}
                        onCheckedChange={() =>
                          setFilterTagIds((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((id) => id !== t.id)
                              : [...prev, t.id]
                          )
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color || "#6366f1" }}
                      />
                      {t.name}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Min freq:</label>
              <Input
                type="number"
                className="w-20"
                value={minFreq}
                onChange={(e) => setMinFreq(Number(e.target.value) || 1)}
                min={1}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              disabled={visibleKeywords.length === 0}
              title={selectedIds.size === visibleKeywords.length && visibleKeywords.length > 0 ? "Clear selection" : "Select all visible keywords"}
            >
              {selectedIds.size === visibleKeywords.length && visibleKeywords.length > 0 ? (
                <><X className="mr-1 h-3 w-3" /> Clear</>
              ) : (
                <><CheckSquare className="mr-1 h-3 w-3" /> Select All</>
              )}
            </Button>

            <Dialog open={newKwOpen} onOpenChange={setNewKwOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Plus className="mr-1 h-3 w-3" /> Keyword</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Keyword</DialogTitle>
                  <DialogDescription>Add a custom keyword for categorization.</DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="e.g. SWIGGY"
                  value={newKwValue}
                  onChange={(e) => setNewKwValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateKeyword()}
                />
                <DialogFooter>
                  <Button onClick={handleCreateKeyword}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="flex flex-wrap items-center gap-2 py-3">
                <span className="text-sm font-medium">
                  {selectedIds.size} selected
                </span>
                <Separator orientation="vertical" className="h-6" />

                {/* Assign to category */}
                <Select onValueChange={(v) => handleBulkCategoryAssign(v === "none" ? null : Number(v))}>
                  <SelectTrigger className="w-[180px] h-8">
                    <SelectValue placeholder="Assign category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Remove Category</SelectItem>
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

                {/* Tag actions */}
                <Dialog
                  open={tagAssignOpen}
                  onOpenChange={(open) => {
                    setTagAssignOpen(open);
                    if (open) {
                      // Determine which tags ALL selected keywords already have
                      const selKws = visibleKeywords.filter((kw) => selectedIds.has(kw.id));
                      const allHave = new Set(
                        tags
                          .filter(
                            (tag) =>
                              selKws.length > 0 &&
                              selKws.every((kw) => kw.tags.some((t) => t.id === tag.id))
                          )
                          .map((tag) => tag.id)
                      );
                      setDialogInitialSelected(allHave);
                      setDialogPendingSelected(new Set(allHave));
                    } else {
                      setDialogInitialSelected(new Set());
                      setDialogPendingSelected(new Set());
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Tag className="mr-1 h-3 w-3" /> Tags</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Manage Tags — {selectedIds.size} keyword{selectedIds.size > 1 ? "s" : ""} selected</DialogTitle>
                      <DialogDescription>
                        Tags shown in × are applied to all selected keywords. Toggle to add or remove, then Apply.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {[...tags]
                          .sort((a, b) =>
                            dialogPendingSelected.has(b.id) && !dialogPendingSelected.has(a.id)
                              ? 1
                              : dialogPendingSelected.has(a.id) && !dialogPendingSelected.has(b.id)
                              ? -1
                              : 0
                          )
                          .map((t) => {
                            const active = dialogPendingSelected.has(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() =>
                                  setDialogPendingSelected((prev) => {
                                    const next = new Set(prev);
                                    next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                    return next;
                                  })
                                }
                                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                                  active
                                    ? "border-transparent text-white shadow-sm"
                                    : "border-border bg-background hover:bg-muted text-foreground"
                                }`}
                                style={active ? { backgroundColor: t.color || "#6366f1" } : {}}
                              >
                                <span
                                  className={`inline-flex transition-transform duration-200 ${
                                    active ? "rotate-45" : ""
                                  }`}
                                >
                                  <Plus className="h-3 w-3" />
                                </span>
                                {t.name}
                              </button>
                            );
                          })}
                        {tags.length === 0 && (
                          <p className="text-sm text-muted-foreground">No tags yet. Create one in the Tags tab.</p>
                        )}
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setTagAssignOpen(false);
                          setDialogInitialSelected(new Set());
                          setDialogPendingSelected(new Set());
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={!(
                          [...dialogPendingSelected].some((id) => !dialogInitialSelected.has(id)) ||
                          [...dialogInitialSelected].some((id) => !dialogPendingSelected.has(id))
                        )}
                        onClick={async () => {
                          const toAdd = [...dialogPendingSelected].filter((id) => !dialogInitialSelected.has(id));
                          const toRemove = [...dialogInitialSelected].filter((id) => !dialogPendingSelected.has(id));
                          if (toAdd.length > 0 || toRemove.length > 0) {
                            await bulkUpdateTags([...selectedIds], toAdd, toRemove);
                            const parts: string[] = [];
                            if (toAdd.length > 0) parts.push(`+${toAdd.length} added`);
                            if (toRemove.length > 0) parts.push(`−${toRemove.length} removed`);
                            toast.success(
                              `${parts.join(", ")} on ${selectedIds.size} keyword${selectedIds.size > 1 ? "s" : ""}`
                            );
                            refresh();
                          }
                          setTagAssignOpen(false);
                          setDialogInitialSelected(new Set());
                          setDialogPendingSelected(new Set());
                        }}
                      >
                        Apply
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X className="mr-1 h-3 w-3" /> Clear
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Keywords list */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh]">
                <div className="divide-y">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 sticky top-0">
                    <Checkbox
                      checked={visibleKeywords.length > 0 && selectedIds.size === visibleKeywords.length}
                      onCheckedChange={selectAll}
                    />
                    <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase">Keyword</span>
                    <span className="w-16 text-xs font-semibold text-muted-foreground uppercase text-center">Freq</span>
                    <span className="w-40 text-xs font-semibold text-muted-foreground uppercase">Category</span>
                    <span className="w-32 text-xs font-semibold text-muted-foreground uppercase">Tags</span>
                    <span className="w-20" />
                  </div>

                  {loading ? (
                    <div className="py-10 text-center text-muted-foreground">Loading...</div>
                  ) : keywords.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      No keywords found. Upload statements to extract keywords.
                    </div>
                  ) : (
                    visibleKeywords.map((kw) => (
                      <div
                        key={kw.id}
                        className={`flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors ${
                          selectedIds.has(kw.id) ? "bg-primary/5" : ""
                        }`}
                      >
                        <Checkbox
                          checked={selectedIds.has(kw.id)}
                          onCheckedChange={() => toggleSelect(kw.id)}
                        />
                        <span className="flex-1 font-mono text-sm font-medium">{kw.keyword}</span>
                        <span className="w-16 text-center">
                          <Badge variant="secondary">{kw.frequency}</Badge>
                        </span>
                        <span className="w-40">
                          {kw.category_name ? (
                            <Badge style={{ backgroundColor: categories.find(c => c.id === kw.category_id)?.color || "#ccc", color: "#fff" }}>
                              {kw.category_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </span>
                        <span className="w-32 flex flex-wrap gap-1">
                          {kw.tags.map((t) => (
                            <Badge key={t.id} variant="outline" className="text-xs">{t.name}</Badge>
                          ))}
                        </span>
                        <span className="w-20 flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Mark as noise (hide)"
                            onClick={() => handleToggleNoise(kw.id)}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            title="Delete"
                            onClick={() => handleDeleteKeyword(kw.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories Tab ─────────────────────────────────────────── */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Drag keywords into category buckets. Each keyword can belong to only one category.
            </p>
            <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-3 w-3" /> New Category</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Category</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Groceries" />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border" />
                      <Input value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} className="w-28" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCategory}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Card key={cat.id} className="relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: cat.color || "#ccc" }} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {editingCatId === cat.id ? (
                      <div className="flex items-center gap-1 flex-1 mr-2">
                        {/* Color picker inline while editing */}
                        <label className="cursor-pointer shrink-0" title="Change color">
                          <span
                            className="inline-block h-6 w-6 rounded border border-border"
                            style={{ backgroundColor: editingCatColor || cat.color || "#ccc" }}
                          />
                          <input
                            type="color"
                            className="sr-only"
                            value={editingCatColor || cat.color || "#6366f1"}
                            onChange={(e) => setEditingCatColor(e.target.value)}
                          />
                        </label>
                        <Input
                          autoFocus
                          className="h-7 text-sm"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveCatName(cat.id);
                            if (e.key === "Escape") setEditingCatId(null);
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleSaveCatName(cat.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {/* Clickable color dot — opens native color picker */}
                        <label className="cursor-pointer" title="Change color">
                          <span
                            className="inline-block h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                            style={{ backgroundColor: cat.color || "#ccc" }}
                          />
                          <input
                            type="color"
                            className="sr-only"
                            value={cat.color || "#6366f1"}
                            onChange={async (e) => {
                              await updateCategory(cat.id, { color: e.target.value });
                              refresh();
                            }}
                          />
                        </label>
                        <CardTitle className="text-base">{cat.name}</CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatColor(cat.color || ""); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={async () => {
                        try {
                          await deleteCategory(cat.id);
                          toast.success("Category deleted");
                          refresh();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to delete");
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <CardDescription>
                    {cat.keyword_count} keywords · {cat.transaction_count} transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {allKeywords
                      .filter((kw) => kw.category_id === cat.id)
                      .slice(0, 10)
                      .map((kw) => (
                        <Badge key={kw.id} variant="secondary" className="text-xs">
                          {kw.keyword}
                          <span className="ml-1 text-muted-foreground">({kw.frequency})</span>
                        </Badge>
                      ))}
                    {(allKeywords.filter(kw => kw.category_id === cat.id).length > 10) && (
                      <Badge variant="outline" className="text-xs">
                        +{allKeywords.filter(kw => kw.category_id === cat.id).length - 10} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Uncategorized bucket */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <CardTitle className="text-base">Uncategorized</CardTitle>
                </div>
                <CardDescription>
                  {allKeywords.filter((k) => !k.category_id).length} keywords need categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {allKeywords
                    .filter((kw) => !kw.category_id)
                    .slice(0, 10)
                    .map((kw) => (
                      <Badge key={kw.id} variant="outline" className="text-xs">
                        {kw.keyword} ({kw.frequency})
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tags Tab ───────────────────────────────────────────────── */}
        <TabsContent value="tags" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Tags are free-form labels. Select keywords in the Keywords tab and assign tags in bulk.
            </p>
            <Dialog open={newTagOpen} onOpenChange={setNewTagOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-3 w-3" /> New Tag</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Tag</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="e.g. recurring" />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border" />
                      <Input value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="w-28" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTag}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tags.map((tag) => (
              <Card key={tag.id} className="group">
                <CardContent className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2 flex-1">
                    {editingTagId === tag.id ? (
                      <>
                        {/* Color picker while editing */}
                        <label className="cursor-pointer shrink-0" title="Change color">
                          <span
                            className="inline-block h-6 w-6 rounded border border-border"
                            style={{ backgroundColor: editingTagColor || tag.color || "#ccc" }}
                          />
                          <input
                            type="color"
                            className="sr-only"
                            value={editingTagColor || tag.color || "#6366f1"}
                            onChange={(e) => setEditingTagColor(e.target.value)}
                          />
                        </label>
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            autoFocus
                            className="h-7 text-sm"
                            value={editingTagName}
                            onChange={(e) => setEditingTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTagName(tag.id);
                              if (e.key === "Escape") setEditingTagId(null);
                            }}
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleSaveTagName(tag.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Clickable color dot */}
                        <label className="cursor-pointer shrink-0" title="Change color">
                          <span
                            className="inline-block h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                            style={{ backgroundColor: tag.color || "#ccc" }}
                          />
                          <input
                            type="color"
                            className="sr-only"
                            value={tag.color || "#6366f1"}
                            onChange={async (e) => {
                              await updateTag(tag.id, { color: e.target.value });
                              refresh();
                            }}
                          />
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{tag.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name); setEditingTagColor(tag.color || ""); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={async () => {
                      await deleteTag(tag.id);
                      toast.success("Tag deleted");
                      refresh();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}

            {tags.length === 0 && (
              <p className="col-span-full text-center py-10 text-muted-foreground">
                No tags yet. Create one to label your keywords.
              </p>
            )}
          </div>
        </TabsContent>

        {/* ── Noise Tab ─────────────────────────────────────────────── */}
        <TabsContent value="noise" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              These keywords were marked as noise and hidden from the main list. Restore them to use them for categorization.
            </p>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh]">
                <div className="divide-y">
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 sticky top-0">
                    <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase">Keyword</span>
                    <span className="w-16 text-xs font-semibold text-muted-foreground uppercase text-center">Freq</span>
                    <span className="w-24" />
                  </div>
                  {noiseKeywords.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      No noise keywords. Keywords you hide will appear here.
                    </div>
                  ) : (
                    noiseKeywords.map((kw) => (
                      <div
                        key={kw.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30"
                      >
                        <span className="flex-1 font-mono text-sm line-through text-muted-foreground">{kw.keyword}</span>
                        <span className="w-16 text-center">
                          <Badge variant="secondary">{kw.frequency}</Badge>
                        </span>
                        <span className="w-24 flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={async () => {
                              await toggleKeywordNoise(kw.id);
                              toast.success(`Restored "${kw.keyword}"`);
                              refresh();
                            }}
                          >
                            <Eye className="h-3 w-3" /> Restore
                          </Button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
