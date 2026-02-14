export type TimelineRecordType = string

export interface TimelineTaskMetadata {
  id?: string
  name?: string
  version?: string
}

export interface RawTimelineRecord {
  id: string
  parentId?: string | null
  type?: TimelineRecordType
  name?: string
  identifier?: string | null
  refName?: string | null
  order?: number
  startTime?: string
  finishTime?: string
  state?: string
  result?: string
  workerName?: string | null
  queueId?: number | null
  task?: TimelineTaskMetadata | null
  [key: string]: unknown
}

export interface RawTimeline {
  id?: string
  changeId?: number
  records: RawTimelineRecord[]
  [key: string]: unknown
}

export type DependencyReason = "parent-child" | "sibling-order"

export interface DependencyEdge {
  from: string
  to: string
  reason: DependencyReason
}

export interface TimelineNode {
  id: string
  parentId: string | null
  type: TimelineRecordType
  name: string
  identifier: string | null
  refName: string | null
  order: number | null
  startTime: Date | null
  finishTime: Date | null
  durationMs: number
  state: string | null
  result: string | null
  workerName: string | null
  queueId: number | null
  taskName: string | null
  taskId: string | null
  childIds: string[]
  depth: number
}

export interface TimelineGraph {
  nodes: TimelineNode[]
  nodesById: Record<string, TimelineNode>
  rootIds: string[]
  leafIds: string[]
  stageIds: string[]
  jobIds: string[]
  stepIds: string[]
  dependencyEdges: DependencyEdge[]
  incomingDepsById: Record<string, string[]>
  outgoingDepsById: Record<string, string[]>
  warnings: string[]
}

export interface RecordCounts {
  stages: number
  phases: number
  jobs: number
  steps: number
  tasks: number
  checkpoints: number
  total: number
}

export interface PipelineMetrics {
  endToEndDurationMs: number
  wallClockDurationMs: number
  totalStepRuntimeMs: number
  machineWaitDurationMs: number
  machineRunningDurationMs: number
  shortestNoWaitDurationMs: number
  recordCounts: RecordCounts
  dependencyCount: number
  dependencyBreakdown: Record<DependencyReason, number>
  jobWaitById: Record<string, number>
}

export interface CriticalPathResult {
  nodeIds: string[]
  durationMs: number
  explanation: string
}

export interface ParallelizationInsight {
  level: "info" | "warning" | "opportunity"
  message: string
}

export interface ParallelizationAnalysis {
  averageConcurrency: number
  maxConcurrency: number
  criticalPathRatio: number
  timelineCoverageRatio: number
  idleWallClockMs: number
  insights: ParallelizationInsight[]
}

export interface DurationBucket {
  id: string
  name: string
  type: TimelineRecordType
  durationMs: number
}

export interface TimelineAnalysis {
  graph: TimelineGraph
  metrics: PipelineMetrics
  criticalPath: CriticalPathResult
  parallelization: ParallelizationAnalysis
  topConsumers: {
    stages: DurationBucket[]
    jobs: DurationBucket[]
    steps: DurationBucket[]
  }
}
