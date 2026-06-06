import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { SystemMonitor } from "./SystemMonitor";

export function AppShell() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-6 py-6">
            <Outlet />
          </div>
          <footer className="mx-auto max-w-[1400px] px-6 pb-6 pt-2 text-xs text-ink-500">
            <span className="font-medium text-ink-700">Mimir</span> · See your cloud, before you
            ship your cloud · Powered by{" "}
            <a href="https://floci.io" target="_blank" rel="noreferrer" className="link">
              Floci
            </a>
            . Mimir is an independent project and is not affiliated with or endorsed by Amazon Web
            Services.
          </footer>
        </main>
      </div>
      {/* Constant resource monitor, always visible across pages. */}
      <SystemMonitor />
    </div>
  );
}
