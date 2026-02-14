import type {
  CriticalPathResult,
  DependencyEdge,
  DependencyReason,
  DurationBucket,
  PipelineMetrics,
  RawTimeline,
  RawTimelineRecord,
  TimelineAnalysis,
  TimelineGraph,
  TimelineNode,
  TimelineRecordType,
} from "@/types/timeline"

const CHECKPOINT_PREFIX = "Checkpoint."

interface TimedActivity {
  id: string
  startMs: number
  finishMs: number
  durationMs: number
}

interface RangeSummary {
  minStartMs: number
  maxFinishMs: number
}

export function isStepLikeType(type: TimelineRecordType): boolean {
  return type === "Task" || type === "Checkpoint" || type.startsWith(CHECKPOINT_PREFIX)
}

export function isStepLikeNode(node: Pick<TimelineNode, "type">): boolean {
  return isStepLikeType(node.type)
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0s"
  }

  const totalSeconds = Math.round(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export function collectDescendantIds(
  graph: TimelineGraph,
  rootId: string,
  predicate?: (node: TimelineNode) => boolean
): string[] {
  const results: string[] = []
  const stack = [...(graph.nodesById[rootId]?.childIds ?? [])]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const nextId = stack.pop()
    if (!nextId || visited.has(nextId)) {
      continue
    }
    visited.add(nextId)

    const node = graph.nodesById[nextId]
    if (!node) {
      continue
    }

    if (!predicate || predicate(node)) {
      results.push(node.id)
    }

    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      stack.push(node.childIds[index])
    }
  }

  return results
}

export function analyzeTimeline(rawInput: unknown): TimelineAnalysis {
  const timeline = ensureRawTimeline(rawInput)
  const graph = normalizeTimeline(timeline)

  const stepActivityIds = graph.stepIds.length > 0 ? graph.stepIds : graph.leafIds
  const stepActivities = buildTimedActivities(graph.nodesById, stepActivityIds)
  const fallbackActivities =
    stepActivities.length > 0 ? stepActivities : buildTimedActivities(graph.nodesById, graph.jobIds)
  const criticalPath = computeCriticalPath(fallbackActivities)
  const metrics = computePipelineMetrics(graph)

  const parallelization = computeParallelization(
    fallbackActivities,
    metrics.wallClockDurationMs,
    criticalPath.durationMs,
    metrics.machineWaitDurationMs
  )

  return {
    graph,
    metrics,
    criticalPath,
    parallelization,
    topConsumers: {
      stages: topDurationBuckets(graph, graph.stageIds),
      jobs: topDurationBuckets(graph, graph.jobIds),
      steps: topDurationBuckets(graph, graph.stepIds),
    },
  }
}

function ensureRawTimeline(rawInput: unknown): RawTimeline {
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("Timeline payload must be a JSON object.")
  }

  const candidate = rawInput as Partial<RawTimeline>
  if (!Array.isArray(candidate.records)) {
    throw new Error("Timeline payload must include a records array.")
  }

  return candidate as RawTimeline
}

function normalizeTimeline(timeline: RawTimeline): TimelineGraph {
  const warnings: string[] = []
  const nodesById: Record<string, TimelineNode> = {}

  for (const record of timeline.records) {
    const normalized = normalizeRecord(record)
    if (!normalized) {
      warnings.push("Skipped a timeline record without a valid id.")
      continue
    }

    if (nodesById[normalized.id]) {
      warnings.push(`Skipped duplicate timeline record id '${normalized.id}'.`)
      continue
    }

    nodesById[normalized.id] = normalized
  }

  for (const node of Object.values(nodesById)) {
    if (!node.parentId) {
      continue
    }

    const parent = nodesById[node.parentId]
    if (!parent) {
      warnings.push(`Record '${node.id}' references missing parent '${node.parentId}'.`)
      node.parentId = null
      continue
    }

    parent.childIds.push(node.id)
  }

  for (const node of Object.values(nodesById)) {
    node.childIds.sort((leftId, rightId) => {
      const left = nodesById[leftId]
      const right = nodesById[rightId]
      return compareNodes(left, right)
    })
  }

  const rootIds = Object.values(nodesById)
    .filter((node) => node.parentId === null)
    .sort(compareNodes)
    .map((node) => node.id)

  assignDepths(nodesById, rootIds, warnings)

  const nodes = Object.values(nodesById).sort(compareNodes)
  const leafIds = nodes.filter((node) => node.childIds.length === 0).map((node) => node.id)
  const stageIds = nodes.filter((node) => node.type === "Stage").map((node) => node.id)
  const jobIds = nodes.filter((node) => node.type === "Job").map((node) => node.id)
  const stepIds = nodes.filter((node) => isStepLikeNode(node)).map((node) => node.id)
  const dependencyEdges = buildDependencyEdges(nodesById)
  const [incomingDepsById, outgoingDepsById] = buildDependencyLookup(nodesById, dependencyEdges)

  return {
    nodes,
    nodesById,
    rootIds,
    leafIds,
    stageIds,
    jobIds,
    stepIds,
    dependencyEdges,
    incomingDepsById,
    outgoingDepsById,
    warnings,
  }
}

