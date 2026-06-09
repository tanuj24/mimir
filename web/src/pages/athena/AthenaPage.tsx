import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Loader2,
  History,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { athenaApi, type QueryExecution, type AthenaTable } from "./athenaApi";
import {
  PageHeader,
  LoadingBlock,
  ErrorState,
  EmptyState,
  CodeEditor,
  useToast,
  type Column,
  type EditorInstance,
  type MonacoInstance,
  DataTable,
} from "@/components/ui";
import { formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// SQL statement extraction — finds the statement the cursor is in (bounded by
// semicolons), respecting single-quoted strings and -- / /* */ comments.
// ---------------------------------------------------------------------------
function extractStatementAtOffset(sql: string, offset: number): string {
  const stmts: { start: number; end: number; text: string }[] = [];
  let start = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    // Line comment
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // Single-quoted string
    if (ch === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") break;
        i++;
      }
      i++;
      continue;
    }
    // Statement boundary
    if (ch === ";") {
      stmts.push({ start, end: i, text: sql.slice(start, i).trim() });
      start = i + 1;
    }
    i++;
  }
  // Trailing statement without semicolon
  const tail = sql.slice(start).trim();
  if (tail) stmts.push({ start, end: sql.length, text: tail });

  // Find which segment the cursor is in
  let pos = 0;
  for (const s of stmts) {
    const segEnd = s.end + 1; // include the semicolon char
    if (offset >= pos && offset <= segEnd) return s.text;
    pos = segEnd;
  }
  return stmts[stmts.length - 1]?.text ?? sql.trim();
}

// ---------------------------------------------------------------------------
// Monaco SQL validation — marks empty statements and unmatched parens.
// ---------------------------------------------------------------------------
function validateSql(sql: string, monaco: MonacoInstance, model: ReturnType<EditorInstance["getModel"]>) {
  if (!model) return;
  const markers: Parameters<MonacoInstance["editor"]["setModelMarkers"]>[2] = [];

  // Check unmatched parentheses
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inStr) { inStr = true; continue; }
    if (ch === "'" && inStr) { inStr = false; continue; }
    if (inStr) continue;
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth < 0) {
        const pos = model.getPositionAt(i);
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: pos.lineNumber, startColumn: pos.column,
          endLineNumber: pos.lineNumber, endColumn: pos.column + 1,
          message: "Unmatched closing parenthesis",
        });
        depth = 0;
      }
    }
  }
  if (depth > 0) {
    const last = model.getPositionAt(sql.length);
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: last.lineNumber, startColumn: 1,
      endLineNumber: last.lineNumber, endColumn: last.column,
      message: `${depth} unclosed parenthesis${depth > 1 ? "es" : ""}`,
    });
  }

  // Warn on empty statements (e.g. double semicolons: "SELECT 1;;")
  const stmts = sql.split(";");
  let offset = 0;
  for (let si = 0; si < stmts.length - 1; si++) {
    offset += stmts[si].length;
    if (stmts[si].trim() === "" && si > 0) {
      const pos = model.getPositionAt(offset);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: pos.lineNumber, startColumn: pos.column,
        endLineNumber: pos.lineNumber, endColumn: pos.column + 1,
        message: "Empty statement",
      });
    }
    offset++; // semicolon
  }

  monaco.editor.setModelMarkers(model, "athena", markers);
}

// ---- tiny helpers ----

function StateBadge({ state }: { state: QueryExecution["state"] | undefined }) {
  if (!state) return null;
  if (state === "SUCCEEDED")
    return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-ok/10 text-ok">SUCCEEDED</span>;
  if (state === "FAILED")
    return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-danger/10 text-danger">FAILED</span>;
  if (state === "CANCELLED")
    return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-ink-300/20 text-ink-500">CANCELLED</span>;
  return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-warn/10 text-warn">{state}</span>;
}

