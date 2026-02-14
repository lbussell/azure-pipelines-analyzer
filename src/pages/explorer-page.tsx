import { useMemo } from "react";
import { useTimeline, useCategories } from "@/contexts";
import { computeAnalytics } from "@/lib/analytics";
import { GanttChart } from "@/components/gantt-chart";

export function ExplorerPage() {
  const { tree } = useTimeline();
  const { categories, getCategoryForNode } = useCategories();

  const analytics = useMemo(() => {
    if (!tree) return null;
    return computeAnalytics(tree, categories, getCategoryForNode);
  }, [tree, categories, getCategoryForNode]);

  if (!tree || !analytics) return null;

  return (
    <div className="flex flex-col">
      <GanttChart tree={tree} criticalPath={analytics.criticalPath} />
    </div>
  );
}
