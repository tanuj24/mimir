import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, RefreshCw, Trash2 } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { ddbApi } from "./dynamodbApi";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  useToast,
  type Column,
} from "@/components/ui";

function CreateTableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [pk, setPk] = useState("");
  const [pkType, setPkType] = useState("S");
  const [sk, setSk] = useState("");
  const [skType, setSkType] = useState("S");
  const qc = useQueryClient();
  const { notify } = useToast();

  const m = useMutation({
    mutationFn: () =>
      ddbApi.createTable({
        name: name.trim(),
        partitionKey: pk.trim(),
        partitionKeyType: pkType,
        sortKey: sk.trim() || undefined,
        sortKeyType: sk.trim() ? skType : undefined,
      }),
    onSuccess: () => {
      notify("success", `Table "${name}" created`);
      qc.invalidateQueries({ queryKey: ["ddb", "tables"] });
      onClose();
      setName("");
      setPk("");
      setSk("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={open}
      title="Create table"
      onClose={onClose}
      footer={
        <>
          <button className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim() || !pk.trim() || m.isPending}
            onClick={() => m.mutate()}
          >
            Create table
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Table name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Users" autoFocus />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">Partition key</label>
            <input className="input" value={pk} onChange={(e) => setPk(e.target.value)} placeholder="id" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={pkType} onChange={(e) => setPkType(e.target.value)}>
              <option value="S">String</option>
              <option value="N">Number</option>
              <option value="B">Binary</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">Sort key (optional)</label>
            <input className="input" value={sk} onChange={(e) => setSk(e.target.value)} placeholder="createdAt" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={skType} onChange={(e) => setSkType(e.target.value)} disabled={!sk}>
              <option value="S">String</option>
              <option value="N">Number</option>
              <option value="B">Binary</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-500">Created with on-demand (PAY_PER_REQUEST) capacity.</p>
      </div>
    </Modal>
  );
}

export function TablesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const qc = useQueryClient();
  const { notify } = useToast();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ddb", "tables"],
    queryFn: ddbApi.listTables,
  });

  const del = useMutation({
    mutationFn: (name: string) => ddbApi.deleteTable(name),
    onSuccess: (_d, name) => {
      notify("success", `Table "${name}" deleted`);
      qc.invalidateQueries({ queryKey: ["ddb", "tables"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<string>[] = [
    {
      key: "name",
      header: "Table name",
      render: (name) => (
        <Link to={`/dynamodb/${encodeURIComponent(name)}`} className="link font-medium">
          {name}
        </Link>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (name) => (
        <button
          className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          onClick={() => setToDelete(name)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon DynamoDB"
        subtitle="Tables"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "DynamoDB" }]}
        actions={
          <>
            <SeedDataButton service="dynamodb" onSuccess={refetch} />
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create table
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
            rows={data?.tables ?? []}
            rowKey={(t) => t}
            empty={
              <EmptyState
                icon={Database}
                title="No tables yet"
                description="Create a table to start storing items."
                action={
                  <div className="flex gap-2">
                    <SeedDataButton service="dynamodb" onSuccess={refetch} variant="primary" />
                    <button className="btn-default" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Create table
                    </button>
                  </div>
                }
              />
            }
          />
        )}
      </div>

      <CreateTableModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete table"
        message={
          <>
            Permanently delete table <strong>{toDelete}</strong> and all its items?
          </>
        }
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
