import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { ddbApi } from "./dynamodbApi";
import { formatBytes, formatDate } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  DetailList,
  StatusBadge,
  useToast,
  type Column,
} from "@/components/ui";

export function TableDetailPage() {
  const { name = "" } = useParams();
  const qc = useQueryClient();
  const { notify } = useToast();
  const [tab, setTab] = useState<"items" | "overview">("items");
  const [itemModal, setItemModal] = useState(false);
  const [itemJson, setItemJson] = useState('{\n  "id": "1"\n}');
  const [toDelete, setToDelete] = useState<Record<string, unknown> | null>(null);

  const detail = useQuery({
    queryKey: ["ddb", "describe", name],
    queryFn: () => ddbApi.describe(name),
  });
  const items = useQuery({
    queryKey: ["ddb", "items", name],
    queryFn: () => ddbApi.scan(name),
  });

  const keyAttrs = useMemo(
    () => (detail.data?.keySchema ?? []).map((k) => k.AttributeName),
    [detail.data],
  );

  const putItem = useMutation({
    mutationFn: () => ddbApi.putItem(name, JSON.parse(itemJson)),
    onSuccess: () => {
      notify("success", "Item saved");
      qc.invalidateQueries({ queryKey: ["ddb", "items", name] });
      setItemModal(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const delItem = useMutation({
    mutationFn: (key: Record<string, unknown>) => ddbApi.deleteItem(name, key),
    onSuccess: () => {
      notify("success", "Item deleted");
      qc.invalidateQueries({ queryKey: ["ddb", "items", name] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  // Build column set from union of item keys (key attrs first).
  const allKeys = useMemo(() => {
    const set = new Set<string>(keyAttrs);
    for (const it of items.data?.items ?? []) Object.keys(it).forEach((k) => set.add(k));
    return Array.from(set);
  }, [items.data, keyAttrs]);

  const columns: Column<Record<string, unknown>>[] = [
    ...allKeys.map((k) => ({
      key: k,
      header: (
        <span>
          {k}
          {keyAttrs.includes(k) && <span className="ml-1 text-mimir">●</span>}
        </span>
      ),
      render: (row: Record<string, unknown>) => {
        const v = row[k];
        return (
          <span className="font-mono text-xs">
            {v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        );
      },
    })),
    {
      key: "_actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <button
          className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          onClick={() => {
            const key: Record<string, unknown> = {};
            for (const ka of keyAttrs) key[ka] = row[ka];
            setToDelete(key);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={name}
        crumbs={[
          { label: "Console Home", to: "/" },
          { label: "DynamoDB", to: "/dynamodb" },
          { label: name },
        ]}
        actions={
          <>
            <button
              className="btn-default"
              onClick={() => {
                detail.refetch();
                items.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="btn-primary" onClick={() => setItemModal(true)}>
              <Plus className="h-4 w-4" /> Create item
            </button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-line">
        {(["items", "overview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-mimir text-mimir" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="card p-5">
          {detail.isLoading ? (
            <LoadingBlock />
          ) : detail.error ? (
            <ErrorState error={detail.error} onRetry={detail.refetch} />
          ) : (
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge status={detail.data?.status} /> },
                { label: "Items", value: detail.data?.itemCount ?? 0 },
                { label: "Size", value: formatBytes(detail.data?.sizeBytes) },
                { label: "Billing mode", value: detail.data?.billingMode },
                {
                  label: "Partition key",
                  value: detail.data?.keySchema.find((k) => k.KeyType === "HASH")?.AttributeName,
                },
                {
                  label: "Sort key",
                  value:
                    detail.data?.keySchema.find((k) => k.KeyType === "RANGE")?.AttributeName ?? "—",
                },
                { label: "Created", value: formatDate(detail.data?.creationDate) },
                { label: "ARN", value: <span className="font-mono text-xs">{detail.data?.arn}</span> },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="card">
          {items.isLoading ? (
            <LoadingBlock />
          ) : items.error ? (
            <ErrorState error={items.error} onRetry={items.refetch} />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm text-ink-500">
                <span>
                  {items.data?.count ?? 0} item(s) · scanned {items.data?.scannedCount ?? 0}
                </span>
              </div>
              <DataTable
                columns={columns}
                rows={items.data?.items ?? []}
                rowKey={(r) => keyAttrs.map((k) => String(r[k])).join("#") || JSON.stringify(r)}
                empty={
                  <EmptyState
                    icon={Plus}
                    title="No items"
                    description="Create an item to populate this table."
                  />
                }
              />
            </>
          )}
        </div>
      )}

      <Modal
        open={itemModal}
        title="Create / edit item"
        onClose={() => setItemModal(false)}
        wide
        footer={
          <>
            <button className="btn-default" onClick={() => setItemModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={putItem.isPending} onClick={() => putItem.mutate()}>
              Save item
            </button>
          </>
        }
      >
        <label className="label">Item JSON</label>
        <textarea
          className="input min-h-[220px] font-mono text-xs"
          value={itemJson}
          onChange={(e) => setItemJson(e.target.value)}
          spellCheck={false}
        />
        <p className="mt-2 text-xs text-ink-500">
          Must include the table’s key attribute(s): {keyAttrs.join(", ") || "—"}
        </p>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete item"
        message={
          <>
            Delete item with key <span className="font-mono">{JSON.stringify(toDelete)}</span>?
          </>
        }
        onConfirm={() => toDelete && delItem.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
