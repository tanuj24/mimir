import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText, RefreshCw, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { logsApi, type LogGroup } from "./logsApi";
import { formatBytes, formatDate } from "@/lib/format";
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

function StreamViewer({ group, onBack }: { group: string; onBack: () => void }) {
  const [stream, setStream] = useState<string | null>(null);
  const streams = useQuery({ queryKey: ["logs", "streams", group], queryFn: () => logsApi.streams(group) });
  const events = useQuery({
    queryKey: ["logs", "events", group, stream],
    queryFn: () => logsApi.events(group, stream!),
    enabled: !!stream,
  });

  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-sm link" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> Back to log groups
      </button>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="card">
          <p className="border-b border-line px-3 py-2 text-sm font-medium">Log streams</p>
          {streams.isLoading ? (
            <LoadingBlock />
          ) : (streams.data?.streams.length ?? 0) === 0 ? (
            <EmptyState icon={ScrollText} title="No streams" />
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {streams.data?.streams.map((s) => (
                <li key={s.name}>
                  <button
                    onClick={() => setStream(s.name)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-canvas ${stream === s.name ? "bg-canvas font-medium" : ""}`}
                  >
                    <span className="truncate font-mono text-xs">{s.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card min-h-[300px]">
          <p className="border-b border-line px-3 py-2 text-sm font-medium">
            {stream ? `Events · ${stream}` : "Select a stream"}
          </p>
          {!stream ? (
            <EmptyState icon={ScrollText} title="No stream selected" description="Pick a log stream to view events." />
          ) : events.isLoading ? (
            <LoadingBlock />
          ) : (
            <div className="max-h-[60vh] overflow-auto p-3 font-mono text-xs">
              {(events.data?.events ?? []).length === 0 ? (
                <p className="text-ink-500">No events.</p>
              ) : (
                events.data?.events.map((e, i) => (
                  <div key={i} className="flex gap-3 border-b border-line/50 py-1">
                    <span className="shrink-0 text-ink-300">{formatDate(e.timestamp)}</span>
                    <span className="whitespace-pre-wrap break-all">{e.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LogsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["logs", "groups"],
    queryFn: logsApi.groups,
  });

  const create = useMutation({
    mutationFn: () => logsApi.createGroup(name.trim()),
    onSuccess: () => {
      notify("success", "Log group created");
      qc.invalidateQueries({ queryKey: ["logs", "groups"] });
      setCreateOpen(false);
      setName("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => logsApi.deleteGroup(n),
    onSuccess: () => {
      notify("success", "Log group deleted");
      qc.invalidateQueries({ queryKey: ["logs", "groups"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<LogGroup>[] = [
    {
      key: "name",
      header: "Log group",
      render: (g) => (
        <button className="link font-medium" onClick={() => setOpenGroup(g.name)}>
          {g.name}
        </button>
      ),
    },
    { key: "retention", header: "Retention", render: (g) => (g.retentionInDays ? `${g.retentionInDays} days` : "Never expire") },
    { key: "stored", header: "Stored bytes", render: (g) => formatBytes(g.storedBytes) },
    { key: "created", header: "Created", render: (g) => formatDate(g.creationTime) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (g) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(g.name)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="CloudWatch Logs"
        subtitle="Log groups"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "CloudWatch Logs" }]}
        actions={
          !openGroup && (
            <>
              <SeedDataButton service="logs" onSuccess={refetch} />
              <button className="btn-default" onClick={() => refetch()}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create log group</button>
            </>
          )
        }
      />

      {openGroup ? (
        <StreamViewer group={openGroup} onBack={() => setOpenGroup(null)} />
      ) : (
        <div className="card">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : (
            <DataTable
              columns={columns}
              rows={data?.groups ?? []}
              rowKey={(g) => g.name}
              empty={<EmptyState icon={ScrollText} title="No log groups" description="Create a log group or let a service create one." />}
            />
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        title="Create log group"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Log group name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="/aws/lambda/my-fn" autoFocus />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete log group"
        message={<>Delete log group <strong>{toDelete}</strong> and all its streams?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
