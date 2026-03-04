import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

export interface MultiSelectItem {
  id: number;
  label: string;
  color?: string;
}

export interface SpecialOption {
  /** Display label, e.g. "Uncategorized" */
  label: string;
  color?: string;
  /** Badge count shown next to label (e.g. uncategorized_count) */
  count?: number;
  checked: boolean;
  onToggle: () => void;
}

interface Props {
  /** All available selectable items */
  items: MultiSelectItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  /** Used for trigger label when all selected, e.g. "All Categories" */
  allLabel: string;
  /** Optional icon rendered before trigger text */
  icon?: React.ReactNode;
  /** Special sentinel option (Uncategorized / Untagged) rendered first */
  special?: SpecialOption;
  /** Tailwind width class for the PopoverContent, default "w-56" */
  popoverWidth?: string;
  /** Extra className applied to the trigger button */
  triggerClassName?: string;
  /** When true, trigger uses a compact h-8 appearance (Analytics toolbar style) */
  compact?: boolean;
}

export function MultiSelectFilter({
  items,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  allLabel,
  icon,
  special,
  popoverWidth = "w-56",
  triggerClassName = "",
  compact = false,
}: Props) {
  // Determine trigger label
  const allSelected = selectedIds.length === items.length && !special?.checked;
  const noneSelected = selectedIds.length === 0 && !special?.checked;

  let label: string;
  if (noneSelected && !special?.checked) {
    label = allLabel; // treat no selection as "all" for display
  } else if (special?.checked && selectedIds.length === 0) {
    label = special.label;
  } else if (special?.checked) {
    // special + some items
    label = `${selectedIds.length + 1} selected`;
  } else if (allSelected) {
    label = allLabel;
  } else {
    label = `${selectedIds.length} selected`;
  }

  const triggerBase = compact
    ? "h-8 gap-1 text-sm font-medium"
    : "w-full justify-between font-normal";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={`${triggerBase} ${triggerClassName}`}
        >
          <span className="flex items-center gap-1.5 truncate">
            {icon}
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`${popoverWidth} p-0`}
        side="bottom"
        sideOffset={4}
        align="start"
      >
        {/* Sticky All / Clear header */}
        <div className="flex items-center justify-between border-b px-3 py-2 sticky top-0 bg-popover z-10">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={onSelectAll}
          >
            All
          </button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClear}
          >
            Clear
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {/* Special option (Uncategorized / Untagged) */}
          {special && (
            <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50 border-b">
              <Checkbox
                checked={special.checked}
                onCheckedChange={special.onToggle}
              />
              {special.color && (
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: special.color }}
                />
              )}
              <span className="text-sm text-muted-foreground flex-1">{special.label}</span>
              {special.count !== undefined && special.count > 0 && (
                <span className="text-xs text-muted-foreground">{special.count}</span>
              )}
            </label>
          )}

          {/* Regular items */}
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => onToggle(item.id)}
              />
              {item.color && (
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: item.color }}
                />
              )}
              <span className="text-sm truncate">{item.label}</span>
            </label>
          ))}

          {items.length === 0 && (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground">No options</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
