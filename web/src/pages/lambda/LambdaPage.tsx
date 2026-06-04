import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, RefreshCw, Trash2, Play } from "lucide-react";
import { lambdaApi, type LambdaFn, type InvokeResult } from "./lambdaApi";
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
  useToast,
  type Column,
} from "@/components/ui";

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
  const [invokeFn, setInvokeFn] = useState<LambdaFn | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

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
    { key: "name", header: "Function name", render: (f) => <span className="font-medium">{f.name}</span> },
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
            className="rounded p-1.5 text-ink-500 hover:bg-floci/10 hover:text-floci"
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

  return (
    <div>
      <PageHeader
        title="AWS Lambda"
        subtitle="Functions"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Lambda" }]}
        actions={
          <button className="btn-default" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
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
                description="Deploy a function with the AWS CLI or SDK against Floci, then invoke it here."
              />
            }
          />
        )}
      </div>

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
