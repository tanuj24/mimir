import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  Play,
  Square,
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  HardDrive,
} from "lucide-react";
import { athenaApi, type QueryExecution, type AthenaTable } from "./athenaApi";
import { PageHeader, LoadingBlock, ErrorState, EmptyState, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";

// ---- helpers ----

function StateIcon({ state }: { state: QueryExecution["state"] | undefined }) {
  if (!state || state === "QUEUED" || state === "RUNNING")
    return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
  if (state === "SUCCEEDED") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  return <XCircle className="h-4 w-4 text-danger" />;
}

function StateBadge({ state }: { state: QueryExecution["state"] | undefined }) {
  const base = "rounded px-1.5 py-0.5 text-xs font-medium";
  if (!state) return null;
  if (state === "SUCCEEDED") return <span className={`${base} bg-green-100 text-green-700`}>SUCCEEDED</span>;
  if (state === "FAILED") return <span className={`${base} bg-red-100 text-danger`}>FAILED</span>;
  if (state === "CANCELLED") return <span className={`${base} bg-ink-100 text-ink-500`}>CANCELLED</span>;
  return <span className={`${base} bg-amber-100 text-amber-700`}>{state}</span>;
}

function fmtMs(ms?: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtBytes(b?: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function sqlPreview(sql?: string, max = 80) {
  if (!sql) return "—";
  const s = sql.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ---- left panel: database + table browser ----

function TableTree({ table }: { db: string; table: AthenaTable }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs text-ink-700 hover:bg-surface-raised"
      >
        {open ? <ChevronDown className="h-3 w-3 flex-none" /> : <ChevronRight className="h-3 w-3 flex-none" />}
        <Table2 className="h-3 w-3 flex-none text-mimir" />
        <span className="truncate font-mono">{table.name}</span>
      </button>
      {open && (
        <div className="ml-6 border-l border-line pl-2">
          {table.columns.map((c) => (
            <div key={c.name} className="flex items-baseline gap-1 py-0.5">
              <span className="font-mono text-xs text-ink-800 truncate">{c.name}</span>
              <span className="font-mono text-xs text-ink-400 shrink-0">{c.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DatabaseTree({
  db,
  selected,
  onSelect,
}: {
  db: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tablesQ = useQuery({
    queryKey: ["athena", "tables", db],
    queryFn: () => athenaApi.tables(db),
    enabled: open,
  });

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-raised"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 flex-none text-ink-400" /> : <ChevronRight className="h-3.5 w-3.5 flex-none text-ink-400" />}
          <Database className="h-3.5 w-3.5 flex-none text-mimir" />
          <span className={`truncate font-medium text-xs ${selected ? "text-mimir" : "text-ink-800"}`}>{db}</span>
        </button>
        <button
          onClick={onSelect}
          title="Use as query context"
          className={`mr-1 rounded px-1.5 py-0.5 text-xs ${selected ? "bg-mimir text-white" : "text-ink-500 hover:bg-surface-raised"}`}
        >
          {selected ? "active" : "use"}
        </button>
      </div>
      {open && (
        <div className="ml-3">
          {tablesQ.isLoading ? (
            <p className="px-2 py-1 text-xs text-ink-400">Loading…</p>
          ) : (tablesQ.data?.tables ?? []).length === 0 ? (
            <p className="px-2 py-1 text-xs text-ink-400">No tables</p>
          ) : (
            (tablesQ.data?.tables ?? []).map((t) => (
              <TableTree key={t.name} db={db} table={t} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- results table ----

function ResultsTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0) return <p className="px-4 py-6 text-center text-sm text-ink-400">Query returned no columns.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-raised">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium text-ink-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-ink-400">
                No rows returned.
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-b border-line/50 hover:bg-surface-raised/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="whitespace-nowrap px-3 py-1.5 font-mono text-ink-800">
                    {cell === "" ? <span className="text-ink-300">NULL</span> : cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- history panel ----

function HistoryPanel({
  onSelect,
}: {
  onSelect: (sql: string, db?: string) => void;
}) {
  const q = useQuery({
    queryKey: ["athena", "history"],
    queryFn: athenaApi.listQueries,
    refetchInterval: 5000,
  });

  const sorted = [...(q.data?.executions ?? [])].sort(
    (a, b) =>
      (b.submittedAt ? new Date(b.submittedAt).getTime() : 0) -
      (a.submittedAt ? new Date(a.submittedAt).getTime() : 0),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <History className="h-4 w-4 text-ink-400" />
        <span className="text-xs font-medium text-ink-700">Recent queries</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="p-4"><LoadingBlock /></div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={History} title="No queries yet" description="Run a query to see history." />
        ) : (
          sorted.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex.sql ?? "", ex.database)}
              className="w-full border-b border-line/50 px-3 py-2 text-left hover:bg-surface-raised"
            >
              <div className="mb-1 flex items-center gap-2">
                <StateIcon state={ex.state} />
                <StateBadge state={ex.state} />
                {ex.database && (
                  <span className="font-mono text-xs text-ink-400">{ex.database}</span>
                )}
                <span className="ml-auto text-xs text-ink-400">{fmtMs(ex.executionMs)}</span>
              </div>
              <p className="truncate font-mono text-xs text-ink-600">{sqlPreview(ex.sql)}</p>
              <p className="mt-0.5 text-xs text-ink-400">
                {ex.submittedAt ? formatDate(new Date(ex.submittedAt).toISOString()) : "—"}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---- main page ----

const SAMPLE_QUERIES = [
  { label: "List S3 buckets", sql: "SHOW DATABASES" },
  { label: "Show tables", sql: "SHOW TABLES" },
  { label: "Select from users", sql: 'SELECT * FROM "mimir_sample_db"."users" LIMIT 10' },
];

export function AthenaPage() {
  const { notify } = useToast();
  const [sql, setSql] = useState('SELECT * FROM "mimir_sample_db"."users" LIMIT 10');
  const [database, setDatabase] = useState<string | undefined>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [result, setResult] = useState<QueryExecution | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dbQ = useQuery({
    queryKey: ["athena", "databases"],
    queryFn: athenaApi.databases,
  });

  const startMutation = useMutation({
    mutationFn: () => athenaApi.startQuery(sql, database),
    onSuccess: ({ queryExecutionId }) => {
      setActiveId(queryExecutionId);
      setResult({ id: queryExecutionId, sql, state: "RUNNING", database });
      setPolling(true);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const stopMutation = useMutation({
    mutationFn: () => athenaApi.stopQuery(activeId!),
    onSuccess: () => {
      setPolling(false);
      setResult((r) => r ? { ...r, state: "CANCELLED" } : r);
    },
  });

  const poll = useCallback(async (id: string) => {
    try {
      const res = await athenaApi.getQuery(id);
      setResult(res);
      if (res.state !== "RUNNING" && res.state !== "QUEUED") {
        setPolling(false);
      }
    } catch {
      setPolling(false);
    }
  }, []);

  useEffect(() => {
    if (polling && activeId) {
      pollRef.current = setInterval(() => poll(activeId), 1500);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [polling, activeId, poll]);

  const running = polling || startMutation.isPending;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title="Amazon Athena"
        subtitle="Query S3 data with standard SQL — powered by the Glue Data Catalog"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Athena" }]}
      />

      <div className="flex min-h-0 flex-1 gap-0">
        {/* ---- left: database / table tree ---- */}
        <div className="flex w-56 flex-none flex-col border-r border-line bg-surface-raised">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <HardDrive className="h-4 w-4 text-ink-400" />
            <span className="text-xs font-medium text-ink-700">Data catalog</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {dbQ.isLoading ? (
              <div className="p-3"><LoadingBlock /></div>
            ) : dbQ.error ? (
              <ErrorState error={dbQ.error} onRetry={dbQ.refetch} />
            ) : (dbQ.data?.databases ?? []).length === 0 ? (
              <EmptyState icon={Database} title="No databases" description="Create a Glue database first." />
            ) : (
              (dbQ.data?.databases ?? []).map((db) => (
                <DatabaseTree
                  key={db.name}
                  db={db.name}
                  selected={database === db.name}
                  onSelect={() => setDatabase((cur) => cur === db.name ? undefined : db.name)}
                />
              ))
            )}
          </div>
        </div>

        {/* ---- center: editor + results ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* toolbar */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            {database && (
              <div className="flex items-center gap-1 rounded bg-mimir/10 px-2 py-0.5 text-xs font-medium text-mimir">
                <Database className="h-3 w-3" />
                {database}
                <button onClick={() => setDatabase(undefined)} className="ml-1 text-ink-400 hover:text-danger">×</button>
              </div>
            )}
            <div className="flex-1" />
            <div className="flex gap-1">
              {SAMPLE_QUERIES.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setSql(q.sql)}
                  className="rounded border border-line px-2 py-0.5 text-xs text-ink-500 hover:border-mimir hover:text-mimir"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* sql editor */}
          <div className="relative border-b border-line">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              spellCheck={false}
              rows={7}
              className="w-full resize-none bg-transparent p-3 font-mono text-sm text-ink-900 outline-none placeholder:text-ink-300"
              placeholder="SELECT * FROM my_table LIMIT 10"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (!running && sql.trim()) startMutation.mutate();
                }
              }}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              <span className="text-xs text-ink-400">⌘↵ to run</span>
              {running ? (
                <button
                  onClick={() => stopMutation.mutate()}
                  className="flex items-center gap-1.5 rounded bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/80"
                >
                  <Square className="h-3.5 w-3.5" /> Cancel
                </button>
              ) : (
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={!sql.trim()}
                  className="flex items-center gap-1.5 rounded bg-mimir px-3 py-1.5 text-xs font-medium text-white hover:bg-mimir/80 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" /> Run query
                </button>
              )}
            </div>
          </div>

          {/* results area */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!result ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={Search}
                  title="No query run yet"
                  description="Write SQL above and click Run query — results appear here."
                />
              </div>
            ) : (
              <>
                {/* result meta bar */}
                <div className="flex items-center gap-4 border-b border-line bg-surface-raised px-3 py-1.5 text-xs text-ink-500">
                  <div className="flex items-center gap-1.5">
                    <StateIcon state={result.state} />
                    <StateBadge state={result.state} />
                  </div>
                  {result.executionMs !== undefined && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {fmtMs(result.executionMs)}
                    </span>
                  )}
                  {result.scannedBytes !== undefined && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> {fmtBytes(result.scannedBytes)} scanned
                    </span>
                  )}
                  {result.results && (
                    <span className="text-ink-400">
                      {result.results.rows.length} row{result.results.rows.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {result.id && (
                    <span className="ml-auto font-mono text-ink-300">{result.id}</span>
                  )}
                </div>

                {/* query still running */}
                {(result.state === "RUNNING" || result.state === "QUEUED") && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
                    <Loader2 className="h-5 w-5 animate-spin text-mimir" />
                    Query is running…
                  </div>
                )}

                {/* error */}
                {result.state === "FAILED" && result.error && (
                  <div className="m-4 rounded border border-danger/30 bg-danger/5 p-4 font-mono text-sm text-danger">
                    {result.error}
                  </div>
                )}

                {/* results table */}
                {result.state === "SUCCEEDED" && result.results && (
                  <ResultsTable columns={result.results.columns} rows={result.results.rows} />
                )}

                {result.state === "SUCCEEDED" && !result.results && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-400">
                    <CheckCircle2 className="h-5 w-5 text-green-500" /> Query succeeded with no results.
                  </div>
                )}

                {result.state === "CANCELLED" && (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-400">
                    Query was cancelled.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---- right: history ---- */}
        <div className="w-64 flex-none border-l border-line">
          <HistoryPanel
            onSelect={(sql, db) => {
              setSql(sql);
              if (db) setDatabase(db);
            }}
          />
        </div>
      </div>
    </div>
  );
}
