import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiRoadMapLine } from "@remixicon/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CriticalPathSegment, PipelineTree } from "@/types";
import { formatDuration } from "@/lib/parser";

export function CriticalPathTimeline({
  criticalPath,
  tree,
}: {
  criticalPath: CriticalPathSegment[];
  tree: PipelineTree;
}) {
  const stageSegments = useMemo(
    () => criticalPath.filter((s) => s.node.type === "Stage"),
    [criticalPath]
  );

  const totalMs = tree.wallClockMs;
  const pipelineStart = tree.startTime?.getTime() ?? 0;

  // Compute actual idle time using a sweep-line approach
  const { totalWorkMs, totalIdleMs } = useMemo(() => {
    if (!tree.startTime || stageSegments.length === 0)
      return { totalWorkMs: 0, totalIdleMs: 0 };

    // Sort stages by start time
    const sorted = [...stageSegments]
      .filter((s) => s.node.startTime && s.node.finishTime)
      .sort(
        (a, b) =>
          a.node.startTime!.getTime() - b.node.startTime!.getTime()
      );

    let workMs = 0;
    let idleMs = 0;
    let lastEnd = pipelineStart;

    for (const seg of sorted) {
      const start = seg.node.startTime!.getTime();
      const end = seg.node.finishTime!.getTime();
      // Gap before this stage (only if it starts after the last end)
      if (start > lastEnd) {
        idleMs += start - lastEnd;
      }
      workMs += seg.durationMs;
      lastEnd = Math.max(lastEnd, end);
    }

    // Trailing gap
    if (tree.finishTime) {
      const trailingGap = tree.finishTime.getTime() - lastEnd;
      if (trailingGap > 1000) idleMs += trailingGap;
    }

    return { totalWorkMs: workMs, totalIdleMs: idleMs };
  }, [stageSegments, tree, pipelineStart]);

  if (stageSegments.length === 0 || totalMs <= 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RiRoadMapLine className="h-5 w-5" />
          Critical Path
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Stage Work: </span>
            <span className="font-bold">{formatDuration(totalWorkMs)}</span>
          </div>
          {totalIdleMs > 0 && (
            <div>
              <span className="text-muted-foreground">Idle Gaps: </span>
              <span className="font-bold text-amber-500">
                {formatDuration(totalIdleMs)}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Wall Clock: </span>
            <span className="font-bold">{formatDuration(totalMs)}</span>
          </div>
        </div>

        {/* Timeline bar — absolute positioning based on real times */}
        <div className="relative h-10 rounded-md overflow-hidden border bg-muted/20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 4px, oklch(0.7 0 0 / 0.08) 4px, oklch(0.7 0 0 / 0.08) 8px)",
          }}
        >
          {stageSegments.map((seg) => {
            if (!seg.node.startTime || !seg.node.finishTime) return null;
            const leftPct =
              ((seg.node.startTime.getTime() - pipelineStart) / totalMs) *
              100;
            const widthPct = (seg.durationMs / totalMs) * 100;
            if (widthPct < 0.2) return null;

            return (
              <Tooltip key={seg.node.id}>
                <TooltipTrigger
                  render={<div />}
                  className="absolute top-1 bottom-1 rounded-sm flex items-center justify-center overflow-hidden"
                  style={{
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, 0.5)}%`,
                    backgroundColor: "oklch(0.59 0.14 242)",
                  }}
                >
                  {widthPct > 6 && (
                    <span className="text-[10px] text-white truncate px-1">
                      {seg.node.name}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="text-xs">
                    <p className="font-medium">{seg.node.name}</p>
                    <p className="text-muted-foreground">
                      {formatDuration(seg.durationMs)}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-6 rounded-sm"
              style={{ backgroundColor: "oklch(0.59 0.14 242)" }}
            />
            Stage work
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-6 rounded-sm border"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 2px, oklch(0.7 0 0 / 0.15) 2px, oklch(0.7 0 0 / 0.15) 4px)",
              }}
            />
            Idle gap (no critical work)
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
