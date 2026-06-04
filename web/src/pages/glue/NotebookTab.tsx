import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Plus, Trash2, ChevronLeft, Play, Flame, FileCode2, Circle } from "lucide-react";
import { glueApi, type GlueSession, type Statement } from "./glueApi";
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

function Notebook({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [code, setCode] = useState("");

  const detail = useQuery({
    queryKey: ["glue", "session", id],
    queryFn: () => glueApi.session(id),
    refetchInterval: (q) => (q.state.data?.session.status === "PROVISIONING" ? 1500 : false),
  });

  const runCell = useMutation({
    mutationFn: () => glueApi.runStatement(id, code),
    onSuccess: () => {
      setCode("");
      qc.invalidateQueries({ queryKey: ["glue", "session", id] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const status = detail.data?.session.status;
  const ready = status === "READY";

  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-sm link" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> Back to notebooks
      </button>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Notebook {id}</h2>
          {detail.data?.session.kind === "spark" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#8c4fff]/10 px-2 py-0.5 text-xs font-medium text-[#8c4fff]"><Flame className="h-3 w-3" /> Spark</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-link/10 px-2 py-0.5 text-xs font-medium text-link"><FileCode2 className="h-3 w-3" /> Python</span>
          )}
          <span className="flex items-center gap-1 text-xs text-ink-500">
            <Circle className={`h-2 w-2 ${ready ? "fill-ok text-ok" : "fill-warn text-warn"}`} />
            {status === "PROVISIONING" ? "Starting kernel…" : status}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {(detail.data?.statements ?? []).map((s: Statement) => (
          <div key={s.id} className="card overflow-hidden">
            <div className="flex items-stretch">
              <div className="w-12 shrink-0 select-none border-r border-line bg-canvas/60 py-2 text-center font-mono text-xs text-ink-300">
                [{s.id}]
              </div>
              <pre className="flex-1 overflow-x-auto bg-squid-900 p-3 font-mono text-xs text-green-100">{s.code}</pre>
            </div>
            {s.output && (
              <pre className={`max-h-80 overflow-auto border-t border-line p-3 font-mono text-xs ${s.ok ? "text-ink-900" : "text-danger"}`}>
                {s.output}
              </pre>
            )}
          </div>
        ))}

        {/* input cell */}
        <div className="card overflow-hidden">
          <div className="flex items-stretch">
            <div className="w-12 shrink-0 select-none border-r border-line bg-canvas/60 py-2 text-center font-mono text-xs text-floci">
              [ ]
            </div>
            <textarea
              className="min-h-[120px] flex-1 resize-y bg-squid-900 p-3 font-mono text-xs leading-relaxed text-green-100 outline-none"
              placeholder={ready ? "Type Python code and press ⌘/Ctrl+Enter to run…" : "Waiting for kernel…"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && code.trim() && ready) runCell.mutate();
              }}
              spellCheck={false}
            />
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <span className="text-xs text-ink-500">⌘/Ctrl + Enter to run · state persists across cells</span>
            <button className="btn-primary" disabled={!code.trim() || !ready || runCell.isPending} onClick={() => runCell.mutate()}>
              <Play className="h-4 w-4" /> {runCell.isPending ? "Running…" : "Run cell"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotebookTab() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<"python" | "spark">("python");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["glue", "sessions"],
    queryFn: glueApi.sessions,
    refetchInterval: 4000,
  });

  const create = useMutation({
    mutationFn: () => glueApi.createSession(kind),
    onSuccess: (r) => {
      notify("success", "Notebook session started");
      qc.invalidateQueries({ queryKey: ["glue", "sessions"] });
      setCreateOpen(false);
      setOpen(r.session.id);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => glueApi.deleteSession(id),
    onSuccess: () => {
      notify("success", "Session stopped");
      qc.invalidateQueries({ queryKey: ["glue", "sessions"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  if (open) return <Notebook id={open} onBack={() => setOpen(null)} />;

  const columns: Column<GlueSession>[] = [
    { key: "id", header: "Session", render: (s) => <button className="link font-mono font-medium" onClick={() => setOpen(s.id)}>{s.id}</button> },
    { key: "kind", header: "Kernel", render: (s) => (s.kind === "spark" ? "Spark (PySpark)" : "Python") },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    { key: "created", header: "Created", render: (s) => formatDate(s.createdOn) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (s) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(s.id)} title="Stop session">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Interactive notebooks run in a <strong>live local kernel</strong> (stateful across cells) — Floci has no Glue sessions API.</p>
        <button className="btn-primary shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New notebook
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
            rows={data?.sessions ?? []}
            rowKey={(s) => s.id}
            empty={<EmptyState icon={NotebookPen} title="No notebooks" description="Start an interactive session to run code cell by cell." action={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New notebook</button>} />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="New notebook session"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Starting…" : "Start session"}</button>
          </>
        }
      >
        <label className="label">Kernel</label>
        <div className="grid grid-cols-2 gap-2">
          {(["python", "spark"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${kind === k ? "border-floci bg-floci/5 text-floci" : "border-line hover:bg-canvas"}`}
            >
              {k === "spark" ? <Flame className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
              {k === "spark" ? "Spark (PySpark)" : "Python"}
            </button>
          ))}
        </div>
        {kind === "spark" && (
          <p className="mt-2 text-xs text-warn">Spark starts a JVM on first use — the kernel may take ~15–30s to become ready.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Stop session"
        message={<>Stop notebook session <strong>{toDelete}</strong>? Its kernel state will be lost.</>}
        confirmLabel="Stop"
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
