import { useMemo } from "react";
import {
  RiTimeLine,
  RiServerLine,
  RiHourglassLine,
  RiStackLine,
  RiTaskLine,
  RiFlowChart,
  RiBarChartBoxLine,
} from "@remixicon/react";
import { Card, CardContent } from "@/components/ui/card";
import { useTimeline, useCategories } from "@/contexts";
import { computeAnalytics } from "@/lib/analytics";
import { formatDuration } from "@/lib/parser";
import { CategoryBreakdownChart } from "@/components/dashboard/category-chart";
import { ParallelismChart } from "@/components/dashboard/parallelism-chart";
import { CriticalPathTimeline } from "@/components/dashboard/critical-path-timeline";

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

export function DashboardPage() {
  const { tree } = useTimeline();
  const { categories, getCategoryForNode } = useCategories();

  const analytics = useMemo(() => {
    if (!tree) return null;
    return computeAnalytics(tree, categories, getCategoryForNode);
  }, [tree, categories, getCategoryForNode]);

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

      {/* Critical Path Timeline */}
      <CriticalPathTimeline criticalPath={analytics.criticalPath} tree={tree} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdownChart breakdown={analytics.categoryBreakdown} />
        <ParallelismChart series={analytics.parallelismSeries} />
      </div>
    </div>
  );
}
