import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, RefreshCw, Trash2 } from "lucide-react";
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

export function KafkaPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [view, setView] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<KafkaCluster | null>(null);

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
            rows={data?.clusters ?? []}
            rowKey={(c) => c.arn}
            empty={<EmptyState icon={Radio} title="No clusters" description="Create an MSK cluster with the AWS CLI or SDK against Floci." />}
          />
        )}
      </div>

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
