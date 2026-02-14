import type {
  TimelineData,
  TimelineRecord,
  PipelineNode,
  PipelineTree,
  RecordType,
} from "@/types";

const TREE_TYPES: Set<string> = new Set([
  "Stage",
  "Phase",
  "Job",
  "Task",
]);

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function computeDurationMs(
  start: Date | null,
  finish: Date | null
): number {
  if (!start || !finish) return 0;
  return Math.max(0, finish.getTime() - start.getTime());
}

function toNode(record: TimelineRecord): PipelineNode {
  const start = parseDate(record.startTime);
  const finish = parseDate(record.finishTime);
  return {
    id: record.id,
    parentId: record.parentId,
    type: record.type,
    name: record.name,
    startTime: start,
    finishTime: finish,
    durationMs: computeDurationMs(start, finish),
    state: record.state,
    result: record.result,
    workerName: record.workerName,
    order: record.order,
    errorCount: record.errorCount,
    warningCount: record.warningCount,
    taskReference: record.task,
    children: [],
    categoryId: null,
    manualCategory: false,
    raw: record,
  };
}

export function parseTimeline(data: TimelineData): PipelineTree {
  // Filter to tree-relevant record types
  const relevantRecords = data.records.filter((r) =>
    TREE_TYPES.has(r.type)
  );

  // Create nodes
  const nodesById = new Map<string, PipelineNode>();
  for (const record of relevantRecords) {
    nodesById.set(record.id, toNode(record));
  }

  // Build parent-child relationships
  const stages: PipelineNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else if (node.type === "Stage") {
      stages.push(node);
    }
  }

  // Sort children by order
  const sortChildren = (node: PipelineNode) => {
    node.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    node.children.forEach(sortChildren);
  };
  stages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  stages.forEach(sortChildren);

  // Compute pipeline-level times
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const node of nodesById.values()) {
    if (node.startTime && (!earliest || node.startTime < earliest)) {
      earliest = node.startTime;
    }
    if (node.finishTime && (!latest || node.finishTime > latest)) {
      latest = node.finishTime;
    }
  }

  return {
    stages,
    nodesById,
    startTime: earliest,
    finishTime: latest,
    wallClockMs: computeDurationMs(earliest, latest),
  };
}

/** Recursively collect all nodes of a given type */
export function collectNodes(
  roots: PipelineNode[],
  type?: RecordType
): PipelineNode[] {
  const result: PipelineNode[] = [];
  const visit = (node: PipelineNode) => {
    if (!type || node.type === type) result.push(node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return result;
}

/** Get all leaf tasks under a node */
export function getTasksUnder(node: PipelineNode): PipelineNode[] {
  return collectNodes([node], "Task");
}

/** Format duration in ms to human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Format duration as a shorter string for compact displays */
export function formatDurationShort(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
