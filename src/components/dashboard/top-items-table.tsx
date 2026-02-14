import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { PipelineNode } from "@/types";
import { formatDuration } from "@/lib/parser";

function ResultBadge({ result }: { result: string | null }) {
  const variant =
    result === "succeeded"
      ? "default"
      : result === "failed"
      ? "destructive"
      : "secondary";
  return (
    <Badge variant={variant} className="text-[10px]">
      {result ?? "—"}
    </Badge>
  );
}

export function TopItemsTable({ jobs }: { jobs: PipelineNode[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Longest Running Jobs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Job Name</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job, i) => (
              <TableRow key={job.id}>
                <TableCell className="text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium max-w-xs truncate">
                  {job.name}
                </TableCell>
                <TableCell>{formatDuration(job.durationMs)}</TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">
                  {job.workerName ?? "—"}
                </TableCell>
                <TableCell>
                  <ResultBadge result={job.result} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
