import { Loader2 } from "lucide-react";
import clsx from "clsx";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className)} />;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-500">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
