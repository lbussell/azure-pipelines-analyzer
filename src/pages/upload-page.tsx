import { useCallback, useState, useRef } from "react";
import { RiUploadCloud2Line, RiFileTextLine, RiGithubLine, RiFileCopyLine, RiCheckLine } from "@remixicon/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTimeline } from "@/contexts";
import type { TimelineData } from "@/types";

/**
 * Parse an Azure DevOps build URL and return the corresponding timeline API URL.
 * Accepts URLs like:
 *   https://dev.azure.com/{org}/{project}/_build/results?buildId={id}&view=results
 *   https://{org}.visualstudio.com/{project}/_build/results?buildId={id}
 * Returns null if the URL cannot be parsed.
 */
function buildTimelineUrl(buildUrl: string): string | null {
  try {
    const url = new URL(buildUrl.trim());
    const buildId = url.searchParams.get("buildId");
    if (!buildId) return null;

    // dev.azure.com/{org}/{project}/_build/...
    const devAzureMatch = url.pathname.match(
      /^\/([^/]+)\/([^/]+)\/_build/
    );
    if (url.hostname === "dev.azure.com" && devAzureMatch) {
      const [, org, project] = devAzureMatch;
      return `https://dev.azure.com/${org}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.1`;
    }

    // {org}.visualstudio.com/{project}/_build/...
    const vsMatch = url.hostname.match(/^(.+)\.visualstudio\.com$/);
    const vsPathMatch = url.pathname.match(/^\/([^/]+)\/_build/);
    if (vsMatch && vsPathMatch) {
      const org = vsMatch[1];
      const project = vsPathMatch[1];
      return `https://${org}.visualstudio.com/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.1`;
    }

    return null;
  } catch {
    return null;
  }
}

export function UploadPage({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const { loadTimeline } = useTimeline();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [buildUrl, setBuildUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const timelineUrl = buildTimelineUrl(buildUrl);

  const copyTimelineUrl = useCallback(() => {
    if (!timelineUrl) return;
    navigator.clipboard.writeText(timelineUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [timelineUrl]);

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
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
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
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  /_apis/build/builds/&#123;buildId&#125;/timeline?api-version=7.1
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

        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-medium">
              Don&apos;t have the timeline JSON? Paste your build URL to get the
              download link:
            </p>
            <Input
              type="url"
              placeholder="https://dev.azure.com/{org}/{project}/_build/results?buildId={id}"
              value={buildUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBuildUrl(e.target.value)}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
            {buildUrl && timelineUrl && (
              <div className="flex items-center gap-2">
                <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate">
                  {timelineUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    copyTimelineUrl();
                  }}
                  aria-label="Copy timeline URL"
                >
                  {copied ? (
                    <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <RiFileCopyLine className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
            {buildUrl && !timelineUrl && (
              <p className="text-sm text-destructive">
                Could not parse the build URL. Expected a URL like:{" "}
                <code className="text-xs">
                  https://dev.azure.com/&#123;org&#125;/&#123;project&#125;/_build/results?buildId=&#123;id&#125;
                </code>
              </p>
            )}
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
      <footer className="absolute bottom-0 left-0 right-0 flex justify-center py-4">
        <a
          href="https://github.com/lbussell/azure-pipelines-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RiGithubLine className="h-4 w-4" />
          View on GitHub
        </a>
      </footer>
    </div>
  );
}
