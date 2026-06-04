import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Trash2, Table2 } from "lucide-react";
import { glueApi, type GlueDatabase } from "./glueApi";
import { formatDate } from "@/lib/format";
import {
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  useToast,
  type Column,
} from "@/components/ui";

function TablesModal({ db, onClose }: { db: GlueDatabase | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["glue", "tables", db?.name],
    queryFn: () => glueApi.tables(db!.name),
    enabled: !!db,
  });
  return (
    <Modal open={!!db} title={`${db?.name} · tables`} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (q.data?.tables.length ?? 0) === 0 ? (
        <EmptyState icon={Table2} title="No tables" description="This database has no catalog tables." />
      ) : (
        <div className="space-y-4">
          {q.data?.tables.map((t) => (
            <div key={t.name} className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">{t.name}</p>
                <span className="text-xs text-ink-500">{t.tableType ?? "TABLE"}</span>
              </div>
              {t.location && <p className="mb-2 font-mono text-xs text-ink-500">{t.location}</p>}
              <DataTable
                columns={[
                  { key: "col", header: "Column", render: (c) => <span className="font-mono text-xs">{c.name}</span> },
                  { key: "type", header: "Type", render: (c) => <span className="font-mono text-xs text-link">{c.type}</span> },
                  { key: "comment", header: "Comment", render: (c) => c.comment ?? "—" },
                ]}
                rows={t.columns}
                rowKey={(c) => c.name}
                empty={<EmptyState icon={Table2} title="No columns" />}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function CatalogTab() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [view, setView] = useState<GlueDatabase | null>(null);
  const [toDelete, setToDelete] = useState<GlueDatabase | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["glue", "databases"],
    queryFn: glueApi.databases,
  });

  const create = useMutation({
    mutationFn: () => glueApi.createDatabase(form.name.trim(), form.description || undefined),
    onSuccess: () => {
      notify("success", "Database created");
      qc.invalidateQueries({ queryKey: ["glue", "databases"] });
      setCreateOpen(false);
      setForm({ name: "", description: "" });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => glueApi.deleteDatabase(n),
    onSuccess: () => {
      notify("success", "Database deleted");
      qc.invalidateQueries({ queryKey: ["glue", "databases"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<GlueDatabase>[] = [
    {
      key: "name",
      header: "Database",
      render: (d) => (
        <button className="link font-medium" onClick={() => setView(d)}>
          {d.name}
        </button>
      ),
    },
    { key: "desc", header: "Description", render: (d) => d.description || "—" },
    { key: "location", header: "Location", render: (d) => <span className="font-mono text-xs text-ink-500">{d.locationUri ?? "—"}</span> },
    { key: "created", header: "Created", render: (d) => formatDate(d.createTime) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (d) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(d)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-500">Databases &amp; tables — backed by Floci’s real Glue Data Catalog API.</p>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>Add database</button>
      </div>
      <div className="card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.databases ?? []}
            rowKey={(d) => d.name}
            empty={<EmptyState icon={BookOpen} title="No databases" description="Create a catalog database to organize tables." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Add database"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <div className="space-y-3">
          <div><label className="label">Database name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="analytics" autoFocus /></div>
          <div><label className="label">Description (optional)</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
      </Modal>

      <TablesModal db={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete database"
        message={<>Delete database <strong>{toDelete?.name}</strong> and its tables?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.name)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
