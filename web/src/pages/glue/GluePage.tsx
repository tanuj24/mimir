import { useState } from "react";
import { Workflow, NotebookPen, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { JobsTab } from "./JobsTab";
import { NotebookTab } from "./NotebookTab";
import { CatalogTab } from "./CatalogTab";

type Tab = "jobs" | "notebooks" | "catalog";
const TABS: { id: Tab; label: string; icon: typeof Workflow }[] = [
  { id: "jobs", label: "ETL jobs", icon: Workflow },
  { id: "notebooks", label: "Notebooks", icon: NotebookPen },
  { id: "catalog", label: "Data Catalog", icon: BookOpen },
];

export function GluePage() {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div>
      <PageHeader
        title="AWS Glue"
        subtitle="ETL jobs, interactive notebooks, and the Data Catalog"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Glue" }]}
      />

      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? "border-floci text-floci" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" && <JobsTab />}
      {tab === "notebooks" && <NotebookTab />}
      {tab === "catalog" && <CatalogTab />}
    </div>
  );
}