function normalizeRecord(record: RawTimelineRecord): TimelineNode | null {
  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    return null
  }

  const startTime = parseTimelineDate(record.startTime)
  const finishTime = parseTimelineDate(record.finishTime)
  const durationMs = computeDuration(startTime, finishTime)
  const taskMetadata = parseTaskMetadata(record.task)

  return {
    id: record.id,
    parentId: typeof record.parentId === "string" && record.parentId.length > 0 ? record.parentId : null,
    type: typeof record.type === "string" && record.type.length > 0 ? record.type : "Unknown",
    name: typeof record.name === "string" && record.name.length > 0 ? record.name : record.id,
    identifier: toStringOrNull(record.identifier),
    refName: toStringOrNull(record.refName),
    order: toFiniteNumber(record.order),
    startTime,
    finishTime,
    durationMs,
    state: toStringOrNull(record.state),
    result: toStringOrNull(record.result),
    workerName: toStringOrNull(record.workerName),
    queueId: toFiniteNumber(record.queueId),
    taskName: taskMetadata.name,
    taskId: taskMetadata.id,
    childIds: [],
    depth: 0,
  }
}

function parseTaskMetadata(value: unknown): { id: string | null; name: string | null } {
  if (!value || typeof value !== "object") {
    return { id: null, name: null }
  }

  const taskValue = value as { id?: unknown; name?: unknown }
  return {
    id: toStringOrNull(taskValue.id),
    name: toStringOrNull(taskValue.name),
  }
}

function parseTimelineDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null
  }

  const fractionalMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d+)Z$/.exec(value)
  const normalized = fractionalMatch
    ? `${fractionalMatch[1]}.${fractionalMatch[2].slice(0, 3).padEnd(3, "0")}Z`
    : value
  const timestamp = Date.parse(normalized)

  if (Number.isNaN(timestamp)) {
    return null
  }

  return new Date(timestamp)
}

