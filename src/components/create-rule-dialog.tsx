import { useState, useEffect } from "react";
import { RiAddLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useCategories, useTimeline } from "@/contexts";
import { collectNodes } from "@/lib/parser";
import type { RuleMatchType } from "@/types";

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

export function CreateRuleDialog({
  open,
  onOpenChange,
  defaultPattern,
  defaultMatchType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPattern?: string;
  defaultMatchType?: RuleMatchType;
}) {
  const { categories, rules, addRule, addCategory } = useCategories();
  const [pattern, setPattern] = useState(defaultPattern ?? "");
  const [matchType, setMatchType] = useState<RuleMatchType>(
    defaultMatchType ?? "contains"
  );
  const [categoryId, setCategoryId] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");

  // Reset form when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      setPattern(defaultPattern ?? "");
      setMatchType(defaultMatchType ?? "contains");
      setCategoryId("");
      setNewCatName("");
    }
  }, [open, defaultPattern, defaultMatchType]);

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const cat = addCategory(newCatName.trim(), newCatColor);
    setCategoryId(cat.id);
    setNewCatName("");
  };

  const handleSubmit = () => {
    if (!pattern.trim() || !categoryId) return;
    addRule({
      pattern: pattern.trim(),
      matchType,
      categoryId,
      priority: rules.length,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Categorization Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pattern */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Pattern</label>
            <div className="flex items-center gap-2">
              <Select
                value={matchType}
                onValueChange={(v) => {
                  if (v) setMatchType(v as RuleMatchType);
                }}
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
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Task name pattern..."
                className="flex-1 h-8"
              />
            </div>
            {pattern && (
              <RuleMatchCount pattern={pattern} matchType={matchType} />
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category</label>
            {categories.length > 0 ? (
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  if (v) setCategoryId(v);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
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
            ) : (
              <p className="text-xs text-muted-foreground">
                No categories yet — create one below.
              </p>
            )}

            {/* Inline quick-add category */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="h-7 w-7 rounded border cursor-pointer shrink-0"
              />
              <Input
                placeholder="New category..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="flex-1 h-7 text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddCategory}
                disabled={!newCatName.trim()}
              >
                <RiAddLine className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!pattern.trim() || !categoryId}
          >
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
