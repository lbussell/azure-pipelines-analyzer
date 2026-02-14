import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParallelismDataPoint } from "@/types";
import { formatDuration } from "@/lib/parser";

export function ParallelismChart({
  series,
}: {
  series: ParallelismDataPoint[];
}) {
  if (series.length === 0) return null;

  const data = series.map((p) => ({
    offset: p.offsetMs,
    agents: p.activeAgents,
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
            <Tooltip
              labelFormatter={(v: number) => `Time: ${formatDuration(v)}`}
              formatter={(value: number) => [`${value} agents`, "Active"]}
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
