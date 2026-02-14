import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryBreakdownItem } from "@/types";
import { formatDuration } from "@/lib/parser";

export function CategoryBreakdownChart({
  breakdown,
}: {
  breakdown: CategoryBreakdownItem[];
}) {
  if (breakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Time by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No categorized tasks yet. Go to Rules to define categories and rules.
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = breakdown.map((b) => ({
    name: b.categoryName,
    value: b.totalMs,
    color: b.color,
    percentage: b.percentage,
    taskCount: b.taskCount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Time by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatDuration(v)}
              style={{ fontSize: "11px" }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              style={{ fontSize: "11px" }}
            />
            <Tooltip
              formatter={(value: number) => formatDuration(value)}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend with percentages */}
        <div className="mt-4 space-y-1">
          {breakdown.map((b) => (
            <div
              key={b.categoryId ?? "uncategorized"}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className="flex-1">{b.categoryName}</span>
              <span className="text-muted-foreground">
                {b.taskCount} tasks
              </span>
              <span className="font-medium w-16 text-right">
                {b.percentage.toFixed(1)}%
              </span>
              <span className="text-muted-foreground w-20 text-right">
                {formatDuration(b.totalMs)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
