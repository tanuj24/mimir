import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, RefreshCw, Trash2 } from "lucide-react";
import { eksApi, type EksCluster } from "./eksApi";
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
  DetailList,
  useToast,
  type Column,
} from "@/components/ui";

function ClusterModal({ name, onClose }: { name: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["eks", "cluster", name],
    queryFn: () => eksApi.get(name!),
    enabled: !!name,
  });
  return (
    <Modal open={!!name} title={name ?? ""} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (
        <DetailList
          items={[
            { label: "Status", value: <StatusBadge status={q.data?.status} /> },
            { label: "Version", value: q.data?.version },
            { label: "Platform", value: q.data?.platformVersion },
            { label: "Endpoint", value: <span className="font-mono text-xs">{q.data?.endpoint ?? "—"}</span> },
            { label: "Node groups", value: q.data?.nodegroups.length ? q.data.nodegroups.join(", ") : "None" },
            { label: "Created", value: formatDate(q.data?.createdAt) },
            { label: "ARN", value: <span className="font-mono text-xs">{q.data?.arn}</span> },
          ]}
        />
      )}
    </Modal>
  );
}

export function EksPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["eks", "clusters"],
    queryFn: eksApi.list,
  });

  const create = useMutation({
    mutationFn: () => eksApi.create(name.trim()),
    onSuccess: () => {
      notify("success", "Cluster creation started");
      qc.invalidateQueries({ queryKey: ["eks", "clusters"] });
      setCreateOpen(false);
      setName("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => eksApi.remove(n),
    onSuccess: () => {
      notify("success", "Cluster deleted");
      qc.invalidateQueries({ queryKey: ["eks", "clusters"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<EksCluster>[] = [
    {
      key: "name",
      header: "Cluster",
      render: (c) => (
        <button className="link font-medium" onClick={() => setView(c.name)}>
          {c.name}
        </button>
      ),
    },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "version", header: "K8s version", render: (c) => c.version ?? "—" },
    { key: "created", header: "Created", render: (c) => formatDate(c.createdAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(c.name)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon EKS"
        subtitle="Clusters"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "EKS" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Add cluster</button>
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
            rows={data?.clusters ?? []}
            rowKey={(c) => c.name}
            empty={<EmptyState icon={Network} title="No clusters" description="Create a Kubernetes cluster." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create EKS cluster"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Cluster name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-eks" autoFocus />
        <p className="mt-2 text-xs text-ink-500">Uses a default IAM role and empty VPC config for local use.</p>
      </Modal>

      <ClusterModal name={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete cluster"
        message={<>Delete cluster <strong>{toDelete}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
