import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type {
  Category,
  CategorizationRule,
  PipelineNode,
} from "@/types";

interface CategoriesState {
  categories: Category[];
  rules: CategorizationRule[];
  /** Manual overrides: taskId -> categoryId */
  overrides: Record<string, string>;
}

interface CategoriesContextValue extends CategoriesState {
  addCategory: (name: string, color: string) => Category;
  updateCategory: (id: string, updates: Partial<Omit<Category, "id">>) => void;
  removeCategory: (id: string) => void;
  addRule: (rule: Omit<CategorizationRule, "id">) => CategorizationRule;
  updateRule: (id: string, updates: Partial<Omit<CategorizationRule, "id">>) => void;
  removeRule: (id: string) => void;
  reorderRules: (rules: CategorizationRule[]) => void;
  setOverride: (nodeId: string, categoryId: string | null) => void;
  clearOverrides: () => void;
  clearAllRules: () => void;
  getCategoryForNode: (node: PipelineNode) => string | null;
  applyCategoryToNode: (node: PipelineNode) => string | null;
  exportData: () => string;
  importData: (json: string) => void;
  getCategoryById: (id: string | null) => Category | undefined;
}

const STORAGE_KEY = "pipeline-analyzer-categories";

function generateId(): string {
  return crypto.randomUUID();
}

function loadState(): CategoriesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as CategoriesState;
    }
  } catch {
    // ignore
  }
  return { categories: [], rules: [], overrides: {} };
}

function saveState(state: CategoriesState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Test if a rule matches a node's name */
function ruleMatches(rule: CategorizationRule, name: string): boolean {
  switch (rule.matchType) {
    case "exact":
      return name === rule.pattern;
    case "contains":
      return name.toLowerCase().includes(rule.pattern.toLowerCase());
    case "startsWith":
      return name.toLowerCase().startsWith(rule.pattern.toLowerCase());
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(name);
      } catch {
        return false;
      }
  }
}

/** Get the category for a node based on rules (sorted by priority) */
function matchCategory(
  rules: CategorizationRule[],
  overrides: Record<string, string>,
  node: PipelineNode
): string | null {
  // Manual override takes precedence
  if (overrides[node.id]) {
    return overrides[node.id];
  }
  // Try rules in priority order (lower number = higher priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (ruleMatches(rule, node.name)) {
      return rule.categoryId;
    }
  }
  return null;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CategoriesState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addCategory = useCallback((name: string, color: string): Category => {
    const cat: Category = { id: generateId(), name, color };
    setState((s) => ({ ...s, categories: [...s.categories, cat] }));
    return cat;
  }, []);

  const updateCategory = useCallback(
    (id: string, updates: Partial<Omit<Category, "id">>) => {
      setState((s) => ({
        ...s,
        categories: s.categories.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
    },
    []
  );

  const removeCategory = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      rules: s.rules.filter((r) => r.categoryId !== id),
      overrides: Object.fromEntries(
        Object.entries(s.overrides).filter(([, v]) => v !== id)
      ),
    }));
  }, []);

  const addRule = useCallback(
    (rule: Omit<CategorizationRule, "id">): CategorizationRule => {
      const newRule: CategorizationRule = { ...rule, id: generateId() };
      setState((s) => ({ ...s, rules: [...s.rules, newRule] }));
      return newRule;
    },
    []
  );

  const updateRule = useCallback(
    (id: string, updates: Partial<Omit<CategorizationRule, "id">>) => {
      setState((s) => ({
        ...s,
        rules: s.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      }));
    },
    []
  );

  const removeRule = useCallback((id: string) => {
    setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));
  }, []);

  const reorderRules = useCallback((rules: CategorizationRule[]) => {
    setState((s) => ({ ...s, rules }));
  }, []);

  const setOverride = useCallback(
    (nodeId: string, categoryId: string | null) => {
      setState((s) => {
        const overrides = { ...s.overrides };
        if (categoryId === null) {
          delete overrides[nodeId];
        } else {
          overrides[nodeId] = categoryId;
        }
        return { ...s, overrides };
      });
    },
    []
  );

  const clearOverrides = useCallback(() => {
    setState((s) => ({ ...s, overrides: {} }));
  }, []);

  const clearAllRules = useCallback(() => {
    setState((s) => ({ ...s, rules: [], overrides: {} }));
  }, []);

  const getCategoryForNode = useCallback(
    (node: PipelineNode): string | null => {
      return matchCategory(state.rules, state.overrides, node);
    },
    [state.rules, state.overrides]
  );

  const applyCategoryToNode = useCallback(
    (node: PipelineNode): string | null => {
      const catId = matchCategory(state.rules, state.overrides, node);
      node.categoryId = catId;
      node.manualCategory = !!state.overrides[node.id];
      return catId;
    },
    [state.rules, state.overrides]
  );

  const getCategoryById = useCallback(
    (id: string | null): Category | undefined => {
      if (!id) return undefined;
      return state.categories.find((c) => c.id === id);
    },
    [state.categories]
  );

  const exportData = useCallback((): string => {
    return JSON.stringify(
      { categories: state.categories, rules: state.rules },
      null,
      2
    );
  }, [state.categories, state.rules]);

  const importData = useCallback((json: string) => {
    const parsed = JSON.parse(json) as {
      categories: Category[];
      rules: CategorizationRule[];
    };
    setState((s) => ({
      ...s,
      categories: parsed.categories ?? s.categories,
      rules: parsed.rules ?? s.rules,
    }));
  }, []);

  return (
    <CategoriesContext.Provider
      value={{
        ...state,
        addCategory,
        updateCategory,
        removeCategory,
        addRule,
        updateRule,
        removeRule,
        reorderRules,
        setOverride,
        clearOverrides,
        clearAllRules,
        getCategoryForNode,
        applyCategoryToNode,
        exportData,
        importData,
        getCategoryById,
      }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories(): CategoriesContextValue {
  const ctx = useContext(CategoriesContext);
  if (!ctx)
    throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
