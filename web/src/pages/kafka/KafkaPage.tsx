import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, RefreshCw, Trash2, Plus } from "lucide-react";
import { kafkaApi, type KafkaCluster } from "./kafkaApi";
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
  CodeBlock,
  useToast,
  type Column,
} from "@/components/ui";

function ClusterModal({ arn, onClose }: { arn: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["kafka", "describe", arn],
    queryFn: () => kafkaApi.describe(arn!),
    enabled: !!arn,
  });
  return (
    <Modal open={!!arn} title={q.data?.name ?? "Cluster"} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <DetailList
            items={[
              { label: "State", value: <StatusBadge status={q.data?.state} /> },
              { label: "Type", value: q.data?.type },
              { label: "Created", value: formatDate(q.data?.creationTime) },
            ]}
          />
          <div className="mt-4">
            <p className="label">Bootstrap brokers</p>
            <CodeBlock value={q.data?.bootstrapBrokers ?? "(not available)"} />
          </div>
        </>
      )}
    </Modal>
  );
}

const KAFKA_VERSIONS = ["3.5.1", "3.4.0", "2.8.1"];
const INSTANCE_TYPES = ["kafka.t3.small", "kafka.m5.large", "kafka.m5.xlarge"];

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [kafkaVersion, setKafkaVersion] = useState(KAFKA_VERSIONS[0]);
  const [brokers, setBrokers] = useState(1);
  const [instanceType, setInstanceType] = useState(INSTANCE_TYPES[0]);

  const create = useMutation({
    mutationFn: () => kafkaApi.create({ name: name.trim(), kafkaVersion, brokers, instanceType }),
    onSuccess: () => {
      notify("success", `Cluster "${name}" is being created`);
      qc.invalidateQueries({ queryKey: ["kafka", "clusters"] });
      setName("");
      setBrokers(1);
      onClose();
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={open}
      title="Create cluster"
      onClose={onClose}
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
            {create.isPending ? "Creating…" : "Create cluster"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Cluster name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-cluster"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kafka version</label>
            <select className="input" value={kafkaVersion} onChange={(e) => setKafkaVersion(e.target.value)}>
              {KAFKA_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Broker nodes</label>
            <input
              type="number"
              className="input"
              value={brokers}
              min={1}
              onChange={(e) => setBrokers(Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <label className="label">Broker instance type</label>
          <select className="input" value={instanceType} onChange={(e) => setInstanceType(e.target.value)}>
            {INSTANCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

export function KafkaPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [view, setView] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<KafkaCluster | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["kafka", "clusters"],
    queryFn: kafkaApi.list,
  });

  const del = useMutation({
    mutationFn: (arn: string) => kafkaApi.remove(arn),
    onSuccess: () => {
      notify("success", "Cluster deleted");
      qc.invalidateQueries({ queryKey: ["kafka", "clusters"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<KafkaCluster>[] = [
    {
      key: "name",
      header: "Cluster",
      render: (c) => (
        <button className="link font-medium" onClick={() => setView(c.arn)}>
          {c.name}
        </button>
      ),
    },
    { key: "state", header: "State", render: (c) => <StatusBadge status={c.state} /> },
    { key: "type", header: "Type", render: (c) => c.type ?? "—" },
    { key: "version", header: "Kafka version", render: (c) => c.kafkaVersion ?? "—" },
    { key: "brokers", header: "Brokers", render: (c) => c.brokers ?? "—" },
    { key: "created", header: "Created", render: (c) => formatDate(c.creationTime) },
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
        title="Amazon MSK"
        subtitle="Kafka clusters"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "MSK / Kafka" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create cluster
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
            rows={data?.clusters ?? []}
            rowKey={(c) => c.arn}
            empty={<EmptyState icon={Radio} title="No clusters" description="Create an MSK cluster with the button above, or via the AWS CLI/SDK against the Mimir backend." />}
          />
        )}
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ClusterModal arn={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete cluster"
        message={<>Delete cluster <strong>{toDelete?.name}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.arn)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
