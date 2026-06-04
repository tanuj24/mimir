import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-danger/10 p-3 text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <p className="font-medium text-ink-900">Request failed</p>
        <p className="mt-1 max-w-md text-sm text-ink-500">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-default" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}
