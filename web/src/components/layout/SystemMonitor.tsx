import { useQuery } from "@tanstack/react-query";
import { Cpu, MemoryStick, Boxes } from "lucide-react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";

interface SystemStats {
  cpuPercent: number;
  cores: number;
  memUsedBytes: number;
  memTotalBytes: number;
  containers: number;
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-danger";
  if (pct >= 70) return "bg-warn";
  return "bg-ok";
}

function Meter({
  icon: Icon,
  label,
  pct,
  detail,
}: {
  icon: typeof Cpu;
  label: string;
  pct: number;
  detail: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex min-w-0 items-center gap-2" title={`${label}: ${detail}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
      <span className="hidden shrink-0 text-ink-500 sm:inline">{label}</span>
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink-300/30">
        <div className={`h-full rounded-full ${barColor(clamped)} transition-[width]`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="shrink-0 tabular-nums text-ink-700">{detail}</span>
    </div>
  );
}

export function SystemMonitor() {
  const { data } = useQuery<SystemStats>({
    queryKey: ["system", "stats"],
    queryFn: () => api.get("/system/stats"),
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const memPct = data && data.memTotalBytes ? (data.memUsedBytes / data.memTotalBytes) * 100 : 0;

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-line bg-canvas/80 px-4 py-1.5 text-xs backdrop-blur">
      <span className="hidden font-medium text-ink-700 md:inline">Local resources</span>
      <Meter
        icon={Cpu}
        label="CPU"
        pct={data?.cpuPercent ?? 0}
        detail={data ? `${Math.round(data.cpuPercent)}% · ${data.cores} cores` : "…"}
      />
      <Meter
        icon={MemoryStick}
        label="RAM"
        pct={memPct}
        detail={data ? `${formatBytes(data.memUsedBytes)} / ${formatBytes(data.memTotalBytes)}` : "…"}
      />
      <div className="flex items-center gap-1.5 text-ink-500" title="Running containers">
        <Boxes className="h-3.5 w-3.5" />
        <span className="tabular-nums text-ink-700">{data?.containers ?? "…"}</span>
        <span className="hidden sm:inline">containers</span>
      </div>
      <span className="ml-auto hidden text-ink-300 lg:inline">the Mimir backend, Glue jobs &amp; EC2 all run as local containers</span>
    </div>
  );
}