function computeDuration(startTime: Date | null, finishTime: Date | null): number {
  if (!startTime || !finishTime) {
    return 0
  }
  return Math.max(0, finishTime.getTime() - startTime.getTime())
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function compareNodes(left: TimelineNode, right: TimelineNode): number {
  if (left.order !== null && right.order !== null && left.order !== right.order) {
    return left.order - right.order
  }

  const leftStart = left.startTime?.getTime() ?? Number.POSITIVE_INFINITY
  const rightStart = right.startTime?.getTime() ?? Number.POSITIVE_INFINITY
  if (leftStart !== rightStart) {
    return leftStart - rightStart
  }

  const leftFinish = left.finishTime?.getTime() ?? Number.POSITIVE_INFINITY
  const rightFinish = right.finishTime?.getTime() ?? Number.POSITIVE_INFINITY
  if (leftFinish !== rightFinish) {
    return leftFinish - rightFinish
  }

  return left.name.localeCompare(right.name)
}

function assignDepths(
  nodesById: Record<string, TimelineNode>,
  rootIds: string[],
  warnings: string[]
): void {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  const dfs = (nodeId: string, depth: number): void => {
    const node = nodesById[nodeId]
    if (!node) {
      return
    }
    if (inStack.has(nodeId)) {
      warnings.push(`Detected cycle at '${nodeId}'.`)
      return
    }
    if (visited.has(nodeId)) {
      node.depth = Math.min(node.depth, depth)
      return
    }

    visited.add(nodeId)
    inStack.add(nodeId)
    node.depth = depth
    for (const childId of node.childIds) {
      dfs(childId, depth + 1)
    }
    inStack.delete(nodeId)
  }

  for (const rootId of rootIds) {
    dfs(rootId, 0)
  }

  for (const node of Object.values(nodesById)) {
    if (visited.has(node.id)) {
      continue
    }
    warnings.push(`Reached disconnected node '${node.id}' from fallback traversal.`)
    dfs(node.id, 0)
  }
}

function buildDependencyEdges(nodesById: Record<string, TimelineNode>): DependencyEdge[] {
  const dedupe = new Set<string>()
  const edges: DependencyEdge[] = []

  const addEdge = (from: string, to: string, reason: DependencyReason): void => {
    if (from === to) {
      return
    }
    const key = `${from}->${to}`
    if (dedupe.has(key)) {
      return
    }
    dedupe.add(key)
    edges.push({ from, to, reason })
  }

  for (const node of Object.values(nodesById)) {
    for (const childId of node.childIds) {
      addEdge(node.id, childId, "parent-child")
    }

    for (let index = 0; index < node.childIds.length - 1; index += 1) {
      const current = nodesById[node.childIds[index]]
      const next = nodesById[node.childIds[index + 1]]
      if (!current || !next) {
        continue
      }
      if (!shouldAddSequentialEdge(current, next)) {
        continue
      }
      addEdge(current.id, next.id, "sibling-order")
    }
  }

  return edges
}

function shouldAddSequentialEdge(left: TimelineNode, right: TimelineNode): boolean {
  if (left.finishTime && right.startTime) {
    return left.finishTime.getTime() <= right.startTime.getTime()
  }
  if (left.order !== null && right.order !== null) {
    return left.order < right.order
  }
  return true
}

function buildDependencyLookup(
  nodesById: Record<string, TimelineNode>,
  edges: DependencyEdge[]
): [Record<string, string[]>, Record<string, string[]>] {
  const incoming: Record<string, string[]> = {}
  const outgoing: Record<string, string[]> = {}

  for (const nodeId of Object.keys(nodesById)) {
    incoming[nodeId] = []
    outgoing[nodeId] = []
  }

  for (const edge of edges) {
    incoming[edge.to]?.push(edge.from)
    outgoing[edge.from]?.push(edge.to)
  }

  return [incoming, outgoing]
}

function buildTimedActivities(nodesById: Record<string, TimelineNode>, ids: string[]): TimedActivity[] {
  const activities: TimedActivity[] = []

  for (const id of ids) {
    const node = nodesById[id]
    if (!node || !node.startTime || !node.finishTime || node.durationMs <= 0) {
      continue
    }

    activities.push({
      id: node.id,
      startMs: node.startTime.getTime(),
      finishMs: node.finishTime.getTime(),
      durationMs: node.durationMs,
    })
  }

  return activities
}

function computeCriticalPath(activities: TimedActivity[]): CriticalPathResult {
  if (activities.length === 0) {
    return {
      nodeIds: [],
      durationMs: 0,
      explanation: "No timed records were available for critical-path inference.",
    }
  }

  const ordered = [...activities].sort((left, right) => {
    if (left.finishMs !== right.finishMs) {
      return left.finishMs - right.finishMs
    }
    return left.startMs - right.startMs
  })

  const finishTimes = ordered.map((activity) => activity.finishMs)
  const previousIndexes = ordered.map((activity, index) => {
    let low = 0
    let high = index - 1
    let answer = -1

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (finishTimes[middle] <= activity.startMs) {
        answer = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    return answer
  })

  const best: number[] = new Array(ordered.length + 1).fill(0)
  const choose: boolean[] = new Array(ordered.length + 1).fill(false)

  for (let index = 1; index <= ordered.length; index += 1) {
    const activity = ordered[index - 1]
    const includeValue = activity.durationMs + best[previousIndexes[index - 1] + 1]
    const excludeValue = best[index - 1]

    if (includeValue >= excludeValue) {
      best[index] = includeValue
      choose[index] = true
    } else {
      best[index] = excludeValue
    }
  }

  const pathIds: string[] = []
  let index = ordered.length
  while (index > 0) {
    if (choose[index]) {
      const activity = ordered[index - 1]
      pathIds.push(activity.id)
      index = previousIndexes[index - 1] + 1
    } else {
      index -= 1
    }
  }
  pathIds.reverse()

  return {
    nodeIds: pathIds,
    durationMs: best[ordered.length],
    explanation:
      "Critical path is inferred as the longest non-overlapping chain of timed execution records.",
  }
}

function computePipelineMetrics(graph: TimelineGraph): PipelineMetrics {
  const timedNodes = graph.nodes.filter((node) => node.startTime && node.finishTime)
  const range = findTimelineRange(timedNodes)
  const wallClockDurationMs =
    range === null ? 0 : Math.max(0, range.maxFinishMs - range.minStartMs)
  const totalStepRuntimeMs = graph.stepIds.reduce((total, nodeId) => {
    const node = graph.nodesById[nodeId]
    return total + (node?.durationMs ?? 0)
  }, 0)

  const jobWaitById = computeJobWaits(graph)
  const machineWaitDurationMs = Object.values(jobWaitById).reduce((total, value) => total + value, 0)
  const machineRunningDurationMs = graph.jobIds.reduce((total, nodeId) => {
    const node = graph.nodesById[nodeId]
    return total + (node?.durationMs ?? 0)
  }, 0)
  const shortestNoWaitDurationMs = computeNoWaitWallClock(graph, jobWaitById)

  const tasks = graph.nodes.filter((node) => node.type === "Task").length
  const checkpoints = graph.nodes.filter(
    (node) => node.type === "Checkpoint" || node.type.startsWith(CHECKPOINT_PREFIX)
  ).length
  const phases = graph.nodes.filter((node) => node.type === "Phase").length

  return {
    endToEndDurationMs: wallClockDurationMs,
    wallClockDurationMs,
    totalStepRuntimeMs,
    machineWaitDurationMs,
    machineRunningDurationMs,
    shortestNoWaitDurationMs,
    recordCounts: {
      stages: graph.stageIds.length,
      phases,
      jobs: graph.jobIds.length,
      steps: graph.stepIds.length,
      tasks,
      checkpoints,
      total: graph.nodes.length,
    },
    dependencyCount: graph.dependencyEdges.length,
    dependencyBreakdown: {
      "parent-child": graph.dependencyEdges.filter((edge) => edge.reason === "parent-child").length,
      "sibling-order": graph.dependencyEdges.filter((edge) => edge.reason === "sibling-order").length,
    },
    jobWaitById,
  }
}

function computeJobWaits(graph: TimelineGraph): Record<string, number> {
  const waitsByJobId: Record<string, number> = {}

  for (const jobId of graph.jobIds) {
    const job = graph.nodesById[jobId]
    if (!job || !job.startTime) {
      waitsByJobId[jobId] = 0
      continue
    }

    const stepStart = findEarliestDescendantStepStart(graph, jobId)
    if (stepStart === null) {
      waitsByJobId[jobId] = 0
      continue
    }

    waitsByJobId[jobId] = Math.max(0, stepStart - job.startTime.getTime())
  }

  return waitsByJobId
}

function findEarliestDescendantStepStart(graph: TimelineGraph, rootId: string): number | null {
  const stack = [...(graph.nodesById[rootId]?.childIds ?? [])]
  const visited = new Set<string>()
  let earliest: number | null = null

  while (stack.length > 0) {
    const nextId = stack.pop()
    if (!nextId || visited.has(nextId)) {
      continue
    }
    visited.add(nextId)

    const node = graph.nodesById[nextId]
    if (!node) {
      continue
    }

    if (isStepLikeNode(node) && node.startTime) {
      const timestamp = node.startTime.getTime()
      earliest = earliest === null ? timestamp : Math.min(earliest, timestamp)
    }

    for (const childId of node.childIds) {
      stack.push(childId)
    }
  }

  return earliest
}

function computeNoWaitWallClock(graph: TimelineGraph, jobWaitById: Record<string, number>): number {
  let minAdjustedStart = Number.POSITIVE_INFINITY
  let maxAdjustedFinish = Number.NEGATIVE_INFINITY

  for (const jobId of graph.jobIds) {
    const job = graph.nodesById[jobId]
    if (!job || !job.startTime || !job.finishTime) {
      continue
    }

    const waitMs = jobWaitById[jobId] ?? 0
    const adjustedStart = job.startTime.getTime() - waitMs
    const adjustedFinish = job.finishTime.getTime() - waitMs
    minAdjustedStart = Math.min(minAdjustedStart, adjustedStart)
    maxAdjustedFinish = Math.max(maxAdjustedFinish, adjustedFinish)
  }

  if (!Number.isFinite(minAdjustedStart) || !Number.isFinite(maxAdjustedFinish)) {
    return 0
  }

  return Math.max(0, maxAdjustedFinish - minAdjustedStart)
}

function findTimelineRange(nodes: TimelineNode[]): RangeSummary | null {
  let minStartMs = Number.POSITIVE_INFINITY
  let maxFinishMs = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    if (!node.startTime || !node.finishTime) {
      continue
    }
    minStartMs = Math.min(minStartMs, node.startTime.getTime())
    maxFinishMs = Math.max(maxFinishMs, node.finishTime.getTime())
  }

  if (!Number.isFinite(minStartMs) || !Number.isFinite(maxFinishMs)) {
    return null
  }

  return { minStartMs, maxFinishMs }
}

function computeParallelization(
  activities: TimedActivity[],
  wallClockDurationMs: number,
  criticalPathDurationMs: number,
  machineWaitDurationMs: number
) {
  if (activities.length === 0 || wallClockDurationMs <= 0) {
    return {
      averageConcurrency: 0,
      maxConcurrency: 0,
      criticalPathRatio: 0,
      timelineCoverageRatio: 0,
      idleWallClockMs: 0,
      insights: [{ level: "info" as const, message: "Not enough timed data for parallelization insights." }],
    }
  }

  const totalRuntimeMs = activities.reduce((total, activity) => total + activity.durationMs, 0)
  const averageConcurrency = totalRuntimeMs / wallClockDurationMs
  const coverage = computeCoverageAndConcurrency(activities)
  const idleWallClockMs = Math.max(0, wallClockDurationMs - coverage.coveredMs)
  const criticalPathRatio =
    wallClockDurationMs > 0 ? Math.min(1, criticalPathDurationMs / wallClockDurationMs) : 0
  const timelineCoverageRatio =
    wallClockDurationMs > 0 ? Math.min(1, coverage.coveredMs / wallClockDurationMs) : 0

  const insights = buildParallelizationInsights(
    averageConcurrency,
    criticalPathRatio,
    timelineCoverageRatio,
    idleWallClockMs,
    wallClockDurationMs,
    machineWaitDurationMs
  )

  return {
    averageConcurrency,
    maxConcurrency: coverage.maxConcurrency,
    criticalPathRatio,
    timelineCoverageRatio,
    idleWallClockMs,
    insights,
  }
}

function computeCoverageAndConcurrency(activities: TimedActivity[]): {
  coveredMs: number
  maxConcurrency: number
} {
  const events = activities.flatMap((activity) => [
    { timestamp: activity.startMs, delta: 1 },
    { timestamp: activity.finishMs, delta: -1 },
  ])
  events.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp
    }
    return right.delta - left.delta
  })

  let coveredMs = 0
  let activeCount = 0
  let maxConcurrency = 0
  let previousTimestamp = events[0]?.timestamp ?? 0

  for (const event of events) {
    if (event.timestamp > previousTimestamp && activeCount > 0) {
      coveredMs += event.timestamp - previousTimestamp
    }
    previousTimestamp = event.timestamp
    activeCount += event.delta
    maxConcurrency = Math.max(maxConcurrency, activeCount)
  }

  return { coveredMs, maxConcurrency }
}

