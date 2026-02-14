import { useState, useCallback } from "react";
import {
  RiDashboardLine,
  RiNodeTree,
  RiSettings3Line,
  RiUploadCloud2Line,
  RiMenuLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimelineProvider, CategoriesProvider, useTimeline } from "@/contexts";
import { UploadPage, DashboardPage, ExplorerPage, RulesPage } from "@/pages";

type Page = "upload" | "dashboard" | "explorer" | "rules";

const NAV_ITEMS: { id: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: RiDashboardLine },
  { id: "explorer", label: "Explorer", icon: RiNodeTree },
  { id: "rules", label: "Rules", icon: RiSettings3Line },
];

function AppShell() {
  const { tree, clearTimeline } = useTimeline();
  const [page, setPage] = useState<Page>(tree ? "dashboard" : "upload");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const onUploaded = useCallback(() => setPage("dashboard"), []);

  const handleNewFile = () => {
    clearTimeline();
    setPage("upload");
  };

  if (!tree && page !== "upload") {
    return <UploadPage onUploaded={onUploaded} />;
  }

  if (page === "upload") {
    return <UploadPage onUploaded={onUploaded} />;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-56" : "w-14"
        } border-r bg-sidebar flex flex-col transition-all duration-200 shrink-0`}
      >
        <div className="flex items-center gap-2 p-3 border-b h-14">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <RiMenuLine className="h-4 w-4" />
          </Button>
          {sidebarOpen && (
            <span className="font-semibold text-sm truncate">
              Pipeline Analyzer
            </span>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={page === id ? "secondary" : "ghost"}
              className={`w-full justify-start gap-2 ${
                sidebarOpen ? "" : "px-2"
              }`}
              size="sm"
              onClick={() => setPage(id)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && label}
            </Button>
          ))}
        </nav>

        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-start gap-2 ${
              sidebarOpen ? "" : "px-2"
            }`}
            onClick={handleNewFile}
          >
            <RiUploadCloud2Line className="h-4 w-4 shrink-0" />
            {sidebarOpen && "New File"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {page === "dashboard" && <DashboardPage />}
        {page === "explorer" && <ExplorerPage />}
        {page === "rules" && <RulesPage />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <TimelineProvider>
        <CategoriesProvider>
          <AppShell />
        </CategoriesProvider>
      </TimelineProvider>
    </TooltipProvider>
  );
}

export default App;