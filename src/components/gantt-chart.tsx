import { useState, useMemo, useRef, useCallback } from "react";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiTimeLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CategoryTagPopover } from "@/components/category-tag-popover";
import { useCategories } from "@/contexts";
import type { PipelineNode, PipelineTree, CriticalPathSegment } from "@/types";
import { formatDuration } from "@/lib/parser";

const ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 26;
const STAGE_HEADER_HEIGHT = 36;
const LABEL_WIDTH = 320;
const MIN_BAR_WIDTH = 2;

function ResultIcon({ result }: { result: string | null }) {
  const size = "h-3.5 w-3.5";
  switch (result) {
    case "succeeded":
      return <RiCheckLine className={`${size} text-emerald-500`} />;
    case "succeededWithIssues":
      return <RiErrorWarningLine className={`${size} text-amber-500`} />;
    case "failed":
      return <RiCloseLine className={`${size} text-destructive`} />;
    case "canceled":
    case "skipped":
      return <RiCloseLine className={`${size} text-muted-foreground`} />;
    default:
      return <RiTimeLine className={`${size} text-muted-foreground`} />;
  }
}

interface GanttRow {
  node: PipelineNode;
  type: "stage" | "job" | "task";
  depth: number;
}

function buildGanttRows(
  tree: PipelineTree,
  expandedStages: Set<string>,
  expandedJobs: Set<string>
): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const stage of tree.stages) {
    rows.push({ node: stage, type: "stage", depth: 0 });
    if (expandedStages.has(stage.id)) {
      // Phases are intermediate groupings — skip them and show jobs directly
      const jobs: PipelineNode[] = [];
      for (const child of stage.children) {
        if (child.type === "Phase") {
          jobs.push(...child.children.filter((c) => c.type === "Job"));
        } else if (child.type === "Job") {
          jobs.push(child);
        }
      }
      jobs.sort((a, b) => {
        const at = a.startTime?.getTime() ?? 0;
        const bt = b.startTime?.getTime() ?? 0;
        return at - bt;
      });
      for (const job of jobs) {
        rows.push({ node: job, type: "job", depth: 1 });
        if (expandedJobs.has(job.id)) {
          for (const task of job.children) {
            if (task.type === "Task") {
              rows.push({ node: task, type: "task", depth: 2 });
            }
          }
        }
      }
    }
  }
  return rows;
}

function timeToX(
  time: Date | null,
  pipelineStart: number,
  msPerPx: number
): number {
  if (!time) return 0;
  return (time.getTime() - pipelineStart) / msPerPx;
}

function barProps(
  node: PipelineNode,
  pipelineStart: number,
  msPerPx: number
): { left: number; width: number } {
  const left = timeToX(node.startTime, pipelineStart, msPerPx);
  const right = timeToX(node.finishTime, pipelineStart, msPerPx);
  return { left, width: Math.max(right - left, MIN_BAR_WIDTH) };
}

/** Generate nice time axis ticks */
function generateTicks(
  totalMs: number,
  _msPerPx: number,
  chartWidth: number
): { offsetMs: number; label: string }[] {
  if (totalMs <= 0 || chartWidth <= 0) return [];
  // Aim for ~8-12 ticks
  const targetTicks = 10;
  const rawInterval = totalMs / targetTicks;
  // Snap to nice intervals
  const niceIntervals = [
    1000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000,
    1800000, 3600000,
  ];
  const interval =
    niceIntervals.find((i) => i >= rawInterval) ??
    niceIntervals[niceIntervals.length - 1];
  const ticks: { offsetMs: number; label: string }[] = [];
  for (let ms = 0; ms <= totalMs; ms += interval) {
    ticks.push({ offsetMs: ms, label: formatDuration(ms) });
  }
  return ticks;
}

