import type { TimelineNode } from "@/types/timeline"

export const WORK_CATEGORIES = [
  "useful",
  "setup",
  "teardown",
  "infrastructure",
  "unclassified",
] as const
export type WorkCategory = (typeof WORK_CATEGORIES)[number]

export const WORK_CATEGORY_LABELS: Record<WorkCategory, string> = {
  useful: "Useful work",
  setup: "Setup",
  teardown: "Teardown",
  infrastructure: "Infrastructure / policy",
  unclassified: "Unclassified",
}

export const RULE_FIELDS = ["name", "type", "identifier", "refName", "taskName"] as const
export type RuleField = (typeof RULE_FIELDS)[number]

export const RULE_OPERATORS = ["contains", "startsWith", "equals", "regex"] as const
export type RuleOperator = (typeof RULE_OPERATORS)[number]

export interface ClassificationRule {
  id: string
  label: string
  enabled: boolean
  field: RuleField
  operator: RuleOperator
  value: string
  category: WorkCategory
}

export interface RuleSet {
  version: number
  rules: ClassificationRule[]
  overrides: Record<string, WorkCategory>
}

export interface ClassificationEntry {
  category: WorkCategory
  matchedRuleId: string | null
  source: "override" | "rule" | "default"
}

export interface ClassificationSummary {
  byNodeId: Record<string, ClassificationEntry>
  totalsByCategory: Record<WorkCategory, number>
  totalDurationMs: number
  usefulDurationMs: number
  nonUsefulDurationMs: number
}

export const RULE_SET_VERSION = 1

export function createDefaultRules(): ClassificationRule[] {
  return [
    {
      id: "setup-init-finalize",
      label: "Initialize/finalize tasks",
      enabled: true,
      field: "name",
      operator: "regex",
      value: "(initialize job|pre-job|finalize job|post-job)",
      category: "setup",
    },
    {
      id: "setup-download-secrets",
      label: "Download secrets/setup resources",
      enabled: true,
      field: "name",
      operator: "regex",
      value: "(download secrets|checkout|set .* variable|prepare|setup)",
      category: "setup",
    },
    {
      id: "infra-security-policy",
      label: "Security and policy checks",
      enabled: true,
      field: "name",
      operator: "regex",
      value: "(codeql|governance|security|policy|compliance|validation|drift management)",
      category: "infrastructure",
    },
    {
      id: "teardown-stop-cleanup",
      label: "Stop/cleanup tasks",
      enabled: true,
      field: "name",
      operator: "regex",
      value: "(stop .*|cleanup|tear ?down|finalize)",
      category: "teardown",
    },
    {
      id: "useful-build-test",
      label: "Build/test/publish work",
      enabled: true,
      field: "name",
      operator: "regex",
      value: "(build|compile|restore|test|pack|publish|run)",
      category: "useful",
    },
  ]
}

export function createRule(overrides: Partial<ClassificationRule> = {}): ClassificationRule {
  return {
    id: overrides.id ?? generateRuleId(),
    label: overrides.label ?? "Custom rule",
    enabled: overrides.enabled ?? true,
    field: overrides.field ?? "name",
    operator: overrides.operator ?? "contains",
    value: overrides.value ?? "",
    category: overrides.category ?? "useful",
  }
}

export function classifyNodes(
  nodes: TimelineNode[],
  rules: ClassificationRule[],
  overrides: Record<string, WorkCategory>
): ClassificationSummary {
  const byNodeId: Record<string, ClassificationEntry> = {}
  const totalsByCategory: Record<WorkCategory, number> = {
    useful: 0,
    setup: 0,
    teardown: 0,
    infrastructure: 0,
    unclassified: 0,
  }

  let totalDurationMs = 0
  for (const node of nodes) {
    const entry = classifyNode(node, rules, overrides)
    byNodeId[node.id] = entry
    totalsByCategory[entry.category] += node.durationMs
    totalDurationMs += node.durationMs
  }

  return {
    byNodeId,
    totalsByCategory,
    totalDurationMs,
    usefulDurationMs: totalsByCategory.useful,
    nonUsefulDurationMs: totalDurationMs - totalsByCategory.useful,
  }
}