function buildParallelizationInsights(
  averageConcurrency: number,
  criticalPathRatio: number,
  timelineCoverageRatio: number,
  idleWallClockMs: number,
  wallClockDurationMs: number,
  machineWaitDurationMs: number
) {
  const insights: Array<{ level: "info" | "warning" | "opportunity"; message: string }> = []
  const waitRatio = wallClockDurationMs > 0 ? machineWaitDurationMs / wallClockDurationMs : 0

  if (waitRatio > 0.05) {
    insights.push({
      level: "opportunity",
      message: `Build-agent wait time is ${toPercent(waitRatio)} of wall clock. Reducing queue/start latency should improve completion time.`,
    })
  }

  if (criticalPathRatio > 0.85 && averageConcurrency < 1.75) {
    insights.push({
      level: "opportunity",
      message:
        "The critical path is close to total wall clock with low average concurrency, indicating limited parallelism in the slowest chain.",
    })
  }

  if (timelineCoverageRatio < 0.92) {
    insights.push({
      level: "warning",
      message: `There are ${formatDuration(idleWallClockMs)} of idle timeline gaps where no step-level work was running.`,
    })
  }

  if (averageConcurrency > 5 && criticalPathRatio < 0.55) {
    insights.push({
      level: "info",
      message:
        "High average concurrency with a relatively short critical path suggests the pipeline is already heavily parallelized.",
    })
  }

  if (insights.length === 0) {
    insights.push({
      level: "info",
      message: "Parallelization appears balanced for this timeline based on runtime overlap and critical-path ratio.",
    })
  }

  return insights
}

function topDurationBuckets(graph: TimelineGraph, ids: string[], limit = 8): DurationBucket[] {
  return ids
    .map((id) => graph.nodesById[id])
    .filter((node): node is TimelineNode => Boolean(node))
    .filter((node) => node.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, limit)
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      durationMs: node.durationMs,
    }))
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
