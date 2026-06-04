import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw, Trash2, Eye } from "lucide-react";
import { secretsApi, type SecretSummary } from "./secretsApi";
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

function ValueModal({ secret, onClose }: { secret: SecretSummary | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const value = useQuery({
    queryKey: ["secrets", "value", secret?.arn],
    queryFn: () => secretsApi.value(secret!.arn),
    enabled: !!secret,
  });

  const save = useMutation({
    mutationFn: () => secretsApi.putValue(secret!.arn, draft),
    onSuccess: () => {
      notify("success", "Secret value updated");
      qc.invalidateQueries({ queryKey: ["secrets", "value", secret?.arn] });
      setEditing(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={!!secret}
      title={secret?.name ?? ""}
      onClose={onClose}
      wide
      footer={
        editing ? (
          <>
            <button className="btn-default" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save value</button>
          </>
        ) : (
          <button className="btn-default" onClick={onClose}>Close</button>
        )
      }
    >
      {value.isLoading ? (
        <LoadingBlock />
      ) : editing ? (
        <>
          <label className="label">Secret value</label>
          <textarea className="input min-h-[160px] font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        </>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button
              className="btn-default"
              onClick={() => {
                setDraft(value.data?.secretString ?? "");
                setEditing(true);
              }}
            >
              Edit value
            </button>
          </div>
          <CodeBlock value={value.data?.secretString ?? "(no value)"} />
        </>
      )}
    </Modal>
  );
}

export function SecretsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", description: "" });
  const [view, setView] = useState<SecretSummary | null>(null);
  const [toDelete, setToDelete] = useState<SecretSummary | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["secrets", "list"],
    queryFn: secretsApi.list,
  });

  const create = useMutation({
    mutationFn: () => secretsApi.create(form.name.trim(), form.value, form.description || undefined),
    onSuccess: () => {
      notify("success", "Secret created");
      qc.invalidateQueries({ queryKey: ["secrets", "list"] });
      setCreateOpen(false);
      setForm({ name: "", value: "", description: "" });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (arn: string) => secretsApi.remove(arn),
    onSuccess: () => {
      notify("success", "Secret deleted");
      qc.invalidateQueries({ queryKey: ["secrets", "list"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<SecretSummary>[] = [
    {
      key: "name",
      header: "Secret name",
      render: (s) => (
        <button className="link font-medium" onClick={() => setView(s)}>
          {s.name}
        </button>
      ),
    },
    { key: "desc", header: "Description", render: (s) => s.description || "—" },
    { key: "changed", header: "Last changed", render: (s) => formatDate(s.lastChangedDate) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (s) => (
        <div className="flex justify-end gap-1">
          <button className="rounded p-1.5 text-ink-500 hover:bg-canvas hover:text-link" onClick={() => setView(s)} title="View value">
            <Eye className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(s)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Secrets Manager"
        subtitle="Secrets"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "Secrets Manager" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Store a secret</button>
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
            rows={data?.secrets ?? []}
            rowKey={(s) => s.arn}
            empty={<EmptyState icon={Lock} title="No secrets" description="Store a secret such as a DB password or API key." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Store a new secret"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>Store</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Secret name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="prod/db/password" autoFocus />
          </div>
          <div>
            <label className="label">Secret value</label>
            <textarea className="input min-h-[100px] font-mono text-xs" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder='{"username":"admin","password":"…"}' spellCheck={false} />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ValueModal secret={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete secret"
        message={<>Permanently delete secret <strong>{toDelete?.name}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.arn)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
