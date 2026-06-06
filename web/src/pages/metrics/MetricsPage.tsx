import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { metricsApi, type Metric, type DataPoint } from "./metricsApi";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  type Column,
} from "@/components/ui";

function LineChart({ points }: { points: DataPoint[] }) {
  const values = points.map((p) => p.average ?? 0);
  if (values.length === 0) return <p className="py-8 text-center text-sm text-ink-500">No datapoints in the selected window.</p>;
  const w = 560;
  const h = 200;
  const pad = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const coords = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />
      <path d={path} fill="none" stroke="#ec7211" strokeWidth={2} />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#ec7211" />
      ))}
      <text x={pad} y={pad - 8} fontSize={10} fill="#5f6b7a">{max.toFixed(2)}</text>
      <text x={pad} y={h - pad + 14} fontSize={10} fill="#5f6b7a">{min.toFixed(2)}</text>
    </svg>
  );
}

function MetricModal({ metric, onClose }: { metric: Metric | null; onClose: () => void }) {
  const stats = useQuery({
    queryKey: ["metrics", "stats", metric?.namespace, metric?.name, metric?.dimensions],
    queryFn: () =>
      metricsApi.statistics({
        namespace: metric!.namespace,
        metricName: metric!.name,
        dimensions: metric!.dimensions,
      }),
    enabled: !!metric,
  });
  return (
    <Modal open={!!metric} title={metric?.name ?? ""} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      <p className="mb-1 text-sm text-ink-500">
        {metric?.namespace} · {metric?.dimensions.map((d) => `${d.name}=${d.value}`).join(", ") || "no dimensions"}
      </p>
      {stats.isLoading ? <LoadingBlock /> : <LineChart points={stats.data?.points ?? []} />}
      <p className="mt-2 text-xs text-ink-500">Average over last 3 hours · 5-minute periods · unit {stats.data?.unit ?? "—"}</p>
    </Modal>
  );
}

export function MetricsPage() {
  const [namespace, setNamespace] = useState<string>("");
  const [metric, setMetric] = useState<Metric | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["metrics", "list", namespace],
    queryFn: () => metricsApi.list(namespace || undefined),
  });

  const columns: Column<Metric>[] = [
    { key: "namespace", header: "Namespace", render: (m) => <span className="font-mono text-xs">{m.namespace}</span> },
    {
      key: "name",
      header: "Metric name",
      render: (m) => (
        <button className="link font-medium" onClick={() => setMetric(m)}>
          {m.name}
        </button>
      ),
    },
    {
      key: "dims",
      header: "Dimensions",
      render: (m) => (
        <span className="font-mono text-xs text-ink-500">
          {m.dimensions.map((d) => `${d.name}=${d.value}`).join(", ") || "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="CloudWatch Metrics"
        subtitle="All metrics"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "CloudWatch Metrics" }]}
        actions={
          <>
            <select className="input w-56" value={namespace} onChange={(e) => setNamespace(e.target.value)}>
              <option value="">All namespaces</option>
              {(data?.namespaces ?? []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
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
            rows={data?.metrics ?? []}
            rowKey={(m) => `${m.namespace}/${m.name}/${m.dimensions.map((d) => d.value).join("-")}`}
            empty={<EmptyState icon={Activity} title="No metrics" description="Metrics appear once services emit datapoints to the Mimir backend." />}
          />
        )}
      </div>
      <MetricModal metric={metric} onClose={() => setMetric(null)} />
    </div>
  );
}
