import type {
  PipelineTree,
  PipelineNode,
  PipelineAnalytics,
  CriticalPathSegment,
  CategoryBreakdownItem,
  ParallelismDataPoint,
  Category,
} from "@/types";
import { collectNodes } from "./parser";

export function computeAnalytics(
  tree: PipelineTree,
  categories: Category[],
  getCategoryForNode: (node: PipelineNode) => string | null
): PipelineAnalytics {
  const jobs = collectNodes(tree.stages, "Job");
  const tasks = collectNodes(tree.stages, "Task");

  // Apply categories to all tasks
  for (const task of tasks) {
    task.categoryId = getCategoryForNode(task);
  }

  const totalMachineTimeMs = jobs.reduce((sum, j) => sum + j.durationMs, 0);
  const totalAgentWaitMs = computeAgentWaitTime(tree);
  const criticalPath = computeCriticalPath(tree);
  const criticalPathMs = criticalPath.reduce((s, seg) => s + seg.durationMs, 0);
  const categoryBreakdown = computeCategoryBreakdown(tasks, categories);
  const parallelismSeries = computeParallelism(jobs, tree.startTime);
  const maxParallelism = parallelismSeries.reduce(
    (max, p) => Math.max(max, p.activeAgents),
    0
  );
  const avgParallelism = computeAvgParallelism(parallelismSeries, tree.wallClockMs);

  return {
    wallClockMs: tree.wallClockMs,
    totalMachineTimeMs,
    totalAgentWaitMs,
    stageCount: tree.stages.length,
    jobCount: jobs.length,
    taskCount: tasks.length,
    criticalPath,
    criticalPathMs,
    categoryBreakdown,
    parallelismSeries,
    maxParallelism,
    avgParallelism,
  };
}

/** Compute time spent waiting for agents (gap between phase start and first job start) */
function computeAgentWaitTime(tree: PipelineTree): number {
  let totalWait = 0;
  const phases = collectNodes(tree.stages, "Phase");
  for (const phase of phases) {
    if (!phase.startTime) continue;
    const jobChildren = phase.children.filter((c) => c.type === "Job");
    for (const job of jobChildren) {
      if (job.startTime && phase.startTime) {
        const wait = job.startTime.getTime() - phase.startTime.getTime();
        if (wait > 0) totalWait += wait;
      }
    }
  }
  return totalWait;
}

/**
 * Compute the critical path — the longest sequential chain through the pipeline.
 * Stages run sequentially (ordered), jobs within a stage run in parallel,
 * so the critical path picks the longest job from each stage.
 */
function computeCriticalPath(tree: PipelineTree): CriticalPathSegment[] {
  const path: CriticalPathSegment[] = [];

  for (const stage of tree.stages) {
    // Find the longest job chain within this stage
    const jobs = collectNodes([stage], "Job");
    if (jobs.length === 0) continue;

    // The stage's contribution to the critical path is its own wall-clock duration
    // Find the job with the longest duration (it's the bottleneck)
    let longestJob: PipelineNode | null = null;
    let longestMs = 0;
    for (const job of jobs) {
      if (job.durationMs > longestMs) {
        longestMs = job.durationMs;
        longestJob = job;
      }
    }

    path.push({
      node: stage,
      durationMs: stage.durationMs,
    });

    if (longestJob) {
      path.push({
        node: longestJob,
        durationMs: longestJob.durationMs,
      });
    }
  }

  return path;
}

/** Compute time breakdown by category for tasks */
function computeCategoryBreakdown(
  tasks: PipelineNode[],
  categories: Category[]
): CategoryBreakdownItem[] {
  const catMap = new Map<string | null, { totalMs: number; count: number }>();

  for (const task of tasks) {
    const catId = task.categoryId;
    const existing = catMap.get(catId) ?? { totalMs: 0, count: 0 };
    existing.totalMs += task.durationMs;
    existing.count += 1;
    catMap.set(catId, existing);
  }

  const totalMs = tasks.reduce((sum, t) => sum + t.durationMs, 0);
  const categoryLookup = new Map(categories.map((c) => [c.id, c]));

  const items: CategoryBreakdownItem[] = [];
  for (const [catId, data] of catMap) {
    const cat = catId ? categoryLookup.get(catId) : undefined;
    items.push({
      categoryId: catId,
      categoryName: cat?.name ?? "Uncategorized",
      color: cat?.color ?? "#94a3b8",
      totalMs: data.totalMs,
      taskCount: data.count,
      percentage: totalMs > 0 ? (data.totalMs / totalMs) * 100 : 0,
    });
  }

  // Sort by totalMs descending
  items.sort((a, b) => b.totalMs - a.totalMs);
  return items;
}

/** Compute parallelism series: how many agents are active at each point in time */
function computeParallelism(
  jobs: PipelineNode[],
  pipelineStart: Date | null
): ParallelismDataPoint[] {
  if (!pipelineStart) return [];

  // Create events for job start/finish
  const events: { time: Date; delta: number; jobName: string }[] = [];
  for (const job of jobs) {
    if (job.startTime) events.push({ time: job.startTime, delta: 1, jobName: job.name });
    if (job.finishTime) events.push({ time: job.finishTime, delta: -1, jobName: job.name });
  }
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  const series: ParallelismDataPoint[] = [];
  const activeJobs = new Set<string>();
  let active = 0;

  for (const event of events) {
    // Add point just before change (for step chart)
    series.push({
      time: event.time,
      activeAgents: active,
      offsetMs: event.time.getTime() - pipelineStart.getTime(),
      activeJobNames: [...activeJobs],
    });

    if (event.delta > 0) {
      activeJobs.add(event.jobName);
    } else {
      activeJobs.delete(event.jobName);
    }
    active += event.delta;

    series.push({
      time: event.time,
      activeAgents: active,
      offsetMs: event.time.getTime() - pipelineStart.getTime(),
      activeJobNames: [...activeJobs],
    });
  }

  return series;
}

/** Compute average parallelism (weighted by time) */
function computeAvgParallelism(
  series: ParallelismDataPoint[],
  totalMs: number
): number {
  if (series.length < 2 || totalMs === 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < series.length - 1; i++) {
    const dt = series[i + 1].offsetMs - series[i].offsetMs;
    weightedSum += series[i].activeAgents * dt;
  }
  return weightedSum / totalMs;
}
