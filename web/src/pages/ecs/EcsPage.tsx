import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, RefreshCw, Trash2 } from "lucide-react";
import { ecsApi, type Cluster } from "./ecsApi";
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

function ServicesModal({ cluster, onClose }: { cluster: Cluster | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["ecs", "services", cluster?.name],
    queryFn: () => ecsApi.services(cluster!.name),
    enabled: !!cluster,
  });
  return (
    <Modal open={!!cluster} title={`${cluster?.name} · services`} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={[
            { key: "name", header: "Service", render: (s) => <span className="font-medium">{s.name}</span> },
            { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
            { key: "tasks", header: "Tasks (run/desired)", render: (s) => `${s.running ?? 0}/${s.desired ?? 0}` },
            { key: "launch", header: "Launch type", render: (s) => s.launchType ?? "—" },
            { key: "td", header: "Task definition", render: (s) => <span className="font-mono text-xs">{s.taskDefinition ?? "—"}</span> },
          ]}
          rows={q.data?.services ?? []}
          rowKey={(s) => s.name}
          empty={<EmptyState icon={Boxes} title="No services" />}
        />
      )}
    </Modal>
  );
}

export function EcsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<Cluster | null>(null);
  const [toDelete, setToDelete] = useState<Cluster | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ecs", "clusters"],
    queryFn: ecsApi.clusters,
  });

  const create = useMutation({
    mutationFn: () => ecsApi.create(name.trim()),
    onSuccess: () => {
      notify("success", "Cluster created");
      qc.invalidateQueries({ queryKey: ["ecs", "clusters"] });
      setCreateOpen(false);
      setName("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => ecsApi.remove(n),
    onSuccess: () => {
      notify("success", "Cluster deleted");
      qc.invalidateQueries({ queryKey: ["ecs", "clusters"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Cluster>[] = [
    {
      key: "name",
      header: "Cluster",
      render: (c) => (
        <button className="link font-medium" onClick={() => setView(c)}>
          {c.name}
        </button>
      ),
    },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "services", header: "Active services", render: (c) => c.activeServices ?? 0 },
    { key: "running", header: "Running tasks", render: (c) => c.runningTasks ?? 0 },
    { key: "pending", header: "Pending tasks", render: (c) => c.pendingTasks ?? 0 },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(c)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon ECS"
        subtitle="Clusters"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "ECS" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create cluster</button>
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
            empty={<EmptyState icon={Boxes} title="No clusters" description="Create a cluster to run containerized services." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create cluster"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Cluster name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-cluster" autoFocus />
      </Modal>

      <ServicesModal cluster={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete cluster"
        message={<>Delete cluster <strong>{toDelete?.name}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.name)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
