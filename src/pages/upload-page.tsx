import { useCallback, useState, useRef } from "react";
import { RiUploadCloud2Line, RiFileTextLine } from "@remixicon/react";
import { Card, CardContent } from "@/components/ui/card";
import { useTimeline } from "@/contexts";
import type { TimelineData } from "@/types";

export function UploadPage({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const { loadTimeline } = useTimeline();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text) as TimelineData;
        if (!data.records || !Array.isArray(data.records)) {
          throw new Error(
            "Invalid timeline JSON: expected a 'records' array."
          );
        }
        loadTimeline(data);
        onUploaded();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to parse the file."
        );
      }
    },
    [loadTimeline, onUploaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Pipeline Analyzer
          </h1>
          <p className="text-muted-foreground">
            Upload an Azure DevOps Pipeline timeline JSON to analyze build
            performance.
          </p>
        </div>

        <Card
          className={`cursor-pointer border-2 border-dashed transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="rounded-full bg-primary/10 p-4">
              <RiUploadCloud2Line className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">
                Drop your timeline JSON here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                Get timelines from:{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  /build/builds/&#123;id&#125;/timeline?api-version=7.1
                </code>
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={onFileChange}
              className="hidden"
            />
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <RiFileTextLine className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
