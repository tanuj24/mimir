import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Play, Save, Trash2, Plus, Upload, Link2, Copy, Tag, Layers, Cpu, Settings2, FileCode2, Webhook, GitBranch,
} from "lucide-react";
import {
  lambdaApi, RUNTIMES, ARCHITECTURES, runtimeDefaults,
  type LambdaDetail as Detail, type InvokeResult, type LambdaVersion, type LambdaTrigger,
} from "./lambdaApi";
import { formatBytes, formatDate } from "@/lib/format";
import {
  DataTable, LoadingBlock, ErrorState, EmptyState, StatusBadge, CodeBlock, ConfirmDialog, useToast, type Column,
} from "@/components/ui";

type Tab = "code" | "test" | "config" | "versions" | "triggers";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

type Pair = { k: string; v: string };
function KVEditor({ pairs, setPairs }: { pairs: Pair[]; setPairs: (p: Pair[]) => void }) {
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="input font-mono text-xs" placeholder="KEY" value={p.k}
            onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
          <input className="input font-mono text-xs" placeholder="value" value={p.v}
            onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
            onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button className="btn-default" onClick={() => setPairs([...pairs, { k: "", v: "" }])}>
        <Plus className="h-4 w-4" /> Add
      </button>
    </div>
  );
}

const toPairs = (o: Record<string, string>): Pair[] => Object.entries(o).map(([k, v]) => ({ k, v }));
const fromPairs = (p: Pair[]): Record<string, string> =>
  Object.fromEntries(p.filter((x) => x.k.trim()).map((x) => [x.k.trim(), x.v]));

