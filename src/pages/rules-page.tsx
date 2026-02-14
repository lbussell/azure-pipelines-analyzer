import { useState } from "react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiDownloadLine,
  RiUploadLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCategories } from "@/contexts";
import { useTimeline } from "@/contexts";
import { collectNodes } from "@/lib/parser";
import type { RuleMatchType } from "@/types";

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

function CategoryManager() {
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
              onClick={() => removeCategory(cat.id)}
            >
              <RiDeleteBinLine className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-2 border-t">
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
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
            <RiAddLine className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleMatchCount({ pattern, matchType }: { pattern: string; matchType: RuleMatchType }) {
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
        try { if (new RegExp(pattern, "i").test(t.name)) count++; } catch { /* skip */ }
        break;
    }
  }

  return (
    <Badge variant="secondary" className="text-xs">
      {count} match{count !== 1 ? "es" : ""}
    </Badge>
  );
}

function RulesManager() {
  const { rules, categories, addRule, removeRule, reorderRules } =
    useCategories();
  const [newPattern, setNewPattern] = useState("");
  const [newMatchType, setNewMatchType] = useState<RuleMatchType>("contains");
  const [newCategoryId, setNewCategoryId] = useState("");

  const handleAddRule = () => {
    if (!newPattern.trim() || !newCategoryId) return;
    addRule({
      pattern: newPattern.trim(),
      matchType: newMatchType,
      categoryId: newCategoryId,
      priority: rules.length,
    });
    setNewPattern("");
    setNewCategoryId("");
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const newRules = [...rules];
    const target = index + direction;
    if (target < 0 || target >= newRules.length) return;
    [newRules[index], newRules[target]] = [newRules[target], newRules[index]];
    // Update priorities
    const reordered = newRules.map((r, i) => ({ ...r, priority: i }));
    reorderRules(reordered);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rules yet. Add rules to auto-categorize pipeline tasks by name.
          </p>
        )}

        {rules
          .sort((a, b) => a.priority - b.priority)
          .map((rule, index) => {
            const cat = categories.find((c) => c.id === rule.categoryId);
            return (
              <div
                key={rule.id}
                className="flex items-center gap-2 p-2 rounded border bg-muted/30"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => moveRule(index, -1)}
                    disabled={index === 0}
                  >
                    <RiArrowUpLine className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => moveRule(index, 1)}
                    disabled={index === rules.length - 1}
                  >
                    <RiArrowDownLine className="h-3 w-3" />
                  </Button>
                </div>

                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {rule.matchType}
                </Badge>

                <code className="flex-1 truncate bg-muted px-1.5 py-0.5 rounded">
                  {rule.pattern}
                </code>

                <span className="text-muted-foreground">→</span>

                {cat && (
                  <span className="flex items-center gap-1 shrink-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </span>
                )}

                <RuleMatchCount pattern={rule.pattern} matchType={rule.matchType} />

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => removeRule(rule.id)}
                >
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

        {/* Add rule form */}
        {categories.length > 0 ? (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Select
                value={newMatchType}
                onValueChange={(v) => setNewMatchType(v as RuleMatchType)}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="exact">exact</SelectItem>
                  <SelectItem value="startsWith">starts with</SelectItem>
                  <SelectItem value="regex">regex</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Pattern..."
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                className="flex-1 h-8 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select value={newCategoryId} onValueChange={(v) => { if (v !== null) setNewCategoryId(v); }}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Select category..." />
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

              {newPattern && (
                <RuleMatchCount pattern={newPattern} matchType={newMatchType} />
              )}

              <Button
                size="sm"
                onClick={handleAddRule}
                disabled={!newPattern.trim() || !newCategoryId}
              >
                <RiAddLine className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground pt-2 border-t">
            Add categories above before creating rules.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ImportExport() {
  const { exportData, importData } = useCategories();
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import / Export</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <RiDownloadLine className="h-4 w-4 mr-1" />
          Export Rules
        </Button>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger>
            <Button variant="secondary" size="sm">
              <RiUploadLine className="h-4 w-4 mr-1" />
              Import Rules
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Rules</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Paste JSON:</Label>
              <textarea
                className="w-full h-40 font-mono border rounded p-2 bg-muted"
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
      </CardContent>
    </Card>
  );
}

export function RulesPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold">Categorization Rules</h2>
      <p className="text-muted-foreground">
        Define categories and rules to automatically classify pipeline tasks.
        Rules are matched in priority order — the first matching rule wins.
      </p>
      <CategoryManager />
      <RulesManager />
      <ImportExport />
    </div>
  );
}
