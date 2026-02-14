import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { PipelineTree, TimelineData } from "@/types";
import { parseTimeline } from "@/lib/parser";

interface TimelineContextValue {
  tree: PipelineTree | null;
  rawData: TimelineData | null;
  loadTimeline: (data: TimelineData) => void;
  clearTimeline: () => void;
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<PipelineTree | null>(null);
  const [rawData, setRawData] = useState<TimelineData | null>(null);

  const loadTimeline = useCallback((data: TimelineData) => {
    setRawData(data);
    setTree(parseTimeline(data));
  }, []);

  const clearTimeline = useCallback(() => {
    setRawData(null);
    setTree(null);
  }, []);

  return (
    <TimelineContext.Provider
      value={{ tree, rawData, loadTimeline, clearTimeline }}
    >
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx)
    throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
