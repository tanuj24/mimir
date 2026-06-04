import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Server, Play, Square, Trash2, SquareTerminal } from "lucide-react";
import { ec2Api, type Instance } from "./ec2Api";
import { TerminalModal } from "./TerminalModal";
import { formatDate } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  StatusBadge,
  useToast,
  type Column,
} from "@/components/ui";

type Tab = "instances" | "security-groups" | "vpcs" | "images";
const TABS: { id: Tab; label: string }[] = [
  { id: "instances", label: "Instances" },
  { id: "security-groups", label: "Security groups" },
  { id: "vpcs", label: "VPCs" },
  { id: "images", label: "AMIs" },
];

function InstancesTab() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [launchOpen, setLaunchOpen] = useState(false);
  const [form, setForm] = useState({ name: "", imageId: "ami-12345678", instanceType: "t3.micro" });
  const [terminalFor, setTerminalFor] = useState<Instance | null>(null);

  const q = useQuery({ queryKey: ["ec2", "instances"], queryFn: ec2Api.instances });

  const launch = useMutation({
    mutationFn: () => ec2Api.launch(form),
    onSuccess: () => {
      notify("success", "Instance launched");
      qc.invalidateQueries({ queryKey: ["ec2", "instances"] });
      setLaunchOpen(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "stop" | "terminate" }) =>
      ec2Api.setState([id], action),
    onSuccess: () => {
      notify("success", "Instance state updated");
      qc.invalidateQueries({ queryKey: ["ec2", "instances"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Instance>[] = [
    { key: "name", header: "Name", render: (i) => i.name || <span className="text-ink-300">—</span> },
    { key: "id", header: "Instance ID", render: (i) => <span className="font-mono text-xs">{i.id}</span> },
    { key: "state", header: "State", render: (i) => <StatusBadge status={i.state} /> },
    { key: "type", header: "Type", render: (i) => i.type },
    { key: "az", header: "AZ", render: (i) => i.az ?? "—" },
    { key: "ip", header: "Private IP", render: (i) => i.privateIp ?? "—" },
    { key: "launch", header: "Launched", render: (i) => formatDate(i.launchTime) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (i) => (
        <div className="flex justify-end gap-1">
          {i.state === "running" && (
            <button className="rounded p-1.5 text-ink-500 hover:bg-floci/10 hover:text-floci" onClick={() => setTerminalFor(i)} title="Connect (terminal)">
              <SquareTerminal className="h-4 w-4" />
            </button>
          )}
          <button className="rounded p-1.5 text-ink-500 hover:bg-ok/10 hover:text-ok" onClick={() => act.mutate({ id: i.id, action: "start" })} title="Start">
            <Play className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-warn/10 hover:text-warn" onClick={() => act.mutate({ id: i.id, action: "stop" })} title="Stop">
            <Square className="h-4 w-4" />
          </button>
          <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => act.mutate({ id: i.id, action: "terminate" })} title="Terminate">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={() => setLaunchOpen(true)}>Launch instance</button>
      </div>
      <div className="card">
        {q.isLoading ? (
          <LoadingBlock />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={q.data?.instances ?? []}
            rowKey={(i) => i.id}
            empty={<EmptyState icon={Server} title="No instances" description="Launch an instance to get started." />}
          />
        )}
      </div>
      <Modal
        open={launchOpen}
        title="Launch instance"
        onClose={() => setLaunchOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setLaunchOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={launch.isPending} onClick={() => launch.mutate()}>Launch</button>
          </>
        }
      >
        <div className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="web-server" /></div>
          <div><label className="label">AMI ID</label><input className="input font-mono text-xs" value={form.imageId} onChange={(e) => setForm({ ...form, imageId: e.target.value })} /></div>
          <div><label className="label">Instance type</label><input className="input" value={form.instanceType} onChange={(e) => setForm({ ...form, instanceType: e.target.value })} /></div>
        </div>
      </Modal>
      <TerminalModal instance={terminalFor} onClose={() => setTerminalFor(null)} />
    </>
  );
}

function SimpleTab<T>({
  queryKey,
  queryFn,
  columns,
  rowKey,
  emptyTitle,
}: {
  queryKey: string[];
  queryFn: () => Promise<{ [k: string]: T[] }>;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  emptyTitle: string;
}) {
  const q = useQuery({ queryKey, queryFn });
  const rows = q.data ? Object.values(q.data)[0] : [];
  return (
    <div className="card">
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <DataTable columns={columns} rows={rows ?? []} rowKey={rowKey} empty={<EmptyState icon={Server} title={emptyTitle} />} />
      )}
    </div>
  );
}

export function Ec2Page() {
  const [tab, setTab] = useState<Tab>("instances");

  return (
    <div>
      <PageHeader
        title="Amazon EC2"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "EC2" }]}
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-floci text-floci" : "border-transparent text-ink-500 hover:text-ink-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "instances" && <InstancesTab />}
      {tab === "security-groups" && (
        <SimpleTab
          queryKey={["ec2", "sgs"]}
          queryFn={ec2Api.securityGroups}
          rowKey={(g) => g.id}
          emptyTitle="No security groups"
          columns={[
            { key: "id", header: "Group ID", render: (g) => <span className="font-mono text-xs">{g.id}</span> },
            { key: "name", header: "Name", render: (g) => g.name },
            { key: "desc", header: "Description", render: (g) => g.description },
            { key: "vpc", header: "VPC", render: (g) => <span className="font-mono text-xs">{g.vpcId}</span> },
            { key: "in", header: "Inbound", render: (g) => g.inboundRules },
            { key: "out", header: "Outbound", render: (g) => g.outboundRules },
          ]}
        />
      )}
      {tab === "vpcs" && (
        <SimpleTab
          queryKey={["ec2", "vpcs"]}
          queryFn={ec2Api.vpcs}
          rowKey={(v) => v.id}
          emptyTitle="No VPCs"
          columns={[
            { key: "id", header: "VPC ID", render: (v) => <span className="font-mono text-xs">{v.id}</span> },
            { key: "name", header: "Name", render: (v) => v.name ?? "—" },
            { key: "cidr", header: "CIDR", render: (v) => v.cidr },
            { key: "state", header: "State", render: (v) => <StatusBadge status={v.state} /> },
            { key: "default", header: "Default", render: (v) => (v.isDefault ? "Yes" : "No") },
          ]}
        />
      )}
      {tab === "images" && (
        <SimpleTab
          queryKey={["ec2", "images"]}
          queryFn={ec2Api.images}
          rowKey={(i) => i.id}
          emptyTitle="No AMIs"
          columns={[
            { key: "id", header: "AMI ID", render: (i) => <span className="font-mono text-xs">{i.id}</span> },
            { key: "name", header: "Name", render: (i) => i.name ?? "—" },
            { key: "arch", header: "Architecture", render: (i) => i.architecture ?? "—" },
            { key: "state", header: "State", render: (i) => <StatusBadge status={i.state} /> },
          ]}
        />
      )}
    </div>
  );
}
