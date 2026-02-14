import { useEffect, useMemo, useRef, useState } from "react"

import {
  RULE_FIELDS,
  RULE_OPERATORS,
  RULE_SET_VERSION,
  WORK_CATEGORIES,
  WORK_CATEGORY_LABELS,
  classifyNodes,
  createDefaultRules,
  createRule,
  parseRuleSet,
  serializeRuleSet,
  type ClassificationRule,
  type WorkCategory,
} from "@/lib/classification"
import {
  analyzeTimeline,
  collectDescendantIds,
  formatDuration,
  isStepLikeNode,
} from "@/lib/timeline"
import type { ClassificationSummary } from "@/lib/classification"
import type { TimelineAnalysis, TimelineNode } from "@/types/timeline"

const RULE_STORAGE_KEY = "azure-pipelines-analyzer.rule-set.v1"

interface ExplorerJob {
  job: TimelineNode
  steps: TimelineNode[]
}

interface ExplorerStage {
  stage: TimelineNode
  jobs: ExplorerJob[]
}

interface StageCategoryRow {
  stageId: string
  stageName: string
  totalMs: number
  byCategory: Record<WorkCategory, number>
}

function App() {
  const [analysis, setAnalysis] = useState<TimelineAnalysis | null>(null)
  const [fileName, setFileName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState<string>("")

  const [rules, setRules] = useState<ClassificationRule[]>(() => {
    const stored = readStoredRuleSet()
    return stored?.rules.length ? stored.rules : createDefaultRules()
  })
  const [overrides, setOverrides] = useState<Record<string, WorkCategory>>(() => {
    const stored = readStoredRuleSet()
    return stored?.overrides ?? {}
  })

  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      window.localStorage.setItem(
        RULE_STORAGE_KEY,
        serializeRuleSet({
          version: RULE_SET_VERSION,
          rules,
          overrides,
        })
      )
      setStorageError(null)
    } catch (persistError) {
      setStorageError(
        persistError instanceof Error
          ? persistError.message
          : "Failed to persist rule configuration to browser storage."
      )
    }
  }, [overrides, rules])

  const stepNodes = useMemo(() => {
    if (!analysis) {
      return []
    }
    return analysis.graph.stepIds
      .map((id) => analysis.graph.nodesById[id])
      .filter((node): node is TimelineNode => Boolean(node))
  }, [analysis])

  const classification = useMemo(
    () => classifyNodes(stepNodes, rules, overrides),
    [overrides, rules, stepNodes]
  )

  const criticalPathSet = useMemo(
    () => new Set(analysis?.criticalPath.nodeIds ?? []),
    [analysis]
  )

  const explorerStages = useMemo(
    () => buildExplorer(analysis, searchText),
    [analysis, searchText]
  )

  const stageCategoryRows = useMemo(
    () => buildStageCategoryRows(analysis, classification),
    [analysis, classification]
  )

  const selectedNode = useMemo(() => {
    if (!analysis || !selectedNodeId) {
      return null
    }
    return analysis.graph.nodesById[selectedNodeId] ?? null
  }, [analysis, selectedNodeId])

  const selectedNodeCategory = selectedNode
    ? classification.byNodeId[selectedNode.id]?.category
    : undefined
  const selectedNodeClassification = selectedNode
    ? classification.byNodeId[selectedNode.id]
    : undefined

  const incomingDependencies = useMemo(() => {
    if (!analysis || !selectedNode) {
      return []
    }
    return (analysis.graph.incomingDepsById[selectedNode.id] ?? [])
      .map((id) => analysis.graph.nodesById[id])
      .filter((node): node is TimelineNode => Boolean(node))
  }, [analysis, selectedNode])

  const outgoingDependencies = useMemo(() => {
    if (!analysis || !selectedNode) {
      return []
    }
    return (analysis.graph.outgoingDepsById[selectedNode.id] ?? [])
      .map((id) => analysis.graph.nodesById[id])
      .filter((node): node is TimelineNode => Boolean(node))
  }, [analysis, selectedNode])

  const onTimelineFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setError(null)
    try {
      const fileText = await file.text()
      const parsed = JSON.parse(fileText) as unknown
      const nextAnalysis = analyzeTimeline(parsed)

      setAnalysis(nextAnalysis)
      setFileName(file.name)
      setSelectedNodeId(
        nextAnalysis.graph.stageIds[0] ??
          nextAnalysis.graph.jobIds[0] ??
          nextAnalysis.graph.rootIds[0] ??
          nextAnalysis.graph.nodes[0]?.id ??
          null
      )
      setSearchText("")
    } catch (loadError) {
      setAnalysis(null)
      setSelectedNodeId(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to parse or analyze timeline file."
      )
    } finally {
      event.target.value = ""
    }
  }

  const addRule = (): void => {
    setRules((current) =>
      current.concat(
        createRule({
          label: "New rule",
          category: "unclassified",
        })
      )
    )
  }

  const updateRule = (
    ruleId: string,
    patch: Partial<ClassificationRule>
  ): void => {
    setRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    )
  }

  const removeRule = (ruleId: string): void => {
    setRules((current) => current.filter((rule) => rule.id !== ruleId))
  }

  const resetRules = (): void => {
    setRules(createDefaultRules())
    setOverrides({})
  }

  const setSelectedNodeOverride = (categoryValue: string): void => {
    if (!selectedNode) {
      return
    }

    if (categoryValue.length === 0) {
      setOverrides((current) => {
        const next = { ...current }
        delete next[selectedNode.id]
        return next
      })
      return
    }

    const category = categoryValue as WorkCategory
    if (!WORK_CATEGORIES.includes(category)) {
      return
    }

    setOverrides((current) => ({
      ...current,
      [selectedNode.id]: category,
    }))
  }

  const exportRules = (): void => {
    const payload = serializeRuleSet({
      version: RULE_SET_VERSION,
      rules,
      overrides,
    })
    const blob = new Blob([payload], { type: "application/json" })
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = blobUrl
    anchor.download = "timeline-classification-rules.json"
    anchor.click()
    URL.revokeObjectURL(blobUrl)
  }

  const importRules = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const payload = await file.text()
      const parsed = parseRuleSet(payload)
      setRules(parsed.rules)
      setOverrides(parsed.overrides)
      setError(null)
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import rule file."
      )
    } finally {
      event.target.value = ""
    }
  }

  return (
    <main className="min-h-screen bg-muted/20">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            Azure DevOps Pipeline Timeline Analyzer
          </h1>
          <p className="text-muted-foreground text-sm">
            Upload a build timeline JSON file and inspect critical path, wait
            time, parallelism, and useful-vs-non-useful work.
          </p>
        </header>

        <section className="bg-card rounded-lg border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="timeline-file"
              className="bg-primary text-primary-foreground inline-flex w-fit cursor-pointer items-center rounded-md px-4 py-2 text-sm font-medium"
            >
              Upload timeline JSON
            </label>
            <input
              id="timeline-file"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onTimelineFileSelected}
            />
            <p className="text-muted-foreground text-sm">
              {fileName
                ? `Loaded ${fileName}`
                : "No file loaded yet. Use the timeline endpoint output from Azure DevOps."}
            </p>
          </div>
          {error && (
            <p className="mt-3 rounded-md border border-red-400/50 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {storageError && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Rule persistence warning: {storageError}
            </p>
          )}
        </section>

        {analysis ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="End-to-end build time"
                value={formatDuration(analysis.metrics.endToEndDurationMs)}
              />
              <MetricCard
                label="Longest path (critical path)"
                value={formatDuration(analysis.criticalPath.durationMs)}
                subtitle={toPercent(
                  safeRatio(
                    analysis.criticalPath.durationMs,
                    analysis.metrics.wallClockDurationMs
                  )
                )}
              />
              <MetricCard
                label="Build-agent wait time"
                value={formatDuration(analysis.metrics.machineWaitDurationMs)}
                subtitle={toPercent(
                  safeRatio(
                    analysis.metrics.machineWaitDurationMs,
                    analysis.metrics.wallClockDurationMs
                  )
                )}
              />
              <MetricCard
                label="Machine running time (sum of jobs)"
                value={formatDuration(analysis.metrics.machineRunningDurationMs)}
              />
              <MetricCard
                label="Wall-clock time"
                value={formatDuration(analysis.metrics.wallClockDurationMs)}
              />
              <MetricCard
                label="No-agent-wait theoretical minimum"
                value={formatDuration(analysis.metrics.shortestNoWaitDurationMs)}
              />
              <MetricCard
                label="Average step concurrency"
                value={analysis.parallelization.averageConcurrency.toFixed(2)}
              />
              <MetricCard
                label="Maximum step concurrency"
                value={analysis.parallelization.maxConcurrency.toString()}
              />
            </section>

            <section className="bg-card rounded-lg border p-4">
              <h2 className="mb-3 text-lg font-medium">Pipeline structure</h2>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <StatLine
                  label="Stages"
                  value={analysis.metrics.recordCounts.stages.toString()}
                />
                <StatLine
                  label="Phases"
                  value={analysis.metrics.recordCounts.phases.toString()}
                />
                <StatLine
                  label="Jobs"
                  value={analysis.metrics.recordCounts.jobs.toString()}
                />
                <StatLine
                  label="Steps"
                  value={analysis.metrics.recordCounts.steps.toString()}
                />
                <StatLine
                  label="Tasks"
                  value={analysis.metrics.recordCounts.tasks.toString()}
                />
                <StatLine
                  label="Checkpoint records"
                  value={analysis.metrics.recordCounts.checkpoints.toString()}
                />
                <StatLine
                  label="Dependency edges"
                  value={analysis.metrics.dependencyCount.toString()}
                />
                <StatLine
                  label="Sibling-order edges"
                  value={analysis.metrics.dependencyBreakdown["sibling-order"].toString()}
                />
              </div>
              {analysis.graph.warnings.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-50 p-3">
                  <p className="text-sm font-medium">Timeline warnings</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {analysis.graph.warnings.slice(0, 8).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="bg-card rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">Parallelization analysis</h2>
                <div className="mb-3 space-y-1 text-sm">
                  <StatLine
                    label="Critical-path ratio"
                    value={toPercent(analysis.parallelization.criticalPathRatio)}
                  />
                  <StatLine
                    label="Timeline coverage ratio"
                    value={toPercent(analysis.parallelization.timelineCoverageRatio)}
                  />
                  <StatLine
                    label="Idle wall-clock"
                    value={formatDuration(analysis.parallelization.idleWallClockMs)}
                  />
                </div>
                <ul className="space-y-2 text-sm">
                  {analysis.parallelization.insights.map((insight, index) => (
                    <li
                      key={`${insight.level}-${index}`}
                      className="bg-muted/40 rounded-md border px-3 py-2"
                    >
                      <span className="mr-2 font-medium capitalize">
                        {insight.level}:
                      </span>
                      {insight.message}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-card rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">Longest path nodes</h2>
                <p className="text-muted-foreground mb-3 text-sm">
                  {analysis.criticalPath.explanation}
                </p>
                <ol className="max-h-72 list-decimal space-y-1 overflow-auto pl-5 text-sm">
                  {analysis.criticalPath.nodeIds.map((nodeId) => {
                    const node = analysis.graph.nodesById[nodeId]
                    if (!node) {
                      return null
                    }
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          className="hover:text-primary text-left"
                          onClick={() => setSelectedNodeId(node.id)}
                        >
                          {node.name}
                        </button>{" "}
                        <span className="text-muted-foreground">
                          ({node.type}, {formatDuration(node.durationMs)})
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </section>

            <section className="bg-card rounded-lg border p-4">
              <h2 className="mb-3 text-lg font-medium">Top time consumers</h2>
              <div className="grid gap-4 lg:grid-cols-3">
                <DurationList
                  title="Stages"
                  buckets={analysis.topConsumers.stages}
                  onSelect={setSelectedNodeId}
                />
                <DurationList
                  title="Jobs"
                  buckets={analysis.topConsumers.jobs}
                  onSelect={setSelectedNodeId}
                />
                <DurationList
                  title="Steps"
                  buckets={analysis.topConsumers.steps}
                  onSelect={setSelectedNodeId}
                />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="bg-card rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">Classification rules</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={addRule}
                    >
                      Add rule
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={resetRules}
                    >
                      Reset defaults
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={exportRules}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={() => importInputRef.current?.click()}
                    >
                      Import
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={importRules}
                    />
                  </div>
                </div>
                <div className="max-h-[460px] space-y-3 overflow-auto pr-1">
                  {rules.map((rule) => (
                    <div key={rule.id} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) =>
                              updateRule(rule.id, { enabled: event.target.checked })
                            }
                          />
                          Enabled
                        </label>
                        <button
                          type="button"
                          className="text-sm text-red-700"
                          onClick={() => removeRule(rule.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        className="mb-2 w-full rounded-md border px-2 py-1 text-sm"
                        value={rule.label}
                        onChange={(event) =>
                          updateRule(rule.id, { label: event.target.value })
                        }
                        placeholder="Rule label"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          className="rounded-md border px-2 py-1 text-sm"
                          value={rule.field}
                          onChange={(event) =>
                            updateRule(rule.id, {
                              field: event.target.value as ClassificationRule["field"],
                            })
                          }
                        >
                          {RULE_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-md border px-2 py-1 text-sm"
                          value={rule.operator}
                          onChange={(event) =>
                            updateRule(rule.id, {
                              operator: event.target.value as ClassificationRule["operator"],
                            })
                          }
                        >
                          {RULE_OPERATORS.map((operator) => (
                            <option key={operator} value={operator}>
                              {operator}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="mt-2 w-full rounded-md border px-2 py-1 text-sm"
                        value={rule.value}
                        onChange={(event) =>
                          updateRule(rule.id, { value: event.target.value })
                        }
                        placeholder="Match value / regex"
                      />
                      <select
                        className="mt-2 w-full rounded-md border px-2 py-1 text-sm"
                        value={rule.category}
                        onChange={(event) =>
                          updateRule(rule.id, {
                            category: event.target.value as WorkCategory,
                          })
                        }
                      >
                        {WORK_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {WORK_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">Useful vs non-useful work</h2>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {WORK_CATEGORIES.map((category) => (
                    <StatLine
                      key={category}
                      label={WORK_CATEGORY_LABELS[category]}
                      value={`${formatDuration(
                        classification.totalsByCategory[category]
                      )} (${toPercent(
                        safeRatio(
                          classification.totalsByCategory[category],
                          classification.totalDurationMs
                        )
                      )})`}
                    />
                  ))}
                  <StatLine
                    label="Useful share"
                    value={toPercent(
                      safeRatio(
                        classification.usefulDurationMs,
                        classification.totalDurationMs
                      )
                    )}
                  />
                  <StatLine
                    label="Non-useful share"
                    value={toPercent(
                      safeRatio(
                        classification.nonUsefulDurationMs,
                        classification.totalDurationMs
                      )
                    )}
                  />
                </div>

                <h3 className="mt-4 mb-2 font-medium">Per-stage category breakdown</h3>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-1">Stage</th>
                        <th className="px-2 py-1">Total</th>
                        <th className="px-2 py-1">Useful</th>
                        <th className="px-2 py-1">Setup</th>
                        <th className="px-2 py-1">Teardown</th>
                        <th className="px-2 py-1">Infra</th>
                        <th className="px-2 py-1">Unclassified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageCategoryRows.map((row) => (
                        <tr key={row.stageId} className="border-t">
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              className="hover:text-primary text-left"
                              onClick={() => setSelectedNodeId(row.stageId)}
                            >
                              {row.stageName}
                            </button>
                          </td>
                          <td className="px-2 py-1">{formatDuration(row.totalMs)}</td>
                          <td className="px-2 py-1">
                            {formatDuration(row.byCategory.useful)}
                          </td>
                          <td className="px-2 py-1">
                            {formatDuration(row.byCategory.setup)}
                          </td>
                          <td className="px-2 py-1">
                            {formatDuration(row.byCategory.teardown)}
                          </td>
                          <td className="px-2 py-1">
                            {formatDuration(row.byCategory.infrastructure)}
                          </td>
                          <td className="px-2 py-1">
                            {formatDuration(row.byCategory.unclassified)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-5">
              <div className="bg-card rounded-lg border p-4 xl:col-span-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">Stage / Job / Step explorer</h2>
                  <input
                    className="w-full rounded-md border px-3 py-1 text-sm sm:w-80"
                    placeholder="Search name, type, identifier..."
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                </div>
                <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
                  {explorerStages.map((stageRow) => (
                    <details key={stageRow.stage.id} open className="rounded-md border p-2">
                      <summary className="cursor-pointer text-sm font-medium">
                        <button
                          type="button"
                          className="hover:text-primary text-left"
                          onClick={(event) => {
                            event.preventDefault()
                            setSelectedNodeId(stageRow.stage.id)
                          }}
                        >
                          {stageRow.stage.name}
                        </button>{" "}
                        <span className="text-muted-foreground">
                          ({formatDuration(stageRow.stage.durationMs)})
                        </span>
                      </summary>
                      <div className="mt-2 space-y-2 pl-2">
                        {stageRow.jobs.map((jobRow) => (
                          <div key={jobRow.job.id} className="rounded-md border p-2">
                            <button
                              type="button"
                              className="hover:text-primary text-left text-sm font-medium"
                              onClick={() => setSelectedNodeId(jobRow.job.id)}
                            >
                              {jobRow.job.name}
                            </button>
                            <p className="text-muted-foreground text-xs">
                              {formatDuration(jobRow.job.durationMs)} total, wait{" "}
                              {formatDuration(
                                analysis.metrics.jobWaitById[jobRow.job.id] ?? 0
                              )}
                            </p>
                            <ul className="mt-2 space-y-1">
                              {jobRow.steps.map((step) => (
                                <li key={step.id}>
                                  <button
                                    type="button"
                                    className={[
                                      "w-full rounded-md border px-2 py-1 text-left text-xs",
                                      selectedNodeId === step.id
                                        ? "border-primary bg-primary/10"
                                        : "hover:bg-muted/50",
                                    ].join(" ")}
                                    onClick={() => setSelectedNodeId(step.id)}
                                  >
                                    <span className="font-medium">{step.name}</span>{" "}
                                    <span className="text-muted-foreground">
                                      ({formatDuration(step.durationMs)})
                                    </span>
                                    {criticalPathSet.has(step.id) && (
                                      <span className="ml-2 rounded border border-blue-500/40 bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                                        Critical path
                                      </span>
                                    )}
                                    {classification.byNodeId[step.id] && (
                                      <span
                                        className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-medium ${categoryClassName(
                                          classification.byNodeId[step.id].category
                                        )}`}
                                      >
                                        {
                                          WORK_CATEGORY_LABELS[
                                            classification.byNodeId[step.id].category
                                          ]
                                        }
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-lg border p-4 xl:col-span-2">
                <h2 className="mb-3 text-lg font-medium">Selected record details</h2>
                {selectedNode ? (
                  <div className="space-y-3 text-sm">
                    <StatLine label="Name" value={selectedNode.name} />
                    <StatLine label="Type" value={selectedNode.type} />
                    <StatLine
                      label="Duration"
                      value={formatDuration(selectedNode.durationMs)}
                    />
                    <StatLine
                      label="State"
                      value={selectedNode.state ?? "Unknown"}
                    />
                    <StatLine
                      label="Result"
                      value={selectedNode.result ?? "Unknown"}
                    />
                    <StatLine
                      label="Start"
                      value={
                        selectedNode.startTime
                          ? selectedNode.startTime.toISOString()
                          : "n/a"
                      }
                    />
                    <StatLine
                      label="Finish"
                      value={
                        selectedNode.finishTime
                          ? selectedNode.finishTime.toISOString()
                          : "n/a"
                      }
                    />
                    <StatLine
                      label="Identifier"
                      value={selectedNode.identifier ?? "n/a"}
                    />
                    <StatLine
                      label="Ref name"
                      value={selectedNode.refName ?? "n/a"}
                    />
                    <StatLine
                      label="Worker"
                      value={selectedNode.workerName ?? "n/a"}
                    />
                    <StatLine
                      label="Queue id"
                      value={selectedNode.queueId?.toString() ?? "n/a"}
                    />
                    <StatLine
                      label="On critical path"
                      value={criticalPathSet.has(selectedNode.id) ? "Yes" : "No"}
                    />

                    {isStepLikeNode(selectedNode) && (
                      <>
                        <StatLine
                          label="Classification"
                          value={
                            selectedNodeCategory
                              ? WORK_CATEGORY_LABELS[selectedNodeCategory]
                              : "Unclassified"
                          }
                        />
                        <StatLine
                          label="Classified by"
                          value={selectedNodeClassification?.source ?? "default"}
                        />
                        <div className="space-y-1">
                          <label
                            htmlFor="manual-override"
                            className="text-muted-foreground block text-xs font-medium"
                          >
                            Manual category override
                          </label>
                          <select
                            id="manual-override"
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            value={overrides[selectedNode.id] ?? ""}
                            onChange={(event) =>
                              setSelectedNodeOverride(event.target.value)
                            }
                          >
                            <option value="">Use rules/default</option>
                            {WORK_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {WORK_CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase">
                        Incoming dependencies
                      </h3>
                      <ul className="space-y-1 text-xs">
                        {incomingDependencies.length > 0 ? (
                          incomingDependencies.slice(0, 12).map((dependencyNode) => (
                            <li key={dependencyNode.id}>
                              <button
                                type="button"
                                className="hover:text-primary text-left"
                                onClick={() => setSelectedNodeId(dependencyNode.id)}
                              >
                                {dependencyNode.name}
                              </button>{" "}
                              <span className="text-muted-foreground">
                                ({dependencyNode.type})
                              </span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">None</li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase">
                        Outgoing dependencies
                      </h3>
                      <ul className="space-y-1 text-xs">
                        {outgoingDependencies.length > 0 ? (
                          outgoingDependencies.slice(0, 12).map((dependencyNode) => (
                            <li key={dependencyNode.id}>
                              <button
                                type="button"
                                className="hover:text-primary text-left"
                                onClick={() => setSelectedNodeId(dependencyNode.id)}
                              >
                                {dependencyNode.name}
                              </button>{" "}
                              <span className="text-muted-foreground">
                                ({dependencyNode.type})
                              </span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">None</li>
                        )}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Select a stage, job, or step to inspect details.
                  </p>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="bg-card text-muted-foreground rounded-lg border p-8 text-sm">
            Upload a timeline JSON file to begin analysis.
          </section>
        )}
      </div>
    </main>
  )
}

function readStoredRuleSet() {
  if (typeof window === "undefined") {
    return null
  }

  const stored = window.localStorage.getItem(RULE_STORAGE_KEY)
  if (!stored) {
    return null
  }

  try {
    return parseRuleSet(stored)
  } catch {
    return null
  }
}

function buildExplorer(
  analysis: TimelineAnalysis | null,
  searchText: string
): ExplorerStage[] {
  if (!analysis) {
    return []
  }

  const trimmedSearch = searchText.trim().toLowerCase()
  const matches = (node: TimelineNode): boolean => {
    if (trimmedSearch.length === 0) {
      return true
    }
    const haystack = [
      node.name,
      node.type,
      node.identifier ?? "",
      node.refName ?? "",
      node.taskName ?? "",
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(trimmedSearch)
  }

  const results: ExplorerStage[] = []
  for (const stageId of analysis.graph.stageIds) {
    const stage = analysis.graph.nodesById[stageId]
    if (!stage) {
      continue
    }

    const jobIds = collectDescendantIds(
      analysis.graph,
      stage.id,
      (node) => node.type === "Job"
    )
    const jobs: ExplorerJob[] = []
    for (const jobId of jobIds) {
      const job = analysis.graph.nodesById[jobId]
      if (!job) {
        continue
      }

      const steps = collectDescendantIds(
        analysis.graph,
        job.id,
        (node) => isStepLikeNode(node)
      )
        .map((id) => analysis.graph.nodesById[id])
        .filter((node): node is TimelineNode => Boolean(node))
        .filter((node) => matches(node))

      if (trimmedSearch.length > 0 && !matches(job) && steps.length === 0) {
        continue
      }

      jobs.push({ job, steps })
    }

    if (trimmedSearch.length > 0 && !matches(stage) && jobs.length === 0) {
      continue
    }

    results.push({ stage, jobs })
  }

  return results
}

function buildStageCategoryRows(
  analysis: TimelineAnalysis | null,
  classification: ClassificationSummary
): StageCategoryRow[] {
  if (!analysis) {
    return []
  }

  const rows: StageCategoryRow[] = []
  for (const stageId of analysis.graph.stageIds) {
    const stageNode = analysis.graph.nodesById[stageId]
    if (!stageNode) {
      continue
    }

    const totals: Record<WorkCategory, number> = {
      useful: 0,
      setup: 0,
      teardown: 0,
      infrastructure: 0,
      unclassified: 0,
    }

    const stepIds = collectDescendantIds(
      analysis.graph,
      stageId,
      (node) => isStepLikeNode(node)
    )
    for (const stepId of stepIds) {
      const node = analysis.graph.nodesById[stepId]
      if (!node) {
        continue
      }
      const category = classification.byNodeId[stepId]?.category ?? "unclassified"
      totals[category] += node.durationMs
    }

    rows.push({
      stageId,
      stageName: stageNode.name,
      totalMs: Object.values(totals).reduce((sum, value) => sum + value, 0),
      byCategory: totals,
    })
  }

  return rows.sort((left, right) => right.totalMs - left.totalMs)
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0
  }
  return numerator / denominator
}

function toPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function categoryClassName(category: WorkCategory): string {
  switch (category) {
    case "useful":
      return "border-green-400/40 bg-green-100 text-green-800"
    case "setup":
      return "border-blue-400/40 bg-blue-100 text-blue-800"
    case "teardown":
      return "border-orange-400/40 bg-orange-100 text-orange-800"
    case "infrastructure":
      return "border-purple-400/40 bg-purple-100 text-purple-800"
    case "unclassified":
      return "border-slate-300 bg-slate-100 text-slate-700"
    default:
      return "border-slate-300 bg-slate-100 text-slate-700"
  }
}

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <article className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {subtitle && <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>}
    </article>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-start justify-between gap-2 border-b pb-1 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </p>
  )
}

function DurationList({
  title,
  buckets,
  onSelect,
}: {
  title: string
  buckets: Array<{
    id: string
    name: string
    type: string
    durationMs: number
  }>
  onSelect: (nodeId: string) => void
}) {
  return (
    <div className="rounded-md border">
      <div className="bg-muted/40 border-b px-3 py-2 text-sm font-medium">{title}</div>
      <ul className="max-h-64 space-y-1 overflow-auto p-2">
        {buckets.map((bucket) => (
          <li key={bucket.id}>
            <button
              type="button"
              className="hover:bg-muted/40 w-full rounded-md px-2 py-1 text-left text-sm"
              onClick={() => onSelect(bucket.id)}
            >
              <span className="block truncate font-medium">{bucket.name}</span>
              <span className="text-muted-foreground text-xs">
                {bucket.type} • {formatDuration(bucket.durationMs)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
