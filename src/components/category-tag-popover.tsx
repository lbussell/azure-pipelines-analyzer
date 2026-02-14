import { useState } from "react";
import { RiAddLine, RiCheckLine, RiPriceTag3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories } from "@/contexts";
import type { PipelineNode } from "@/types";

export function CategoryTagPopover({ node }: { node: PipelineNode }) {
  const { categories, addCategory, addRule, rules, getCategoryForNode } =
    useCategories();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");

  const currentCatId = getCategoryForNode(node);

  const handlePickCategory = (categoryId: string) => {
    // Check if an exact-match rule already exists for this task name + category
    const exists = rules.some(
      (r) =>
        r.matchType === "exact" &&
        r.pattern === node.name &&
        r.categoryId === categoryId
    );
    if (!exists) {
      addRule({
        pattern: node.name,
        matchType: "exact",
        categoryId,
        priority: rules.length,
      });
    }
    setOpen(false);
  };

  const handleAddAndPick = () => {
    if (!newName.trim()) return;
    const cat = addCategory(newName.trim(), newColor);
    setNewName("");
    handlePickCategory(cat.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <RiPriceTag3Line className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        // className="w-56 p-1.5"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-muted-foreground text-sm px-2 truncate">
          Rule: exact match &ldquo;{node.name}&rdquo;
        </p>
        <div className="max-h-48 overflow-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
              onClick={() => handlePickCategory(cat.id)}
            >
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              <span className="flex-1 truncate">{cat.name}</span>
              {currentCatId === cat.id && (
                <RiCheckLine className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Inline new category */}
        <div className="flex items-center gap-1.5 px-1 pt-1.5 border-t mt-1.5">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-7 w-7 rounded border cursor-pointer shrink-0"
          />
          <Input
            placeholder="New category…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddAndPick()}
            className="flex-1 h-7 px-1.5"
          />
          <Button
            variant="ghost"
            size="lg"
            className="h-7 w-7 p-0 shrink-0"
            onClick={handleAddAndPick}
            disabled={!newName.trim()}
          >
            <RiAddLine className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