function fmtMs(ms?: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function fmtBytes(b?: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

function sqlSnippet(sql?: string, max = 72) {
  if (!sql) return "—";
  const s = sql.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ---- data catalog panel ----

function TableRow({ table }: { table: AthenaTable }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-canvas"
      >
        {open
          ? <ChevronDown className="h-3 w-3 flex-none text-ink-300" />
          : <ChevronRight className="h-3 w-3 flex-none text-ink-300" />}
        <Table2 className="h-3.5 w-3.5 flex-none text-mimir" />
        <span className="truncate font-mono text-xs text-ink-700">{table.name}</span>
      </button>
      {open && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-line pl-2 pb-1">
          {table.columns.map((c) => (
            <div key={c.name} className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-ink-700 truncate">{c.name}</span>
              <span className="font-mono text-xs text-ink-300 shrink-0">{c.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DbRow({
  name,
  active,
  onActivate,
}: {
  name: string;
  active: boolean;
  onActivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tablesQ = useQuery({
    queryKey: ["athena", "tables", name],
    queryFn: () => athenaApi.tables(name),
    enabled: open,
  });

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-canvas"
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 flex-none text-ink-300" />
            : <ChevronRight className="h-3.5 w-3.5 flex-none text-ink-300" />}
          <Database className="h-3.5 w-3.5 flex-none text-mimir" />
          <span className={`truncate text-sm font-medium ${active ? "text-mimir" : "text-ink-700"}`}>
            {name}
          </span>
        </button>
        <button
          onClick={onActivate}
          title={active ? "Active query context" : "Set as query context"}
          className={`mr-2 shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            active
              ? "bg-mimir text-white"
              : "border border-line text-ink-500 hover:border-mimir hover:text-mimir"
          }`}
        >
          {active ? "active" : "use"}
        </button>
      </div>

      {open && (
        <div className="ml-3 mb-1">
          {tablesQ.isLoading ? (
            <p className="px-3 py-1 text-xs text-ink-300">Loading…</p>
          ) : (tablesQ.data?.tables ?? []).length === 0 ? (
            <p className="px-3 py-1 text-xs text-ink-300">No tables</p>
          ) : (
            (tablesQ.data?.tables ?? []).map((t) => (
              <TableRow key={t.name} table={t} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- results table ----

function QueryResultsTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0)
    return (
      <p className="px-4 py-8 text-center text-sm text-ink-500">
        Query returned no columns.
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line bg-canvas">
            {columns.map((c, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-left font-medium text-ink-700"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-sm text-ink-500">
                No rows returned.
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-b border-line/60 hover:bg-canvas/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="whitespace-nowrap px-3 py-1.5 font-mono text-ink-900">
                    {cell === "" ? (
                      <span className="text-ink-300 italic">NULL</span>
                    ) : (
                      cell
                    )}
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

// ---- history ----

function HistoryTable({
  onSelect,
}: {
  onSelect: (sql: string, db?: string) => void;
}) {
  const q = useQuery({
    queryKey: ["athena", "history"],
    queryFn: athenaApi.listQueries,
    refetchInterval: 6000,
  });

  const sorted = [...(q.data?.executions ?? [])].sort(
    (a, b) =>
      new Date(b.submittedAt ?? 0).getTime() -
      new Date(a.submittedAt ?? 0).getTime(),
  );

  const columns: Column<QueryExecution>[] = [
    {
      key: "state",
      header: "Status",
      render: (e) => <StateBadge state={e.state} />,
    },
    {
      key: "sql",
      header: "Query",
      render: (e) => (
        <button
          className="link text-left font-mono text-xs"
          onClick={() => onSelect(e.sql ?? "", e.database)}
        >
          {sqlSnippet(e.sql)}
        </button>
      ),
    },
    {
      key: "database",
      header: "Database",
      render: (e) => (
        <span className="font-mono text-xs text-ink-500">{e.database ?? "—"}</span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (e) => fmtMs(e.executionMs),
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (e) => formatDate(e.submittedAt ?? ""),
    },
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-ink-500" />
          <span className="font-medium">Recent queries</span>
        </div>
        <button
          className="btn-default py-1 text-xs"
          onClick={() => q.refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(e) => e.id}
          empty={
            <EmptyState
              icon={History}
              title="No queries yet"
              description="Run a query above to see history here."
            />
          }
        />
      )}
    </div>
  );
}

// ---- main page ----

const SAMPLES = [
  { label: "Show databases", sql: "SHOW DATABASES;" },
  { label: "Show tables",    sql: "SHOW TABLES;" },
  { label: "Query users",    sql: 'SELECT * FROM "mimir_sample_db"."users" LIMIT 10;' },
  { label: "Query orders",   sql: 'SELECT * FROM "mimir_sample_db"."orders" LIMIT 10;' },
];

export function AthenaPage() {
  const { notify } = useToast();
  const [sql, setSql] = useState(
    'SELECT * FROM "mimir_sample_db"."users" LIMIT 10;\n\nSELECT * FROM "mimir_sample_db"."orders" LIMIT 10;',
  );
  const [database, setDatabase] = useState<string | undefined>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [result, setResult] = useState<QueryExecution | null>(null);
  const [polling, setPolling] = useState(false);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);

  const dbQ = useQuery({
    queryKey: ["athena", "databases"],
    queryFn: athenaApi.databases,
  });

  const poll = useCallback(async (id: string) => {
    try {
      const res = await athenaApi.getQuery(id);
      setResult(res);
      if (res.state !== "RUNNING" && res.state !== "QUEUED") {
        setPolling(false);
        setRunning(false);
      }
    } catch {
      setPolling(false);
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (polling && activeId) {
      pollRef.current = setInterval(() => poll(activeId), 1500);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [polling, activeId, poll]);

  // Extract the SQL statement to run: selected text > statement at cursor > full text.
  function getStatementToRun(): string {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (editor && model) {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) return model.getValueInRange(sel).trim();
      const pos = editor.getPosition();
      if (pos) return extractStatementAtOffset(sql, model.getOffsetAt(pos));
    }
    return sql.trim();
  }

  async function runQuery(sqlOverride?: string) {
    const sqlToRun = (sqlOverride ?? getStatementToRun()).trim().replace(/;+$/, "").trim();
    if (!sqlToRun || running) return;
    setRunning(true);
    setResult(null);
    try {
      const { queryExecutionId } = await athenaApi.startQuery(sqlToRun, database);
      setActiveId(queryExecutionId);
      setResult({ id: queryExecutionId, sql: sqlToRun, state: "RUNNING", database });
      setPolling(true);
    } catch (e) {
      notify("error", (e as Error).message);
      setRunning(false);
    }
  }

  async function cancelQuery() {
    if (!activeId) return;
    try {
      await athenaApi.stopQuery(activeId);
      setPolling(false);
      setRunning(false);
      setResult((r) => r ? { ...r, state: "CANCELLED" } : r);
    } catch {
      //
    }
  }

  const databases = dbQ.data?.databases ?? [];

  return (
    <div>
      <PageHeader
        title="Amazon Athena"
        subtitle="Interactive query editor — run SQL against Glue catalog tables"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Athena" }]}
      />

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* ---- left: data catalog ---- */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <HardDrive className="h-4 w-4 text-ink-500" />
            <span className="text-sm font-medium text-ink-700">Data catalog</span>
          </div>
          <div className="p-1">
            {dbQ.isLoading ? (
              <LoadingBlock />
            ) : dbQ.error ? (
              <ErrorState error={dbQ.error} onRetry={dbQ.refetch} />
            ) : databases.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No databases"
                description="Create one in Glue first."
              />
            ) : (
              databases.map((db) => (
                <DbRow
                  key={db.name}
                  name={db.name}
                  active={database === db.name}
                  onActivate={() =>
                    setDatabase((c) => (c === db.name ? undefined : db.name))
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* ---- right: editor + results ---- */}
        <div className="space-y-4">
          {/* query editor card */}
          <div className="card overflow-hidden">
            {/* toolbar */}
            <div className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-ink-700 whitespace-nowrap">
                  Database context
                </label>
                <select
                  className="input w-48 py-1 text-xs"
                  value={database ?? ""}
                  onChange={(e) => setDatabase(e.target.value || undefined)}
                >
                  <option value="">— none —</option>
                  {databases.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1" />
              <span className="text-xs text-ink-300">Sample queries:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSql(s.sql)}
                  className="rounded border border-line bg-white px-2 py-0.5 text-xs text-ink-500 hover:border-mimir hover:text-mimir"
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* SQL editor */}
            <CodeEditor
              value={sql}
              onChange={(v) => {
                setSql(v);
                // Re-validate on change
                const model = editorRef.current?.getModel();
                const monaco = monacoRef.current;
                if (model && monaco) validateSql(v, monaco, model);
              }}
              onSubmit={() => { if (!running) runQuery(); }}
              onEditorMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
                // Initial validation pass
                validateSql(sql, monaco, editor.getModel());
                // Configure SQL-specific editor options
                editor.updateOptions({ wordWrap: "on" });
              }}
              language="sql"
              minHeight={240}
            />

            {/* run bar */}
            <div className="flex items-center justify-between border-t border-line px-3 py-2">
              <span className="text-xs text-ink-500">
                ⌘/Ctrl+Enter runs statement at cursor · select text to run a specific range · separate statements with <code>;</code>
              </span>
              <div className="flex gap-2">
                {running && (
                  <button className="btn-danger" onClick={cancelQuery}>
                    <Square className="h-4 w-4" /> Cancel
                  </button>
                )}
                <button
                  className="btn-primary"
                  disabled={!sql.trim() || running}
                  onClick={() => runQuery()}
                >
                  {running ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                  ) : (
                    <><Play className="h-4 w-4" /> Run query</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* results card */}
          {result ? (
            <div className="card overflow-hidden">
              {/* meta bar */}
              <div className="flex flex-wrap items-center gap-4 border-b border-line bg-canvas px-4 py-2 text-xs text-ink-500">
                <StateBadge state={result.state} />
                {result.executionMs !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {fmtMs(result.executionMs)}
                  </span>
                )}
                {result.scannedBytes !== undefined && (
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" /> {fmtBytes(result.scannedBytes)} scanned
                  </span>
                )}
                {result.results && (
                  <span>{result.results.rows.length} row{result.results.rows.length !== 1 ? "s" : ""}</span>
                )}
                <span className="ml-auto font-mono text-ink-300">{result.id}</span>
              </div>

              {result.state === "RUNNING" || result.state === "QUEUED" ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
                  <Loader2 className="h-5 w-5 animate-spin text-mimir" />
                  Executing query…
                </div>
              ) : result.state === "FAILED" ? (
                <div className="m-4 rounded-lg border border-danger/30 bg-danger/5 p-4 font-mono text-sm text-danger">
                  {result.error ?? "Query failed."}
                </div>
              ) : result.state === "CANCELLED" ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
                  Query was cancelled.
                </div>
              ) : result.state === "SUCCEEDED" && result.results ? (
                <QueryResultsTable
                  columns={result.results.columns}
                  rows={result.results.rows}
                />
              ) : result.state === "SUCCEEDED" ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
                  <CheckCircle2 className="h-5 w-5 text-ok" />
                  Query succeeded with no output rows.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card">
              <EmptyState
                icon={Search}
                title="No query run yet"
                description="Write SQL in the editor above and click Run query."
              />
            </div>
          )}

          {/* history */}
          <HistoryTable
            onSelect={(s, db) => {
              setSql(s);
              if (db) setDatabase(db);
            }}
          />
        </div>
      </div>
    </div>
  );
}
