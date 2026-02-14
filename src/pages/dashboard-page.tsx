import { useMemo } from "react";
import {
  RiTimeLine,
  RiServerLine,
  RiHourglassLine,
  RiRoadMapLine,
  RiStackLine,
  RiTaskLine,
  RiFlowChart,
  RiBarChartBoxLine,
} from "@remixicon/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTimeline, useCategories } from "@/contexts";
import { computeAnalytics } from "@/lib/analytics";
import { formatDuration } from "@/lib/parser";
import { collectNodes } from "@/lib/parser";
import type { PipelineAnalytics, PipelineNode } from "@/types";
import { CategoryBreakdownChart } from "@/components/dashboard/category-chart";
import { ParallelismChart } from "@/components/dashboard/parallelism-chart";
import { TopItemsTable } from "@/components/dashboard/top-items-table";

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CriticalPathCard({
  analytics,
}: {
  analytics: PipelineAnalytics;
}) {
  const stageSegments = analytics.criticalPath.filter(
    (s) => s.node.type === "Stage"
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RiRoadMapLine className="h-5 w-5" />
          Critical Path
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Total: <span className="font-bold text-foreground">{formatDuration(analytics.criticalPathMs)}</span>
          {" "}— The longest sequential chain through the pipeline.
        </p>
        <div className="space-y-1.5">
          {stageSegments.map((seg) => (
            <div key={seg.node.id} className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-primary"
                style={{
                  width: `${Math.max(
                    (seg.durationMs / analytics.criticalPathMs) * 100,
                    2
                  )}%`,
                }}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {seg.node.name}
              </span>
              <span className="text-xs font-medium ml-auto whitespace-nowrap">
                {formatDuration(seg.durationMs)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { tree } = useTimeline();
  const { categories, getCategoryForNode } = useCategories();

  const analytics = useMemo(() => {
    if (!tree) return null;
    return computeAnalytics(tree, categories, getCategoryForNode);
  }, [tree, categories, getCategoryForNode]);

  const topJobs = useMemo((): PipelineNode[] => {
    if (!tree) return [];
    return collectNodes(tree.stages, "Job")
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);
  }, [tree]);

  if (!tree || !analytics) return null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          Pipeline build analysis overview
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={RiTimeLine}
          label="Wall-Clock Time"
          value={formatDuration(analytics.wallClockMs)}
          subtitle="Total elapsed time"
        />
        <MetricCard
          icon={RiServerLine}
          label="Machine Time"
          value={formatDuration(analytics.totalMachineTimeMs)}
          subtitle={`Across ${analytics.jobCount} jobs`}
        />
        <MetricCard
          icon={RiHourglassLine}
          label="Agent Wait Time"
          value={formatDuration(analytics.totalAgentWaitMs)}
          subtitle="Time waiting for agents"
        />
        <MetricCard
          icon={RiFlowChart}
          label="Max Parallelism"
          value={`${analytics.maxParallelism}`}
          subtitle={`Avg: ${analytics.avgParallelism.toFixed(1)} agents`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={RiStackLine}
          label="Stages"
          value={`${analytics.stageCount}`}
        />
        <MetricCard
          icon={RiBarChartBoxLine}
          label="Jobs"
          value={`${analytics.jobCount}`}
        />
        <MetricCard
          icon={RiTaskLine}
          label="Tasks"
          value={`${analytics.taskCount}`}
        />
      </div>

      {/* Critical Path */}
      <CriticalPathCard analytics={analytics} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdownChart breakdown={analytics.categoryBreakdown} />
        <ParallelismChart series={analytics.parallelismSeries} />
      </div>

      {/* Top Jobs */}
      <TopItemsTable jobs={topJobs} />
    </div>
  );
}
