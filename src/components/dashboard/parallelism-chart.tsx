import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParallelismDataPoint } from "@/types";
import { formatDuration } from "@/lib/parser";

interface ChartDataPoint {
  offset: number;
  agents: number;
  activeJobNames: string[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: ChartDataPoint }[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-md max-w-xs">
      <p className="font-medium mb-1">
        Time: {formatDuration(label ?? 0)} — {data.agents} agent
        {data.agents !== 1 ? "s" : ""}
      </p>
      {data.activeJobNames.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground">
          {data.activeJobNames.slice(0, 12).map((name, i) => (
            <li key={i} className="truncate">
              • {name}
            </li>
          ))}
          {data.activeJobNames.length > 12 && (
            <li>…and {data.activeJobNames.length - 12} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ParallelismChart({
  series,
}: {
  series: ParallelismDataPoint[];
}) {
  if (series.length === 0) return null;

  const data: ChartDataPoint[] = series.map((p) => ({
    offset: p.offsetMs,
    agents: p.activeAgents,
    activeJobNames: p.activeJobNames,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Agent Parallelism Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="offset"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(v: number) => formatDuration(v)}
              style={{ fontSize: "11px" }}
            />
            <YAxis
              allowDecimals={false}
              style={{ fontSize: "11px" }}
              label={{
                value: "Active Agents",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: "11px" },
              }}
            />
            <RechartsTooltip
              content={<CustomTooltip />}
            />
            <Area
              type="stepAfter"
              dataKey="agents"
              stroke="oklch(0.59 0.14 242)"
              fill="oklch(0.59 0.14 242 / 0.2)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
