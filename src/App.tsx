import { useState, useCallback } from "react";
import {
  RiSettings3Line,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimelineProvider, CategoriesProvider, useTimeline } from "@/contexts";
import { UploadPage } from "@/pages/upload-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ExplorerPage } from "@/pages/explorer-page";
import { RulesSheet } from "@/components/rules-sheet";

function AnalyzerPage() {
  const { tree, clearTimeline } = useTimeline();
  const [rulesOpen, setRulesOpen] = useState(false);
  const onUploaded = useCallback(() => {}, []);

  if (!tree) {
    return <UploadPage onUploaded={onUploaded} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-14 border-b bg-background shrink-0">
        <span className="font-semibold">Pipeline Analyzer</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setRulesOpen(true)}
          >
            <RiSettings3Line className="h-3.5 w-3.5 mr-1" />
            Manage Rules
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => clearTimeline()}
          >
            <RiUploadCloud2Line className="h-3.5 w-3.5 mr-1" />
            New File
          </Button>
        </div>
      </header>

      {/* Single scrollable page: dashboard metrics then explorer */}
      <main className="flex-1 overflow-auto">
        <DashboardPage />
        <div className="border-t">
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-2xl font-bold">Explorer</h2>
            <p className="text-muted-foreground text-sm">
              Pipeline timeline. Click bars to expand jobs into tasks. Use the tag icon to categorize.
            </p>
          </div>
          <ExplorerPage />
        </div>
      </main>

      {/* Rules sheet */}
      <RulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <TimelineProvider>
        <CategoriesProvider>
          <AnalyzerPage />
        </CategoriesProvider>
      </TimelineProvider>
    </TooltipProvider>
  );
}

export default App;