export function GanttChart({
  tree,
  criticalPath,
}: {
  tree: PipelineTree;
  criticalPath: CriticalPathSegment[];
}) {
  const { getCategoryForNode, getCategoryById } = useCategories();
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(
    () => new Set(tree.stages.map((s) => s.id))
  );
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const criticalNodeIds = useMemo(
    () => new Set(criticalPath.map((s) => s.node.id)),
    [criticalPath]
  );

  const toggleStage = useCallback((id: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleJob = useCallback((id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rows = useMemo(
    () => buildGanttRows(tree, expandedStages, expandedJobs),
    [tree, expandedStages, expandedJobs]
  );

  const pipelineStart = tree.startTime?.getTime() ?? 0;
  const totalMs = tree.wallClockMs;

  // Chart area width — use container or fallback
  const baseChartWidth = 900;
  const chartWidth = baseChartWidth * zoomLevel;
  const msPerPx = totalMs / chartWidth;

  const ticks = useMemo(
    () => generateTicks(totalMs, msPerPx, chartWidth),
    [totalMs, msPerPx, chartWidth]
  );

  const rowHeight = (row: GanttRow) =>
    row.type === "stage"
      ? STAGE_HEADER_HEIGHT
      : row.type === "task"
      ? TASK_ROW_HEIGHT
      : ROW_HEIGHT;

  // Compute y offsets for each row
  const rowYOffsets = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const row of rows) {
      offsets.push(y);
      y += rowHeight(row);
    }
    return offsets;
  }, [rows]);

  const totalHeight =
    rowYOffsets.length > 0
      ? rowYOffsets[rowYOffsets.length - 1] + rowHeight(rows[rows.length - 1])
      : 0;

  const zoomIn = () => setZoomLevel((z) => Math.min(z * 1.5, 8));
  const zoomOut = () => setZoomLevel((z) => Math.max(z / 1.5, 0.5));

  return (
    <div className="flex flex-col border rounded-lg bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <span className="text-sm font-medium flex-1">Pipeline Timeline</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={zoomOut}
        >
          <RiZoomOutLine className="h-3.5 w-3.5" />
        </Button>
        <span className="text-muted-foreground">
          {Math.round(zoomLevel * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={zoomIn}
        >
          <RiZoomInLine className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Gantt body */}
      <div className="flex overflow-hidden" ref={containerRef}>
        {/* Labels column */}
        <div
          className="shrink-0 border-r bg-card"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Time axis header placeholder */}
          <div className="h-6 border-b bg-muted/30" />
          {/* Row labels */}
          <div style={{ height: totalHeight }} className="relative">
            {rows.map((row, i) => {
              const y = rowYOffsets[i];
              const h = rowHeight(row);
              const isStage = row.type === "stage";
              const isJob = row.type === "job";
              const isTask = row.type === "task";
              const isExpanded = isStage
                ? expandedStages.has(row.node.id)
                : isJob
                ? expandedJobs.has(row.node.id)
                : false;
              const hasChildren = isStage || (isJob && row.node.children.some(c => c.type === "Task"));
              const catId = isTask ? getCategoryForNode(row.node) : null;
              const cat = getCategoryById(catId);

              return (
                <div
                  key={row.node.id}
                  className={`absolute flex items-center gap-1 pr-2 text-sm border-b border-border/30 ${
                    hoveredRow === row.node.id ? "bg-muted/50" : ""
                  } ${isStage ? "bg-muted/20 font-medium" : ""}`}
                  style={{
                    top: y,
                    height: h,
                    width: LABEL_WIDTH,
                    paddingLeft: isStage ? 8 : isJob ? 20 : 36,
                  }}
                  onMouseEnter={() => setHoveredRow(row.node.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Expand toggle */}
                  {hasChildren ? (
                    <button
                      className="shrink-0 w-4 h-4 flex items-center justify-center"
                      onClick={() =>
                        isStage
                          ? toggleStage(row.node.id)
                          : toggleJob(row.node.id)
                      }
                    >
                      {isExpanded ? (
                        <RiArrowDownSLine className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <RiArrowRightSLine className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <ResultIcon result={row.node.result} />
                  <span className="flex-1 truncate">{row.node.name}</span>
                  {isTask && cat && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  {isTask && <CategoryTagPopover node={row.node} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart area (scrollable) */}
        <div className="flex-1 overflow-x-auto">
          {/* Time axis */}
          <div
            className="h-6 border-b bg-muted/30 relative"
            style={{ width: chartWidth }}
          >
            {ticks.map((tick) => {
              const x = tick.offsetMs / msPerPx;
              return (
                <div
                  key={tick.offsetMs}
                  className="absolute top-0 h-full flex items-end pb-0.5"
                  style={{ left: x }}
                >
                  <span className="text-muted-foreground whitespace-nowrap pl-1">
                    {tick.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bars */}
          <div
            className="relative"
            style={{ width: chartWidth, height: totalHeight }}
          >
            {/* Vertical grid lines */}
            {ticks.map((tick) => {
              const x = tick.offsetMs / msPerPx;
              return (
                <div
                  key={`grid-${tick.offsetMs}`}
                  className="absolute top-0 w-px bg-border/30"
                  style={{ left: x, height: totalHeight }}
                />
              );
            })}

            {/* Row backgrounds and bars */}
            {rows.map((row, i) => {
              const y = rowYOffsets[i];
              const h = rowHeight(row);
              const isStage = row.type === "stage";
              const isTask = row.type === "task";
              const isCritical = criticalNodeIds.has(row.node.id);
              const catId =
                isTask || row.type === "job"
                  ? getCategoryForNode(row.node)
                  : null;
              const cat = getCategoryById(catId);
              const { left, width } = barProps(
                row.node,
                pipelineStart,
                msPerPx
              );

              const barColor = cat?.color ?? (isStage ? "oklch(0.59 0.14 242)" : "oklch(0.59 0.14 242 / 0.6)");
              const barHeight = isStage ? 6 : isTask ? 12 : 18;
              const barTop = (h - barHeight) / 2;

              return (
                <div
                  key={row.node.id}
                  className={`absolute border-b border-border/30 ${
                    hoveredRow === row.node.id ? "bg-muted/30" : ""
                  } ${isStage ? "bg-muted/10" : ""}`}
                  style={{ top: y, height: h, width: chartWidth }}
                  onMouseEnter={() => setHoveredRow(row.node.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* The bar */}
                  <Tooltip>
                    <TooltipTrigger
                      render={<div />}
                      className={`absolute rounded-sm cursor-pointer transition-opacity ${
                        isCritical
                          ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-background"
                          : ""
                      }`}
                      style={{
                        left,
                        top: barTop,
                        width,
                        height: barHeight,
                        backgroundColor: barColor,
                        opacity:
                          hoveredRow === row.node.id ? 1 : isTask ? 0.8 : 0.9,
                      }}
                      onClick={() => {
                        if (isStage) toggleStage(row.node.id);
                        else if (row.type === "job") toggleJob(row.node.id);
                      }}
                    />
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-0.5">
                        <p className="font-medium">{row.node.name}</p>
                        <p className="text-muted-foreground">
                          {formatDuration(row.node.durationMs)}
                          {row.node.workerName &&
                            ` · ${row.node.workerName}`}
                        </p>
                        {cat && (
                          <p className="flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </p>
                        )}
                        {isCritical && (
                          <Badge
                            variant="secondary"
                            className="h-4 px-1 mt-0.5"
                          >
                            Critical Path
                          </Badge>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>

                  {/* Inline label for wide enough bars */}
                  {width > 60 && !isStage && (
                    <span
                      className="absolute text-[10px] text-white truncate pointer-events-none"
                      style={{
                        left: left + 4,
                        top: barTop + 1,
                        maxWidth: width - 8,
                        lineHeight: `${barHeight - 2}px`,
                      }}
                    >
                      {row.node.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
