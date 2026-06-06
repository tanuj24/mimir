import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, RefreshCw, Trash2, Inbox, Eraser } from "lucide-react";
import { sqsApi, type Queue } from "./sqsApi";
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

function QueueDrawer({ queue, onClose }: { queue: Queue | null; onClose: () => void }) {
  const [body, setBody] = useState('{\n  "hello": "mimir"\n}');
  const [received, setReceived] = useState<{ messageId: string; body: string }[]>([]);
  const { notify } = useToast();
  const fifo = queue?.name?.endsWith(".fifo");

  const attrs = useQuery({
    queryKey: ["sqs", "attrs", queue?.url],
    queryFn: () => sqsApi.attributes(queue!.url),
    enabled: !!queue,
  });

  const send = useMutation({
    mutationFn: () => sqsApi.send(queue!.url, body, fifo ? "default" : undefined),
    onSuccess: (r) => notify("success", `Sent message ${r.messageId}`),
    onError: (e: Error) => notify("error", e.message),
  });

  const receive = useMutation({
    mutationFn: () => sqsApi.receive(queue!.url),
    onSuccess: (r) => {
      setReceived(r.messages);
      notify("success", `Received ${r.messages.length} message(s)`);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const a = attrs.data?.attributes ?? {};

  return (
    <Modal open={!!queue} title={queue?.name ?? ""} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="card p-3"><p className="text-xs text-ink-500">Available</p><p className="text-lg font-semibold">{a.ApproximateNumberOfMessages ?? "—"}</p></div>
        <div className="card p-3"><p className="text-xs text-ink-500">In flight</p><p className="text-lg font-semibold">{a.ApproximateNumberOfMessagesNotVisible ?? "—"}</p></div>
        <div className="card p-3"><p className="text-xs text-ink-500">Type</p><p className="text-lg font-semibold">{fifo ? "FIFO" : "Standard"}</p></div>
      </div>

      <div className="mt-4">
        <label className="label">Send message body</label>
        <textarea className="input min-h-[100px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
        <div className="mt-2 flex gap-2">
          <button className="btn-primary" disabled={send.isPending} onClick={() => send.mutate()}>
            <Send className="h-4 w-4" /> Send
          </button>
          <button className="btn-default" disabled={receive.isPending} onClick={() => receive.mutate()}>
            <Inbox className="h-4 w-4" /> Poll for messages
          </button>
        </div>
      </div>

      {received.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="label">Received ({received.length})</p>
          {received.map((m) => (
            <div key={m.messageId}>
              <p className="mb-1 font-mono text-xs text-ink-500">{m.messageId}</p>
              <CodeBlock value={m.body} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function SqsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [fifo, setFifo] = useState(false);
  const [drawer, setDrawer] = useState<Queue | null>(null);
  const [toDelete, setToDelete] = useState<Queue | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["sqs", "queues"],
    queryFn: sqsApi.list,
  });

  const create = useMutation({
    mutationFn: () => sqsApi.create(name.trim(), fifo),
    onSuccess: () => {
      notify("success", "Queue created");
      qc.invalidateQueries({ queryKey: ["sqs", "queues"] });
      setCreateOpen(false);
      setName("");
      setFifo(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (url: string) => sqsApi.remove(url),
    onSuccess: () => {
      notify("success", "Queue deleted");
      qc.invalidateQueries({ queryKey: ["sqs", "queues"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const purge = useMutation({
    mutationFn: (url: string) => sqsApi.purge(url),
    onSuccess: () => notify("success", "Queue purged"),
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Queue>[] = [
    {
      key: "name",
      header: "Name",
      render: (q) => (
        <button className="link font-medium" onClick={() => setDrawer(q)}>
          {q.name}
        </button>
      ),
    },
    { key: "type", header: "Type", render: (q) => (q.name?.endsWith(".fifo") ? "FIFO" : "Standard") },
    { key: "url", header: "URL", render: (q) => <span className="font-mono text-xs text-ink-500">{q.url}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (q) => (
        <div className="flex justify-end gap-1">
          <button className="rounded p-1.5 text-ink-500 hover:bg-canvas" onClick={() => purge.mutate(q.url)} title="Purge">
            <Eraser className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(q)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon SQS"
        subtitle="Queues"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "SQS" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              Create queue
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
            rows={data?.queues ?? []}
            rowKey={(q) => q.url}
            empty={<EmptyState icon={Send} title="No queues" description="Create a queue to start sending messages." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create queue"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Queue name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-queue" autoFocus />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fifo} onChange={(e) => setFifo(e.target.checked)} />
          FIFO queue (.fifo suffix added automatically)
        </label>
      </Modal>

      <QueueDrawer queue={drawer} onClose={() => setDrawer(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete queue"
        message={<>Delete queue <strong>{toDelete?.name}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.url)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
