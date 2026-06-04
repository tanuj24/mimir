import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, RefreshCw, Trash2, Eye } from "lucide-react";
import { ssmApi, type Parameter } from "./ssmApi";
import { formatDate } from "@/lib/format";
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

function ValueModal({ name, onClose }: { name: string | null; onClose: () => void }) {
  const value = useQuery({
    queryKey: ["ssm", "value", name],
    queryFn: () => ssmApi.value(name!),
    enabled: !!name,
  });
  return (
    <Modal open={!!name} title={name ?? ""} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      {value.isLoading ? <LoadingBlock /> : <CodeBlock value={value.data?.value ?? "(no value)"} />}
      <p className="mt-2 text-xs text-ink-500">Type {value.data?.type} · version {value.data?.version}</p>
    </Modal>
  );
}

export function SsmPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", type: "String", description: "" });
  const [view, setView] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ssm", "list"],
    queryFn: ssmApi.list,
  });

  const create = useMutation({
    mutationFn: () =>
      ssmApi.put({ name: form.name.trim(), value: form.value, type: form.type, description: form.description || undefined }),
    onSuccess: () => {
      notify("success", "Parameter saved");
      qc.invalidateQueries({ queryKey: ["ssm", "list"] });
      setCreateOpen(false);
      setForm({ name: "", value: "", type: "String", description: "" });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (name: string) => ssmApi.remove(name),
    onSuccess: () => {
      notify("success", "Parameter deleted");
      qc.invalidateQueries({ queryKey: ["ssm", "list"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Parameter>[] = [
    {
      key: "name",
      header: "Name",
      render: (p) => (
        <button className="link font-mono text-xs font-medium" onClick={() => setView(p.name)}>
          {p.name}
        </button>
      ),
    },
    { key: "type", header: "Type", render: (p) => p.type ?? "—" },
    { key: "version", header: "Version", render: (p) => p.version ?? "—" },
    { key: "tier", header: "Tier", render: (p) => p.tier ?? "Standard" },
    { key: "modified", header: "Last modified", render: (p) => formatDate(p.lastModifiedDate) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button className="rounded p-1.5 text-ink-500 hover:bg-canvas hover:text-link" onClick={() => setView(p.name)} title="View value">
            <Eye className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(p.name)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Systems Manager"
        subtitle="Parameter Store"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "SSM Parameters" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create parameter</button>
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
            rows={data?.parameters ?? []}
            rowKey={(p) => p.name}
            empty={<EmptyState icon={Settings2} title="No parameters" description="Store configuration values and secrets." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create parameter"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="/app/db/host" autoFocus />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>String</option>
              <option>StringList</option>
              <option>SecureString</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <textarea className="input min-h-[80px] font-mono text-xs" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} spellCheck={false} />
          </div>
        </div>
      </Modal>

      <ValueModal name={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete parameter"
        message={<>Delete parameter <strong>{toDelete}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
