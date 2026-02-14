/** Raw Azure DevOps Timeline API types */

export interface TimelineData {
  records: TimelineRecord[];
  lastChangedBy: string;
  lastChangedOn: string;
  id: string;
  changeId: number;
  url: string;
}

export interface TimelineRecord {
  previousAttempts: unknown[];
  id: string;
  parentId: string | null;
  type: RecordType;
  name: string;
  refName?: string;
  startTime: string | null;
  finishTime: string | null;
  currentOperation: string | null;
  percentComplete: number | null;
  state: RecordState;
  result: RecordResult | null;
  resultCode: string | null;
  changeId: number;
  lastModified: string;
  workerName: string | null;
  details: unknown | null;
  errorCount: number;
  warningCount: number;
  url: string | null;
  log: { id: number; type: string; url: string } | null;
  task: { id: string; name: string; version: string } | null;
  attempt: number;
  identifier: string | null;
  order: number | null;
}

export type RecordType =
  | "Stage"
  | "Phase"
  | "Job"
  | "Task"
  | "Checkpoint"
  | "Checkpoint.ProductionReadinessCheck";

export type RecordState = "completed" | "inProgress" | "pending";

export type RecordResult =
  | "succeeded"
  | "succeededWithIssues"
  | "failed"
  | "canceled"
  | "skipped"
  | "abandoned";

/** Parsed / enriched tree model */

export interface PipelineNode {
  id: string;
  parentId: string | null;
  type: RecordType;
  name: string;
  startTime: Date | null;
  finishTime: Date | null;
  durationMs: number;
  state: RecordState;
  result: RecordResult | null;
  workerName: string | null;
  order: number | null;
  errorCount: number;
  warningCount: number;
  taskReference: { id: string; name: string; version: string } | null;
  children: PipelineNode[];
  /** Category assigned by rules or manual override */
  categoryId: string | null;
  /** If true, the category was set manually (overrides rules) */
  manualCategory: boolean;
  /** Original raw record for reference */
  raw: TimelineRecord;
}

export interface PipelineTree {
  /** Top-level stage nodes */
  stages: PipelineNode[];
  /** All nodes indexed by id for quick lookup */
  nodesById: Map<string, PipelineNode>;
  /** Pipeline wall-clock start */
  startTime: Date | null;
  /** Pipeline wall-clock end */
  finishTime: Date | null;
  /** Total wall-clock duration in ms */
  wallClockMs: number;
}

/** Categorization system */

export interface Category {
  id: string;
  name: string;
  color: string;
}

export type RuleMatchType = "contains" | "regex" | "exact" | "startsWith";

export interface CategorizationRule {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  categoryId: string;
  /** Lower number = higher priority (checked first) */
  priority: number;
}

/** Analytics types */

export interface PipelineAnalytics {
  wallClockMs: number;
  totalMachineTimeMs: number;
  totalAgentWaitMs: number;
  stageCount: number;
  jobCount: number;
  taskCount: number;
  criticalPath: CriticalPathSegment[];
  criticalPathMs: number;
  categoryBreakdown: CategoryBreakdownItem[];
  parallelismSeries: ParallelismDataPoint[];
  maxParallelism: number;
  avgParallelism: number;
}

export interface CriticalPathSegment {
  node: PipelineNode;
  durationMs: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  color: string;
  totalMs: number;
  taskCount: number;
  percentage: number;
}

export interface ParallelismDataPoint {
  time: Date;
  activeAgents: number;
  /** ms offset from pipeline start for charting */
  offsetMs: number;
}
