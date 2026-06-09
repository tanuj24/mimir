import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RefreshCw, Power, Trash2 } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { kmsApi, type KmsKey } from "./kmsApi";
import { formatDate } from "@/lib/format";
import {
  PageHeader,
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

export function KmsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [toDelete, setToDelete] = useState<KmsKey | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["kms", "keys"],
    queryFn: kmsApi.list,
  });

  const create = useMutation({
    mutationFn: () => kmsApi.create(desc.trim()),
    onSuccess: () => {
      notify("success", "Key created");
      qc.invalidateQueries({ queryKey: ["kms", "keys"] });
      setCreateOpen(false);
      setDesc("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const toggle = useMutation({
    mutationFn: (k: KmsKey) => kmsApi.setEnabled(k.keyId, !k.enabled),
    onSuccess: () => {
      notify("success", "Key updated");
      qc.invalidateQueries({ queryKey: ["kms", "keys"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (k: KmsKey) => kmsApi.scheduleDeletion(k.keyId, 7),
    onSuccess: () => {
      notify("success", "Key scheduled for deletion (7 days)");
      qc.invalidateQueries({ queryKey: ["kms", "keys"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<KmsKey>[] = [
    { key: "alias", header: "Aliases", render: (k) => (k.aliases.length ? k.aliases.join(", ") : <span className="text-ink-300">—</span>) },
    { key: "id", header: "Key ID", render: (k) => <span className="font-mono text-xs">{k.keyId}</span> },
    { key: "desc", header: "Description", render: (k) => k.description || "—" },
    { key: "state", header: "Status", render: (k) => <StatusBadge status={k.state} /> },
    { key: "spec", header: "Spec", render: (k) => k.spec ?? "—" },
    { key: "created", header: "Created", render: (k) => formatDate(k.creationDate) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (k) => (
        <div className="flex justify-end gap-1">
          <button className="rounded p-1.5 text-ink-500 hover:bg-canvas" onClick={() => toggle.mutate(k)} title={k.enabled ? "Disable" : "Enable"}>
            <Power className={`h-4 w-4 ${k.enabled ? "text-ok" : "text-ink-300"}`} />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(k)} title="Schedule deletion">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="AWS KMS"
        subtitle="Customer managed keys"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "KMS" }]}
        actions={
          <>
            <SeedDataButton service="kms" onSuccess={refetch} />
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create key</button>
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
            rows={data?.keys ?? []}
            rowKey={(k) => k.keyId}
            empty={<EmptyState icon={KeyRound} title="No keys" description="Create a KMS key to encrypt data." action={<SeedDataButton service="kms" onSuccess={refetch} variant="primary" />} />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create key"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Description</label>
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Encryption key for…" autoFocus />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Schedule key deletion"
        message={<>Schedule key <strong>{toDelete?.keyId}</strong> for deletion in 7 days?</>}
        confirmLabel="Schedule deletion"
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
