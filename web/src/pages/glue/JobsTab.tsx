import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Workflow, Play, Trash2, Plus, ChevronLeft, Save, FileCode2, Flame, Settings2, ListChecks } from "lucide-react";
import { glueApi, type GlueJob, type JobType, type JobRun, type JobConfig, JOB_TEMPLATES } from "./glueApi";
import { JobConfigForm } from "./JobConfigForm";
import { formatDate } from "@/lib/format";
import {
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  StatusBadge,
  useToast,
  type Column,
} from "@/components/ui";

function TypeBadge({ type }: { type: JobType }) {
  return type === "glueetl" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#8c4fff]/10 px-2 py-0.5 text-xs font-medium text-[#8c4fff]">
      <Flame className="h-3 w-3" /> Spark
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-link/10 px-2 py-0.5 text-xs font-medium text-link">
      <FileCode2 className="h-3 w-3" /> Python shell
    </span>
  );
}

function JobDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [sub, setSub] = useState<"script" | "details" | "runs">("script");
  const [script, setScript] = useState("");
  const [config, setConfig] = useState<JobConfig | null>(null);
  const [openRun, setOpenRun] = useState<JobRun | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ["glue", "job", name], queryFn: () => glueApi.job(name) });
  useEffect(() => {
    if (detail.data?.job) {
      setScript(detail.data.job.script);
      setConfig(detail.data.job.config);
    }
  }, [detail.data?.job.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll runs while one is active.
  const runs = useQuery({
    queryKey: ["glue", "runs", name],
    queryFn: () => glueApi.runs(name),
    refetchInterval: activeRunId ? 1500 : false,
  });
  useEffect(() => {
    const active = runs.data?.runs.find((r) => r.id === activeRunId);
    if (active && active.status !== "RUNNING") setActiveRunId(null);
  }, [runs.data, activeRunId]);

  const save = useMutation({
    mutationFn: () =>
      glueApi.saveJob({ name, type: detail.data!.job.type, script, config: config ?? undefined }),
    onSuccess: () => {
      notify("success", "Job saved");
      qc.invalidateQueries({ queryKey: ["glue", "job", name] });
      qc.invalidateQueries({ queryKey: ["glue", "jobs"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const run = useMutation({
    // Persist edits first so the run uses the latest script + config.
    mutationFn: async () => {
      await glueApi.saveJob({ name, type: detail.data!.job.type, script, config: config ?? undefined });
      return glueApi.runJob(name);
    },
    onSuccess: (r) => {
      notify("success", "Run started");
      setActiveRunId(r.run.id);
      setSub("runs");
      qc.invalidateQueries({ queryKey: ["glue", "runs", name] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const job = detail.data?.job;

  const runCols: Column<JobRun>[] = [
    { key: "id", header: "Run ID", render: (r) => <button className="link font-mono text-xs" onClick={() => setOpenRun(r)}>{r.id.slice(0, 14)}…</button> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "started", header: "Started", render: (r) => formatDate(r.startedOn) },
    { key: "dur", header: "Duration", render: (r) => (r.executionTimeMs != null ? `${(r.executionTimeMs / 1000).toFixed(2)}s` : "—") },
    { key: "view", header: "", className: "text-right", render: (r) => <button className="link text-xs" onClick={() => setOpenRun(r)}>View logs</button> },
  ];

  const SUBS = [
    { id: "script" as const, label: "Script", icon: FileCode2 },
    { id: "details" as const, label: "Job details", icon: Settings2 },
    { id: "runs" as const, label: "Runs", icon: ListChecks },
  ];

  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-sm link" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> Back to jobs
      </button>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{name}</h2>
          {job && <TypeBadge type={job.type} />}
        </div>
        <div className="flex gap-2">
          <button className="btn-default" disabled={save.isPending} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> Save
          </button>
          <button className="btn-primary" disabled={run.isPending || !!activeRunId} onClick={() => run.mutate()}>
            <Play className="h-4 w-4" /> {activeRunId ? "Running…" : "Run job"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {SUBS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium ${
              sub === t.id ? "border-floci text-floci" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {sub === "script" && (
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-canvas/60 px-3 py-1.5 text-xs font-medium text-ink-500">
            {job?.type === "glueetl" ? "PySpark script (spark-submit)" : "Python script"}
          </div>
          <textarea
            className="min-h-[520px] w-full resize-y bg-squid-900 p-3 font-mono text-xs leading-relaxed text-green-100 outline-none"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {sub === "details" &&
        (config && job ? (
          <JobConfigForm type={job.type} config={config} onChange={setConfig} />
        ) : (
          <LoadingBlock />
        ))}

      {sub === "runs" && (
        <div className="card">
          <p className="border-b border-line px-3 py-2 text-sm font-medium">Run history</p>
          {runs.isLoading ? (
            <LoadingBlock />
          ) : (
            <DataTable
              columns={runCols}
              rows={runs.data?.runs ?? []}
              rowKey={(r) => r.id}
              empty={<EmptyState icon={Play} title="No runs yet" description="Run the job to see results here." />}
            />
          )}
        </div>
      )}

      <Modal open={!!openRun} title={`Run ${openRun?.id.slice(0, 14)}…`} onClose={() => setOpenRun(null)} wide footer={<button className="btn-default" onClick={() => setOpenRun(null)}>Close</button>}>
        <div className="mb-2 flex items-center gap-3 text-sm">
          <StatusBadge status={openRun?.status} />
          {openRun?.executionTimeMs != null && <span className="text-ink-500">{(openRun.executionTimeMs / 1000).toFixed(2)}s</span>}
        </div>
        {openRun?.errorMessage && <p className="mb-2 text-sm text-danger">{openRun.errorMessage}</p>}
        <pre className="max-h-[50vh] overflow-auto rounded-lg bg-squid-900 p-3 font-mono text-xs text-green-100">
          {openRun?.logs || "(no output)"}
        </pre>
      </Modal>
    </div>
  );
}

export function JobsTab() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; type: JobType }>({ name: "", type: "pythonshell" });
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["glue", "jobs"], queryFn: glueApi.jobs });

  const create = useMutation({
    mutationFn: () =>
      glueApi.saveJob({ name: form.name.trim(), type: form.type, script: JOB_TEMPLATES[form.type] }),
    onSuccess: (r) => {
      notify("success", "Job created");
      qc.invalidateQueries({ queryKey: ["glue", "jobs"] });
      setCreateOpen(false);
      setForm({ name: "", type: "pythonshell" });
      setSelected(r.job.name);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => glueApi.deleteJob(n),
    onSuccess: () => {
      notify("success", "Job deleted");
      qc.invalidateQueries({ queryKey: ["glue", "jobs"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  if (selected) return <JobDetail name={selected} onBack={() => setSelected(null)} />;

  const columns: Column<GlueJob>[] = [
    { key: "name", header: "Job name", render: (j) => <button className="link font-medium" onClick={() => setSelected(j.name)}>{j.name}</button> },
    { key: "type", header: "Type", render: (j) => <TypeBadge type={j.type} /> },
    { key: "version", header: "Glue version", render: (j) => j.glueVersion },
    { key: "modified", header: "Last modified", render: (j) => formatDate(j.lastModifiedOn) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (j) => (
        <div className="flex justify-end gap-1">
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(j.name)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          ETL jobs run <strong>locally in Docker</strong> ({data?.engine.PYTHON_IMAGE} · {data?.engine.SPARK_IMAGE}) — Floci has no Glue job API.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create job
        </button>
      </div>
      <div className="card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.jobs ?? []}
            rowKey={(j) => j.name}
            empty={<EmptyState icon={Workflow} title="No jobs" description="Create a Spark or Python shell ETL job." action={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create job</button>} />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create job"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>Create &amp; edit</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Job name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="daily-etl" autoFocus />
          </div>
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["pythonshell", "glueetl"] as JobType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.type === t ? "border-floci bg-floci/5 text-floci" : "border-line hover:bg-canvas"}`}
                >
                  {t === "glueetl" ? <Flame className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
                  {t === "glueetl" ? "Spark (PySpark)" : "Python shell"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-ink-500">A starter script will be created; you can edit and run it next.</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete job"
        message={<>Delete job <strong>{toDelete}</strong> and its run history?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
