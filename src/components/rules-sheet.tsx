import { useState } from "react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiDownloadLine,
  RiUploadLine,
  RiEdit2Line,
  RiCloseLine,
  RiCheckLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCategories, useTimeline } from "@/contexts";
import { collectNodes } from "@/lib/parser";
import type { CategorizationRule, RuleMatchType } from "@/types";

const PRESET_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

function RuleMatchCount({
  pattern,
  matchType,
}: {
  pattern: string;
  matchType: RuleMatchType;
}) {
  const { tree } = useTimeline();
  if (!tree || !pattern) return null;

  const tasks = collectNodes(tree.stages, "Task");
  let count = 0;
  for (const t of tasks) {
    switch (matchType) {
      case "exact":
        if (t.name === pattern) count++;
        break;
      case "contains":
        if (t.name.toLowerCase().includes(pattern.toLowerCase())) count++;
        break;
      case "startsWith":
        if (t.name.toLowerCase().startsWith(pattern.toLowerCase())) count++;
        break;
      case "regex":
        try {
          if (new RegExp(pattern, "i").test(t.name)) count++;
        } catch {
          /* skip */
        }
        break;
    }
  }

  return (
    <Badge variant="secondary" className="text-xs">
      {count} match{count !== 1 ? "es" : ""}
    </Badge>
  );
}

function CategorySection() {
  const { categories, addCategory, updateCategory, removeCategory } =
    useCategories();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addCategory(newName.trim(), newColor);
    setNewName("");
    setNewColor(PRESET_COLORS[(categories.length + 1) % PRESET_COLORS.length]);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Categories</h3>
      {categories.map((cat) => (
        <div key={cat.id} className="flex items-center gap-2">
          <input
            type="color"
            value={cat.color}
            onChange={(e) => updateCategory(cat.id, { color: e.target.value })}
            className="h-8 w-8 rounded border cursor-pointer"
          />
          <Input
            value={cat.name}
            onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
            className="flex-1 h-8"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => removeCategory(cat.id)}
          >
            <RiDeleteBinLine className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-8 w-8 rounded border cursor-pointer"
        />
        <Input
          placeholder="New category name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 h-8"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newName.trim()}
        >
          <RiAddLine className="h-3.5 w-3.5 mr-0.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  index,
  total,
  onMove,
}: {
  rule: CategorizationRule;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const { categories, updateRule, removeRule } = useCategories();
  const [editing, setEditing] = useState(false);
  const [editPattern, setEditPattern] = useState(rule.pattern);
  const [editMatchType, setEditMatchType] = useState<RuleMatchType>(rule.matchType);
  const [editCategoryId, setEditCategoryId] = useState(rule.categoryId);

  const cat = categories.find((c) => c.id === rule.categoryId);

  const handleSave = () => {
    updateRule(rule.id, {
      pattern: editPattern.trim(),
      matchType: editMatchType,
      categoryId: editCategoryId,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditPattern(rule.pattern);
    setEditMatchType(rule.matchType);
    setEditCategoryId(rule.categoryId);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-2.5 rounded border bg-muted/30 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Select
            value={editMatchType}
            onValueChange={(v) => { if (v) setEditMatchType(v as RuleMatchType); }}
          >
            <SelectTrigger className="w-28 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exact">exact</SelectItem>
              <SelectItem value="contains">contains</SelectItem>
              <SelectItem value="startsWith">starts with</SelectItem>
              <SelectItem value="regex">regex</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={editPattern}
            onChange={(e) => setEditPattern(e.target.value)}
            className="flex-1 h-8"
            placeholder="Pattern..."
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={editCategoryId}
            onValueChange={(v) => { if (v) setEditCategoryId(v); }}
          >
            <SelectTrigger className="flex-1 h-8">
              <SelectValue placeholder="Category...">
                {(() => {
                  const editCat = categories.find((c) => c.id === editCategoryId);
                  return editCat ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: editCat.color }}
                      />
                      {editCat.name}
                    </span>
                  ) : "Category...";
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RuleMatchCount pattern={editPattern} matchType={editMatchType} />
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <RiCloseLine className="h-3.5 w-3.5 mr-0.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!editPattern.trim() || !editCategoryId}>
            <RiCheckLine className="h-3.5 w-3.5 mr-0.5" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 p-2 rounded border bg-muted/30 text-sm">
      <div className="flex flex-col gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
        >
          <RiArrowUpLine className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
        >
          <RiArrowDownLine className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex flex-col min-w-0 flex-1 gap-1">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">
            {rule.matchType.charAt(0).toUpperCase() + rule.matchType.slice(1)}:
          </span>
          <code className="text-xs truncate bg-muted px-1 py-0.5 rounded font-mono">
            {rule.pattern}
          </code>
        </div>
        <div className="flex items-center gap-1.5">
          {/* <span className="text-muted-foreground">→</span> */}
          {cat && (
            <span className="flex text-xs items-center gap-1 shrink-0">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </span>
          )}
          <RuleMatchCount pattern={rule.pattern} matchType={rule.matchType} />
        </div>
      </div>




      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0"
        onClick={() => setEditing(true)}
      >
        <RiEdit2Line className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0"
        onClick={() => removeRule(rule.id)}
      >
        <RiDeleteBinLine className="h-3 w-3" />
      </Button>
    </div>
  );
}

function RulesSection() {
  const { rules, reorderRules, clearAllRules } = useCategories();
  const [confirmClear, setConfirmClear] = useState(false);

  const moveRule = (index: number, direction: -1 | 1) => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    reorderRules(sorted.map((r, i) => ({ ...r, priority: i })));
  };

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Rules (priority order)</h3>
        {sorted.length > 0 && (
          confirmClear ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Clear all?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { clearAllRules(); setConfirmClear(false); }}
              >
                Yes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(false)}
              >
                No
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              <RiDeleteBinLine className="h-3.5 w-3.5 mr-0.5" />
              Clear All
            </Button>
          )
        )}
      </div>
      {sorted.length === 0 && (
        <p className="text-muted-foreground">
          No rules yet. Use the tag icon next to tasks in the explorer to
          create rules quickly.
        </p>
      )}
      {sorted.map((rule, index) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          index={index}
          total={sorted.length}
          onMove={moveRule}
        />
      ))}
    </div>
  );
}

function ImportExportSection() {
  const { exportData, importData } = useCategories();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline-analyzer-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    try {
      importData(importText);
      setImportText("");
      setImportOpen(false);
    } catch {
      alert("Invalid JSON");
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Import / Export</h3>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <RiDownloadLine className="h-3.5 w-3.5 mr-1" />
          Export
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
          <RiUploadLine className="h-3.5 w-3.5 mr-1" />
          Import
        </Button>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Rules</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Paste JSON:</Label>
            <textarea
              className="w-full h-40 text-sm font-mono border rounded p-2 bg-muted"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importText.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RulesSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>Categorization Rules</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="space-y-6 p-4">
            <p className="text-muted-foreground">
              Define categories and rules to classify pipeline tasks. Rules
              match in priority order — first match wins.
            </p>
            <CategorySection />
            <div className="border-t" />
            <RulesSection />
            <div className="border-t" />
            <ImportExportSection />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
