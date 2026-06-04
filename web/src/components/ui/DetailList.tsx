import type { ReactNode } from "react";

export function DetailList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-4 ${cols}`}>
      {items.map((it, i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-900">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const ok = ["active", "available", "running", "enabled", "creating", "in_use", "completed"].some((x) =>
    s.includes(x),
  );
  const bad = ["deleting", "failed", "inactive", "disabled", "stopped", "pending_deletion"].some((x) =>
    s.includes(x),
  );
  const pending = ["pending", "updating", "provisioning"].some((x) => s.includes(x));
  const color = bad
    ? "bg-danger/10 text-danger"
    : pending
      ? "bg-warn/10 text-warn"
      : ok
        ? "bg-ok/10 text-ok"
        : "bg-ink-300/20 text-ink-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status ?? "—"}
    </span>
  );
}
