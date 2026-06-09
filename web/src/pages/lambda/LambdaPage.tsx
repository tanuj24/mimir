import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, RefreshCw, Trash2, Play, Plus } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { lambdaApi, RUNTIMES, ARCHITECTURES, runtimeDefaults, runtimeLanguage, type LambdaFn, type InvokeResult } from "./lambdaApi";
import { LambdaDetail } from "./LambdaDetail";
import { formatBytes, formatDate } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  CodeBlock,
  CodeEditor,
  useToast,
  type Column,
} from "@/components/ui";

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState("nodejs20.x");
  const [handler, setHandler] = useState(runtimeDefaults("nodejs20.x").handler);
  const [code, setCode] = useState(runtimeDefaults("nodejs20.x").code);
  const [architecture, setArchitecture] = useState("x86_64");
  const [memorySize, setMemorySize] = useState(128);
  const [timeout, setTimeout] = useState(3);
  const [ephemeral, setEphemeral] = useState(512);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [touchedCode, setTouchedCode] = useState(false);

  function reset() {
    setName("");
    setRuntime("nodejs20.x");
    setHandler(runtimeDefaults("nodejs20.x").handler);
    setCode(runtimeDefaults("nodejs20.x").code);
    setArchitecture("x86_64");
    setMemorySize(128);
    setTimeout(3);
    setEphemeral(512);
    setDescription("");
    setFile(null);
    setTouchedCode(false);
  }

  function pickRuntime(rt: string) {
    setRuntime(rt);
    const d = runtimeDefaults(rt);
    setHandler(d.handler);
    // Only overwrite the editor if the user hasn't customized it.
    if (!touchedCode) setCode(d.code);
  }

  const create = useMutation({
    mutationFn: () =>
      lambdaApi.create({
        name: name.trim(),
        runtime,
        handler: handler.trim(),
        architecture,
        memorySize,
        timeout,
        ephemeralStorage: ephemeral,
        description: description.trim() || undefined,
        code: file ? undefined : code,
        file,
      }),
    onSuccess: () => {
      notify("success", `Function "${name}" created`);
      qc.invalidateQueries({ queryKey: ["lambda", "functions"] });
      reset();
      onClose();
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={open}
      title="Create function"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={create.isPending || !name.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create function"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Function name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-function"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Runtime</label>
            <select className="input" value={runtime} onChange={(e) => pickRuntime(e.target.value)}>
              {RUNTIMES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Handler</label>
            <input className="input" value={handler} onChange={(e) => setHandler(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Architecture</label>
            <select className="input" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              {ARCHITECTURES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Memory (MB)</label>
            <input
              type="number"
              className="input"
              value={memorySize}
              min={128}
              max={10240}
              step={64}
              onChange={(e) => setMemorySize(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Timeout (s)</label>
            <input
              type="number"
              className="input"
              value={timeout}
              min={1}
              max={900}
              onChange={(e) => setTimeout(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Ephemeral /tmp (MB)</label>
            <input
              type="number"
              className="input"
              value={ephemeral}
              min={512}
              max={10240}
              step={64}
              onChange={(e) => setEphemeral(Number(e.target.value))}
            />
          </div>
        </div>

        {file ? (
          <div className="flex items-center justify-between rounded border border-line bg-canvas px-3 py-2 text-sm">
            <span>
              Deploying from <strong>{file.name}</strong> ({formatBytes(file.size)})
            </span>
            <button className="link" onClick={() => setFile(null)}>
              Remove
            </button>
          </div>
        ) : (
          <div>
            <label className="label">Code</label>
            <CodeEditor
              value={code}
              onChange={(v) => { setCode(v); setTouchedCode(true); }}
              language={runtimeLanguage(runtime)}
              minHeight={200}
              className="rounded border border-line"
            />
          </div>
        )}

        <div className="text-xs text-ink-500">
          {file ? (
            "Using your uploaded deployment package."
          ) : (
            <label className="link cursor-pointer">
              Or upload a .zip deployment package
              <input
                type="file"
                accept=".zip"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

function InvokeModal({ fn, onClose }: { fn: LambdaFn | null; onClose: () => void }) {
  const [payload, setPayload] = useState("{}");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const { notify } = useToast();
  const m = useMutation({
    mutationFn: () => lambdaApi.invoke(fn!.name, JSON.parse(payload || "{}")),
    onSuccess: (r) => {
      setResult(r);
      if (r.functionError) notify("error", `Function error: ${r.functionError}`);
      else notify("success", "Invocation succeeded");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={!!fn}
      title={`Invoke ${fn?.name ?? ""}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-default" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>
            <Play className="h-4 w-4" /> Invoke
          </button>
        </>
      }
    >
      <label className="label">Event payload (JSON)</label>
      <textarea
        className="input min-h-[120px] font-mono text-xs"
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        spellCheck={false}
      />
      {result && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="label">
              Response{" "}
              <span className={result.functionError ? "text-danger" : "text-ok"}>
                (status {result.statusCode})
              </span>
            </p>
            <CodeBlock value={result.payload || "(empty)"} />
          </div>
          {result.logs && (
            <div>
              <p className="label">Logs</p>
              <CodeBlock value={result.logs} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function LambdaPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [invokeFn, setInvokeFn] = useState<LambdaFn | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["lambda", "functions"],
    queryFn: lambdaApi.list,
  });

  const del = useMutation({
    mutationFn: (name: string) => lambdaApi.remove(name),
    onSuccess: (_d, name) => {
      notify("success", `Function "${name}" deleted`);
      qc.invalidateQueries({ queryKey: ["lambda", "functions"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<LambdaFn>[] = [
    { key: "name", header: "Function name", render: (f) => <button className="link font-medium" onClick={() => setSelected(f.name)}>{f.name}</button> },
    { key: "runtime", header: "Runtime", render: (f) => f.runtime ?? f.packageType ?? "—" },
    { key: "memory", header: "Memory", render: (f) => `${f.memorySize ?? 0} MB` },
    { key: "timeout", header: "Timeout", render: (f) => `${f.timeout ?? 0}s` },
    { key: "size", header: "Code size", render: (f) => formatBytes(f.codeSize) },
    { key: "modified", header: "Last modified", render: (f) => formatDate(f.lastModified) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (f) => (
        <div className="flex justify-end gap-1">
          <button
            className="rounded p-1.5 text-ink-500 hover:bg-mimir/10 hover:text-mimir"
            onClick={() => setInvokeFn(f)}
            title="Invoke"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
            onClick={() => setToDelete(f.name)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  if (selected) {
    return (
      <div>
        <PageHeader
          title="AWS Lambda"
          subtitle={selected}
          crumbs={[{ label: "Console Home", to: "/" }, { label: "Lambda" }]}
        />
        <LambdaDetail name={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AWS Lambda"
        subtitle="Functions"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Lambda" }]}
        actions={
          <>
            <SeedDataButton service="lambda" onSuccess={refetch} />
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create function
            </button>
          </>
        }
      />
      <div className="card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.functions ?? []}
            rowKey={(f) => f.name}
            empty={
              <EmptyState
                icon={Zap}
                title="No functions"
                description="Load sample functions or create one with the button above."
                action={<SeedDataButton service="lambda" onSuccess={refetch} variant="primary" />}
              />
            }
          />
        )}
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <InvokeModal fn={invokeFn} onClose={() => setInvokeFn(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete function"
        message={
          <>
            Delete function <strong>{toDelete}</strong>?
          </>
        }
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