export function classifyNode(
  node: TimelineNode,
  rules: ClassificationRule[],
  overrides: Record<string, WorkCategory>
): ClassificationEntry {
  const overrideCategory = overrides[node.id]
  if (overrideCategory) {
    return { category: overrideCategory, matchedRuleId: null, source: "override" }
  }

  for (const rule of rules) {
    if (!rule.enabled) {
      continue
    }
    if (isRuleMatch(rule, node)) {
      return { category: rule.category, matchedRuleId: rule.id, source: "rule" }
    }
  }

  return { category: "unclassified", matchedRuleId: null, source: "default" }
}

export function serializeRuleSet(ruleSet: RuleSet): string {
  return JSON.stringify(ruleSet, null, 2)
}

export function parseRuleSet(json: string): RuleSet {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Rule file must be a JSON object.")
  }

  const candidate = parsed as {
    version?: unknown
    rules?: unknown
    overrides?: unknown
  }
  const version =
    typeof candidate.version === "number" && Number.isInteger(candidate.version)
      ? candidate.version
      : 0
  if (version !== RULE_SET_VERSION) {
    throw new Error(`Unsupported rule file version '${String(candidate.version)}'.`)
  }

  if (!Array.isArray(candidate.rules)) {
    throw new Error("Rule file must include a rules array.")
  }

  const rules = candidate.rules.map((ruleValue, index) => parseRule(ruleValue, index))
  const overrides = parseOverrides(candidate.overrides)

  return {
    version,
    rules,
    overrides,
  }
}

function parseRule(ruleValue: unknown, index: number): ClassificationRule {
  if (!ruleValue || typeof ruleValue !== "object") {
    throw new Error(`Rule at index ${index} must be an object.`)
  }

  const candidate = ruleValue as Partial<ClassificationRule>
  const id = typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : generateRuleId()
  const label =
    typeof candidate.label === "string" && candidate.label.length > 0
      ? candidate.label
      : `Imported rule ${index + 1}`
  const enabled = typeof candidate.enabled === "boolean" ? candidate.enabled : true
  const field = isRuleField(candidate.field) ? candidate.field : "name"
  const operator = isRuleOperator(candidate.operator) ? candidate.operator : "contains"
  const value = typeof candidate.value === "string" ? candidate.value : ""
  const category = isWorkCategory(candidate.category) ? candidate.category : "unclassified"

  return {
    id,
    label,
    enabled,
    field,
    operator,
    value,
    category,
  }
}

function parseOverrides(rawOverrides: unknown): Record<string, WorkCategory> {
  if (!rawOverrides || typeof rawOverrides !== "object") {
    return {}
  }

  const overrides: Record<string, WorkCategory> = {}
  for (const [nodeId, category] of Object.entries(rawOverrides)) {
    if (!isWorkCategory(category)) {
      continue
    }
    overrides[nodeId] = category
  }

  return overrides
}

function isRuleMatch(rule: ClassificationRule, node: TimelineNode): boolean {
  const fieldValue = getFieldValue(node, rule.field)
  if (fieldValue.length === 0 || rule.value.length === 0) {
    return false
  }

  const candidate = fieldValue.toLowerCase()
  const target = rule.value.toLowerCase()

  switch (rule.operator) {
    case "contains":
      return candidate.includes(target)
    case "startsWith":
      return candidate.startsWith(target)
    case "equals":
      return candidate === target
    case "regex":
      try {
        return new RegExp(rule.value, "i").test(fieldValue)
      } catch {
        return false
      }
    default:
      return false
  }
}

function getFieldValue(node: TimelineNode, field: RuleField): string {
  switch (field) {
    case "name":
      return node.name
    case "type":
      return node.type
    case "identifier":
      return node.identifier ?? ""
    case "refName":
      return node.refName ?? ""
    case "taskName":
      return node.taskName ?? ""
    default:
      return ""
  }
}

function generateRuleId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isWorkCategory(value: unknown): value is WorkCategory {
  return typeof value === "string" && WORK_CATEGORIES.includes(value as WorkCategory)
}

function isRuleField(value: unknown): value is RuleField {
  return typeof value === "string" && RULE_FIELDS.includes(value as RuleField)
}

function isRuleOperator(value: unknown): value is RuleOperator {
  return typeof value === "string" && RULE_OPERATORS.includes(value as RuleOperator)
}
