import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, RefreshCw, Trash2, Megaphone, Plus } from "lucide-react";
import { snsApi, type Topic } from "./snsApi";
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

function TopicDrawer({ topic, onClose }: { topic: Topic | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [message, setMessage] = useState('{\n  "event": "hello"\n}');
  const [subject, setSubject] = useState("");
  const [protocol, setProtocol] = useState("sqs");
  const [endpoint, setEndpoint] = useState("");
  const fifo = topic?.name?.endsWith(".fifo");

  const details = useQuery({
    queryKey: ["sns", "details", topic?.arn],
    queryFn: () => snsApi.details(topic!.arn),
    enabled: !!topic,
  });

  const publish = useMutation({
    mutationFn: () => snsApi.publish(topic!.arn, message, subject || undefined, fifo ? "default" : undefined),
    onSuccess: (r) => notify("success", `Published ${r.messageId}`),
    onError: (e: Error) => notify("error", e.message),
  });

  const subscribe = useMutation({
    mutationFn: () => snsApi.subscribe(topic!.arn, protocol, endpoint),
    onSuccess: () => {
      notify("success", "Subscription created");
      qc.invalidateQueries({ queryKey: ["sns", "details", topic?.arn] });
      setEndpoint("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const unsub = useMutation({
    mutationFn: (arn: string) => snsApi.unsubscribe(arn),
    onSuccess: () => {
      notify("success", "Unsubscribed");
      qc.invalidateQueries({ queryKey: ["sns", "details", topic?.arn] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal open={!!topic} title={topic?.name ?? ""} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      <div>
        <label className="label">Publish message</label>
        <input className="input mb-2" placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea className="input min-h-[90px] font-mono text-xs" value={message} onChange={(e) => setMessage(e.target.value)} spellCheck={false} />
        <button className="btn-primary mt-2" disabled={publish.isPending} onClick={() => publish.mutate()}>
          <Megaphone className="h-4 w-4" /> Publish
        </button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="label">Subscriptions ({details.data?.subscriptions.length ?? 0})</p>
        <div className="mb-3 space-y-1">
          {(details.data?.subscriptions ?? []).map((s) => (
            <div key={s.arn} className="flex items-center justify-between rounded border border-line px-3 py-1.5 text-sm">
              <span><span className="font-medium">{s.protocol}</span> → <span className="font-mono text-xs">{s.endpoint}</span></span>
              {s.arn !== "PendingConfirmation" && (
                <button className="text-ink-500 hover:text-danger" onClick={() => unsub.mutate(s.arn)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="input w-32" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            <option value="sqs">sqs</option>
            <option value="lambda">lambda</option>
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="email">email</option>
          </select>
          <input className="input flex-1" placeholder="endpoint (e.g. queue ARN)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          <button className="btn-default" disabled={!endpoint || subscribe.isPending} onClick={() => subscribe.mutate()}>
            <Plus className="h-4 w-4" /> Subscribe
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SnsPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [fifo, setFifo] = useState(false);
  const [drawer, setDrawer] = useState<Topic | null>(null);
  const [toDelete, setToDelete] = useState<Topic | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["sns", "topics"],
    queryFn: snsApi.list,
  });

  const create = useMutation({
    mutationFn: () => snsApi.create(name.trim(), fifo),
    onSuccess: () => {
      notify("success", "Topic created");
      qc.invalidateQueries({ queryKey: ["sns", "topics"] });
      setCreateOpen(false);
      setName("");
      setFifo(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (arn: string) => snsApi.remove(arn),
    onSuccess: () => {
      notify("success", "Topic deleted");
      qc.invalidateQueries({ queryKey: ["sns", "topics"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Topic>[] = [
    {
      key: "name",
      header: "Name",
      render: (t) => (
        <button className="link font-medium" onClick={() => setDrawer(t)}>
          {t.name}
        </button>
      ),
    },
    { key: "arn", header: "ARN", render: (t) => <span className="font-mono text-xs text-ink-500">{t.arn}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (t) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(t)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon SNS"
        subtitle="Topics"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "SNS" }]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create topic</button>
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
            rows={data?.topics ?? []}
            rowKey={(t) => t.arn}
            empty={<EmptyState icon={Bell} title="No topics" description="Create a topic to publish notifications." />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create topic"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Topic name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-topic" autoFocus />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fifo} onChange={(e) => setFifo(e.target.checked)} />
          FIFO topic
        </label>
      </Modal>

      <TopicDrawer topic={drawer} onClose={() => setDrawer(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete topic"
        message={<>Delete topic <strong>{toDelete?.name}</strong>?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.arn)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