export function LambdaDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("code");

  const detail = useQuery({
    queryKey: ["lambda", "fn", name],
    queryFn: () => lambdaApi.get(name),
    refetchInterval: (q) => (q.state.data?.lastUpdateStatus === "InProgress" || q.state.data?.state === "Pending" ? 1500 : false),
  });
  const fn = detail.data;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lambda", "fn", name] });

  const TABS: { id: Tab; label: string; icon: typeof FileCode2 }[] = [
    { id: "code", label: "Code", icon: FileCode2 },
    { id: "test", label: "Test", icon: Play },
    { id: "config", label: "Configuration", icon: Settings2 },
    { id: "versions", label: "Aliases & versions", icon: GitBranch },
    { id: "triggers", label: "Triggers", icon: Webhook },
  ];

  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-sm link" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> Back to functions
      </button>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        {fn?.runtime && <span className="rounded-full bg-floci/10 px-2 py-0.5 text-xs font-medium text-floci">{fn.runtime}</span>}
        {fn?.architectures?.[0] && <span className="rounded-full bg-ink-300/20 px-2 py-0.5 text-xs text-ink-700">{fn.architectures[0]}</span>}
        <StatusBadge status={fn?.state} />
        {fn?.lastUpdateStatus === "InProgress" && <span className="text-xs text-warn">updating…</span>}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? "border-floci text-floci" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {!fn ? (
        detail.isLoading ? <LoadingBlock /> : <ErrorState error={detail.error} onRetry={detail.refetch} />
      ) : (
        <>
          {tab === "code" && <CodeTab fn={fn} onDone={invalidate} />}
          {tab === "test" && <TestTab name={name} aliases={fn.aliases} />}
          {tab === "config" && <ConfigTab fn={fn} onDone={invalidate} />}
          {tab === "versions" && <VersionsTab name={name} aliases={fn.aliases} onDone={invalidate} />}
          {tab === "triggers" && <TriggersTab name={name} />}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Code
function CodeTab({ fn, onDone }: { fn: Detail; onDone: () => void }) {
  const { notify } = useToast();
  const [code, setCode] = useState(runtimeDefaults(fn.runtime ?? "nodejs20.x").code);
  const [file, setFile] = useState<File | null>(null);
  const [architecture, setArchitecture] = useState(fn.architectures?.[0] ?? "x86_64");

  const deploy = useMutation({
    mutationFn: () => lambdaApi.updateCode(fn.name, { code: file ? undefined : code, file, runtime: fn.runtime, handler: fn.handler, architecture }),
    onSuccess: () => { notify("success", "Code deployed"); setFile(null); onDone(); },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Field label="Handler"><input className="input" value={fn.handler ?? ""} disabled /></Field>
          <Field label="Runtime"><input className="input" value={fn.runtime ?? ""} disabled /></Field>
          <Field label="Architecture">
            <select className="input" value={architecture} onChange={(e) => setArchitecture(e.target.value)}>
              {ARCHITECTURES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
        </div>
        {file ? (
          <div className="flex items-center justify-between rounded border border-line bg-canvas px-3 py-2 text-sm">
            <span>Deploy from <strong>{file.name}</strong> ({formatBytes(file.size)})</span>
            <button className="link" onClick={() => setFile(null)}>Remove</button>
          </div>
        ) : (
          <>
            <label className="label">Source code <span className="text-ink-500">(deploying replaces the function package)</span></label>
            <textarea className="input min-h-[360px] font-mono text-xs" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          </>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-primary" disabled={deploy.isPending} onClick={() => deploy.mutate()}>
            <Upload className="h-4 w-4" /> {deploy.isPending ? "Deploying…" : "Deploy"}
          </button>
          <label className="link cursor-pointer text-sm">
            Upload .zip
            <input type="file" accept=".zip" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className="ml-auto text-xs text-ink-500">Code size: {formatBytes(fn.codeSize)}</span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Test
function TestTab({ name, aliases }: { name: string; aliases: Detail["aliases"] }) {
  const { notify } = useToast();
  const [payload, setPayload] = useState("{}");
  const [qualifier, setQualifier] = useState("");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const m = useMutation({
    mutationFn: () => lambdaApi.invoke(name, JSON.parse(payload || "{}"), qualifier || undefined),
    onSuccess: (r) => { setResult(r); r.functionError ? notify("error", `Function error: ${r.functionError}`) : notify("success", "Invocation succeeded"); },
    onError: (e: Error) => notify("error", e.message),
  });
  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Event payload (JSON)">
            <textarea className="input min-h-[140px] font-mono text-xs" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
          </Field>
        </div>
        <Field label="Qualifier" hint="version or alias (optional)">
          <select className="input" value={qualifier} onChange={(e) => setQualifier(e.target.value)}>
            <option value="">$LATEST</option>
            {aliases.map((a) => <option key={a.name} value={a.name}>{a.name} → {a.version}</option>)}
          </select>
        </Field>
      </div>
      <button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>
        <Play className="h-4 w-4" /> {m.isPending ? "Invoking…" : "Invoke"}
      </button>
      {result && (
        <div className="space-y-3">
          <div>
            <p className="label">Response <span className={result.functionError ? "text-danger" : "text-ok"}>(status {result.statusCode})</span></p>
            <CodeBlock value={result.payload || "(empty)"} />
          </div>
          {result.logs && <div><p className="label">Logs</p><CodeBlock value={result.logs} /></div>}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Configuration
function ConfigTab({ fn, onDone }: { fn: Detail; onDone: () => void }) {
  const { notify } = useToast();

  // General
  const [description, setDescription] = useState(fn.description ?? "");
  const [memorySize, setMemorySize] = useState(fn.memorySize ?? 128);
  const [timeout, setTimeout] = useState(fn.timeout ?? 3);
  const [ephemeral, setEphemeral] = useState(fn.ephemeralStorage ?? 512);
  const [handler, setHandler] = useState(fn.handler ?? "");
  const [runtime, setRuntime] = useState(fn.runtime ?? "");
  const [tracing, setTracing] = useState(fn.tracingMode === "Active");
  useEffect(() => {
    setDescription(fn.description ?? ""); setMemorySize(fn.memorySize ?? 128); setTimeout(fn.timeout ?? 3);
    setEphemeral(fn.ephemeralStorage ?? 512); setHandler(fn.handler ?? ""); setRuntime(fn.runtime ?? "");
    setTracing(fn.tracingMode === "Active");
  }, [fn.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveGeneral = useMutation({
    mutationFn: () => lambdaApi.updateConfig(fn.name, {
      description, memorySize, timeout, ephemeralStorage: ephemeral, handler, runtime,
      tracingMode: tracing ? "Active" : "PassThrough",
    }),
    onSuccess: () => { notify("success", "Configuration saved"); onDone(); },
    onError: (e: Error) => notify("error", e.message),
  });

  // Environment
  const [env, setEnv] = useState<Pair[]>(toPairs(fn.environment));
  useEffect(() => setEnv(toPairs(fn.environment)), [fn.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveEnv = useMutation({
    mutationFn: () => lambdaApi.updateConfig(fn.name, { environment: fromPairs(env) }),
    onSuccess: () => { notify("success", "Environment saved"); onDone(); },
    onError: (e: Error) => notify("error", e.message),
  });

  // Concurrency
  const [reserved, setReserved] = useState(fn.reservedConcurrency ?? 0);
  useEffect(() => setReserved(fn.reservedConcurrency ?? 0), [fn.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveConc = useMutation({
    mutationFn: () => lambdaApi.setConcurrency(fn.name, reserved),
    onSuccess: () => { notify("success", "Reserved concurrency set"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });
  const clearConc = useMutation({
    mutationFn: () => lambdaApi.clearConcurrency(fn.name),
    onSuccess: () => { notify("success", "Reserved concurrency cleared"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });

  // Function URL
  const [authType, setAuthType] = useState(fn.functionUrl?.authType ?? "NONE");
  const saveUrl = useMutation({
    mutationFn: () => lambdaApi.setUrl(fn.name, authType),
    onSuccess: () => { notify("success", "Function URL saved"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });
  const delUrl = useMutation({
    mutationFn: () => lambdaApi.deleteUrl(fn.name),
    onSuccess: () => { notify("success", "Function URL removed"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });

  // Async invoke
  const [retries, setRetries] = useState(fn.asyncConfig?.maxRetryAttempts ?? 2);
  const [maxAge, setMaxAge] = useState(fn.asyncConfig?.maxEventAgeSeconds ?? 21600);
  useEffect(() => { setRetries(fn.asyncConfig?.maxRetryAttempts ?? 2); setMaxAge(fn.asyncConfig?.maxEventAgeSeconds ?? 21600); }, [fn.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveAsync = useMutation({
    mutationFn: () => lambdaApi.setAsyncConfig(fn.name, { maxRetryAttempts: retries, maxEventAgeSeconds: maxAge }),
    onSuccess: () => { notify("success", "Async config saved"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });

  // Tags
  const [tags, setTags] = useState<Pair[]>(toPairs(fn.tags));
  useEffect(() => setTags(toPairs(fn.tags)), [fn.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveTags = useMutation({
    mutationFn: () => lambdaApi.setTags(fn.name, fn.arn ?? "", fromPairs(tags)),
    onSuccess: () => { notify("success", "Tags saved"); onDone(); }, onError: (e: Error) => notify("error", e.message),
  });

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500"><Settings2 className="h-4 w-4" /> General configuration</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Memory (MB)" hint="128–10240"><input type="number" min={128} max={10240} step={64} className="input" value={memorySize} onChange={(e) => setMemorySize(Number(e.target.value))} /></Field>
          <Field label="Timeout (s)" hint="1–900"><input type="number" min={1} max={900} className="input" value={timeout} onChange={(e) => setTimeout(Number(e.target.value))} /></Field>
          <Field label="Ephemeral storage /tmp (MB)" hint="512–10240"><input type="number" min={512} max={10240} step={64} className="input" value={ephemeral} onChange={(e) => setEphemeral(Number(e.target.value))} /></Field>
          <Field label="Handler"><input className="input" value={handler} onChange={(e) => setHandler(e.target.value)} /></Field>
          <Field label="Runtime">
            <select className="input" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
              {RUNTIMES.includes(runtime) ? null : <option value={runtime}>{runtime}</option>}
              {RUNTIMES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tracing} onChange={(e) => setTracing(e.target.checked)} /> Active X-Ray tracing</label>
        </div>
        <div className="mt-4"><button className="btn-primary" disabled={saveGeneral.isPending} onClick={() => saveGeneral.mutate()}><Save className="h-4 w-4" /> Save</button></div>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500"><Cpu className="h-4 w-4" /> Environment variables</h3>
        <KVEditor pairs={env} setPairs={setEnv} />
        <div className="mt-4"><button className="btn-primary" disabled={saveEnv.isPending} onClick={() => saveEnv.mutate()}><Save className="h-4 w-4" /> Save</button></div>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500"><Layers className="h-4 w-4" /> Concurrency</h3>
        <Field label="Reserved concurrency" hint="Caps simultaneous executions (0 = throttle all)">
          <input type="number" min={0} className="input max-w-[200px]" value={reserved} onChange={(e) => setReserved(Number(e.target.value))} />
        </Field>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" disabled={saveConc.isPending} onClick={() => saveConc.mutate()}><Save className="h-4 w-4" /> Set</button>
          <button className="btn-default" disabled={clearConc.isPending} onClick={() => clearConc.mutate()}>Clear (use unreserved)</button>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500"><Link2 className="h-4 w-4" /> Function URL</h3>
        {fn.functionUrl?.url ? (
          <div className="mb-3 flex items-center gap-2 rounded border border-line bg-canvas px-3 py-2 text-sm">
            <code className="flex-1 truncate">{fn.functionUrl.url}</code>
            <button className="rounded p-1 text-ink-500 hover:text-floci" title="Copy" onClick={() => navigator.clipboard.writeText(fn.functionUrl!.url!)}><Copy className="h-4 w-4" /></button>
          </div>
        ) : (
          <p className="mb-3 text-sm text-ink-500">No function URL configured.</p>
        )}
        <div className="flex items-end gap-2">
          <Field label="Auth type">
            <select className="input max-w-[200px]" value={authType} onChange={(e) => setAuthType(e.target.value)}>
              <option value="NONE">NONE (public)</option>
              <option value="AWS_IAM">AWS_IAM</option>
            </select>
          </Field>
          <button className="btn-primary" disabled={saveUrl.isPending} onClick={() => saveUrl.mutate()}><Save className="h-4 w-4" /> {fn.functionUrl?.url ? "Update" : "Create URL"}</button>
          {fn.functionUrl?.url && <button className="btn-default" disabled={delUrl.isPending} onClick={() => delUrl.mutate()}><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Asynchronous invocation</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retry attempts" hint="0–2"><input type="number" min={0} max={2} className="input" value={retries} onChange={(e) => setRetries(Number(e.target.value))} /></Field>
          <Field label="Max event age (s)" hint="60–21600"><input type="number" min={60} max={21600} className="input" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} /></Field>
        </div>
        <div className="mt-4"><button className="btn-primary" disabled={saveAsync.isPending} onClick={() => saveAsync.mutate()}><Save className="h-4 w-4" /> Save</button></div>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500"><Tag className="h-4 w-4" /> Tags</h3>
        <KVEditor pairs={tags} setPairs={setTags} />
        <div className="mt-4"><button className="btn-primary" disabled={saveTags.isPending} onClick={() => saveTags.mutate()}><Save className="h-4 w-4" /> Save</button></div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------- Versions & aliases
function VersionsTab({ name, aliases, onDone }: { name: string; aliases: Detail["aliases"]; onDone: () => void }) {
  const { notify } = useToast();
  const versions = useQuery({ queryKey: ["lambda", "versions", name], queryFn: () => lambdaApi.versions(name) });
  const refresh = () => { versions.refetch(); onDone(); };

  const publish = useMutation({
    mutationFn: () => lambdaApi.publish(name),
    onSuccess: (r) => { notify("success", `Published version ${r.version}`); refresh(); }, onError: (e: Error) => notify("error", e.message),
  });
  const [aliasName, setAliasName] = useState("");
  const [aliasVer, setAliasVer] = useState("");
  const createAlias = useMutation({
    mutationFn: () => lambdaApi.createAlias(name, { name: aliasName.trim(), version: aliasVer.trim() }),
    onSuccess: () => { notify("success", "Alias created"); setAliasName(""); setAliasVer(""); refresh(); }, onError: (e: Error) => notify("error", e.message),
  });
  const delAlias = useMutation({
    mutationFn: (a: string) => lambdaApi.deleteAlias(name, a),
    onSuccess: () => { notify("success", "Alias deleted"); refresh(); }, onError: (e: Error) => notify("error", e.message),
  });

  const vcols: Column<LambdaVersion>[] = [
    { key: "v", header: "Version", render: (v) => <span className="font-mono">{v.version}</span> },
    { key: "desc", header: "Description", render: (v) => v.description || "—" },
    { key: "size", header: "Code size", render: (v) => formatBytes(v.codeSize) },
    { key: "mod", header: "Last modified", render: (v) => formatDate(v.lastModified) },
  ];

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Versions</h3>
          <button className="btn-primary" disabled={publish.isPending} onClick={() => publish.mutate()}><Plus className="h-4 w-4" /> Publish new version</button>
        </div>
        <DataTable columns={vcols} rows={versions.data?.versions ?? []} rowKey={(v) => v.version ?? ""} empty={<EmptyState icon={GitBranch} title="No versions" description="Publishing snapshots the current code as an immutable version." />} />
      </section>

      <section className="card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Aliases</h3>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Alias name"><input className="input" value={aliasName} onChange={(e) => setAliasName(e.target.value)} placeholder="prod" /></Field>
          <Field label="Version"><input className="input" value={aliasVer} onChange={(e) => setAliasVer(e.target.value)} placeholder="1" /></Field>
          <button className="btn-primary" disabled={createAlias.isPending || !aliasName.trim() || !aliasVer.trim()} onClick={() => createAlias.mutate()}><Plus className="h-4 w-4" /> Create alias</button>
        </div>
        {aliases.length === 0 ? <p className="text-sm text-ink-500">No aliases.</p> : (
          <div className="space-y-1">
            {aliases.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded border border-line px-3 py-1.5 text-sm">
                <span><strong>{a.name}</strong> → version {a.version}</span>
                <button className="rounded p-1 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => a.name && delAlias.mutate(a.name)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ----------------------------------------------------------------- Triggers
function TriggersTab({ name }: { name: string }) {
  const { notify } = useToast();
  const triggers = useQuery({ queryKey: ["lambda", "triggers", name], queryFn: () => lambdaApi.triggers(name) });
  const [arn, setArn] = useState("");
  const [batch, setBatch] = useState(10);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => lambdaApi.createTrigger(name, arn.trim(), batch),
    onSuccess: () => { notify("success", "Trigger created"); setArn(""); triggers.refetch(); }, onError: (e: Error) => notify("error", e.message),
  });
  const del = useMutation({
    mutationFn: (uuid: string) => lambdaApi.deleteTrigger(name, uuid),
    onSuccess: () => { notify("success", "Trigger deleted"); triggers.refetch(); }, onError: (e: Error) => notify("error", e.message),
  });

  const cols: Column<LambdaTrigger>[] = [
    { key: "src", header: "Event source ARN", render: (t) => <span className="font-mono text-xs">{t.eventSourceArn}</span> },
    { key: "batch", header: "Batch", render: (t) => t.batchSize },
    { key: "state", header: "State", render: (t) => <StatusBadge status={t.state} /> },
    { key: "act", header: "", className: "text-right", render: (t) => <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(t.uuid ?? null)}><Trash2 className="h-4 w-4" /></button> },
  ];

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Add trigger (event source mapping)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[320px] flex-1">
            <Field label="Event source ARN" hint="SQS queue, DynamoDB / Kinesis stream ARN">
              <input className="input font-mono text-xs" value={arn} onChange={(e) => setArn(e.target.value)} placeholder="arn:aws:sqs:us-east-1:000000000000:my-queue" />
            </Field>
          </div>
          <Field label="Batch size"><input type="number" min={1} className="input max-w-[120px]" value={batch} onChange={(e) => setBatch(Number(e.target.value))} /></Field>
          <button className="btn-primary" disabled={create.isPending || !arn.trim()} onClick={() => create.mutate()}><Plus className="h-4 w-4" /> Add</button>
        </div>
      </section>
      <div className="card">
        {triggers.isLoading ? <LoadingBlock /> : (
          <DataTable columns={cols} rows={triggers.data?.triggers ?? []} rowKey={(t) => t.uuid ?? ""} empty={<EmptyState icon={Webhook} title="No triggers" description="Map an SQS/DynamoDB/Kinesis source to invoke this function." />} />
        )}
      </div>
      <ConfirmDialog open={!!toDelete} title="Delete trigger" message={<>Remove this event source mapping?</>} onConfirm={() => toDelete && del.mutateAsync(toDelete)} onClose={() => setToDelete(null)} />
    </div>
  );
}
