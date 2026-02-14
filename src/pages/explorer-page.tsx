import { useState, useMemo } from "react";
import {
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiTimeLine,
  RiSearchLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTimeline, useCategories } from "@/contexts";
import type { PipelineNode } from "@/types";
import { formatDuration } from "@/lib/parser";

function ResultIcon({ result }: { result: string | null }) {
  switch (result) {
    case "succeeded":
      return <RiCheckLine className="h-4 w-4 text-emerald-500" />;
    case "succeededWithIssues":
      return <RiErrorWarningLine className="h-4 w-4 text-amber-500" />;
    case "failed":
      return <RiCloseLine className="h-4 w-4 text-destructive" />;
    case "canceled":
    case "skipped":
      return <RiCloseLine className="h-4 w-4 text-muted-foreground" />;
    default:
      return <RiTimeLine className="h-4 w-4 text-muted-foreground" />;
  }
}

function DurationBar({
  durationMs,
  maxMs,
}: {
  durationMs: number;
  maxMs: number;
}) {
  const width = maxMs > 0 ? (durationMs / maxMs) * 100 : 0;
  return (
    <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary/60"
        style={{ width: `${Math.max(width, 1)}%` }}
      />
    </div>
  );
}

function CategoryBadge({
  node,
  onAssign,
}: {
  node: PipelineNode;
  onAssign: (nodeId: string, categoryId: string | null) => void;
}) {
  const { categories, getCategoryForNode, getCategoryById } = useCategories();
  const catId = getCategoryForNode(node);
  const cat = getCategoryById(catId);

  if (categories.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Select
      value={catId ?? "__none__"}
      onValueChange={(v) => onAssign(node.id, v === "__none__" ? null : v)}
    >
      <SelectTrigger className="h-6 w-32 text-xs px-2 py-0">
        <SelectValue>
          {cat ? (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </span>
          ) : (
            "—"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  maxDurationMs,
  onAssign,
}: {
  node: PipelineNode;
  depth: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  onSelect: (node: PipelineNode) => void;
  maxDurationMs: number;
  onAssign: (nodeId: string, categoryId: string | null) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isTask = node.type === "Task";

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 text-sm"
      style={{ paddingLeft: `${depth * 20 + 12}px` }}
      onClick={() => (hasChildren ? onToggle(node.id) : onSelect(node))}
    >
      {/* Expand/collapse toggle */}
      <span className="w-4 shrink-0">
        {hasChildren ? (
          expanded ? (
            <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
          ) : (
            <RiArrowRightSLine className="h-4 w-4 text-muted-foreground" />
          )
        ) : null}
      </span>

      {/* Result icon */}
      <ResultIcon result={node.result} />

      {/* Name */}
      <span
        className="flex-1 truncate cursor-pointer hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
        }}
      >
        {node.name}
      </span>

      {/* Type badge */}
      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
        {node.type}
      </Badge>

      {/* Category */}
      {isTask && (
        <span
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <CategoryBadge node={node} onAssign={onAssign} />
        </span>
      )}

      {/* Duration */}
      <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
        {formatDuration(node.durationMs)}
      </span>

      {/* Duration bar */}
      <DurationBar durationMs={node.durationMs} maxMs={maxDurationMs} />
    </div>
  );
}

function NodeDetail({ node }: { node: PipelineNode }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-muted-foreground">Type</span>
          <p className="font-medium">{node.type}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Result</span>
          <p className="font-medium flex items-center gap-1">
            <ResultIcon result={node.result} />
            {node.result ?? "N/A"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Duration</span>
          <p className="font-medium">{formatDuration(node.durationMs)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Worker</span>
          <p className="font-medium">{node.workerName ?? "N/A"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Start</span>
          <p className="font-medium">
            {node.startTime?.toLocaleTimeString() ?? "N/A"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Finish</span>
          <p className="font-medium">
            {node.finishTime?.toLocaleTimeString() ?? "N/A"}
          </p>
        </div>
        {node.errorCount > 0 && (
          <div>
            <span className="text-muted-foreground">Errors</span>
            <p className="font-medium text-destructive">{node.errorCount}</p>
          </div>
        )}
        {node.warningCount > 0 && (
          <div>
            <span className="text-muted-foreground">Warnings</span>
            <p className="font-medium text-amber-500">{node.warningCount}</p>
          </div>
        )}
        {node.taskReference && (
          <>
            <div>
              <span className="text-muted-foreground">Task Name</span>
              <p className="font-medium">{node.taskReference.name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Task Version</span>
              <p className="font-medium">{node.taskReference.version}</p>
            </div>
          </>
        )}
      </div>
      {node.children.length > 0 && (
        <div>
          <span className="text-muted-foreground">
            Children: {node.children.length}
          </span>
        </div>
      )}
    </div>
  );
}

export function ExplorerPage() {
  const { tree } = useTimeline();
  const { setOverride } = useCategories();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null);
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!tree) return;
    const ids = new Set<string>();
    const visit = (n: PipelineNode) => {
      if (n.children.length > 0) ids.add(n.id);
      n.children.forEach(visit);
    };
    tree.stages.forEach(visit);
    setExpandedIds(ids);
  };

  const collapseAll = () => setExpandedIds(new Set());

  // Compute max duration across all nodes for bar scaling
  const maxDurationMs = useMemo(() => {
    if (!tree) return 0;
    let max = 0;
    const visit = (n: PipelineNode) => {
      if (n.durationMs > max) max = n.durationMs;
      n.children.forEach(visit);
    };
    tree.stages.forEach(visit);
    return max;
  }, [tree]);

  // Build flat visible list
  const visibleRows = useMemo(() => {
    if (!tree) return [];
    const rows: { node: PipelineNode; depth: number }[] = [];
    const searchLower = search.toLowerCase();

    const matchesSearch = (node: PipelineNode): boolean => {
      if (!search) return true;
      if (node.name.toLowerCase().includes(searchLower)) return true;
      return node.children.some(matchesSearch);
    };

    const visit = (node: PipelineNode, depth: number) => {
      if (!matchesSearch(node)) return;
      rows.push({ node, depth });
      if (expandedIds.has(node.id)) {
        node.children.forEach((child) => visit(child, depth + 1));
      }
    };
    tree.stages.forEach((s) => visit(s, 0));
    return rows;
  }, [tree, expandedIds, search]);

  if (!tree) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <RiSearchLine className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <button
          className="text-xs text-primary hover:underline"
          onClick={expandAll}
        >
          Expand all
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          className="text-xs text-primary hover:underline"
          onClick={collapseAll}
        >
          Collapse all
        </button>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="min-w-[700px]">
          {/* Header */}
          <div className="flex items-center gap-2 py-2 px-3 text-xs font-medium text-muted-foreground border-b bg-muted/30 sticky top-0">
            <span style={{ width: "20px" }} />
            <span className="w-4" />
            <span className="flex-1">Name</span>
            <span className="w-14">Type</span>
            <span className="w-32">Category</span>
            <span className="w-20 text-right">Duration</span>
            <span className="w-24" />
          </div>

          {visibleRows.map(({ node, depth }) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={depth}
              expanded={expandedIds.has(node.id)}
              onToggle={toggle}
              onSelect={setSelectedNode}
              maxDurationMs={maxDurationMs}
              onAssign={setOverride}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Detail sheet */}
      <Sheet
        open={!!selectedNode}
        onOpenChange={(open) => !open && setSelectedNode(null)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="text-base truncate">
              {selectedNode?.name}
            </SheetTitle>
          </SheetHeader>
          {selectedNode && <NodeDetail node={selectedNode} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
