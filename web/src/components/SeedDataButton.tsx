import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";

export function SeedDataButton({
  service,
  onSuccess,
  variant = "default",
}: {
  service: string;
  onSuccess: () => void;
  variant?: "primary" | "default";
}) {
  const qc = useQueryClient();
  const { notify } = useToast();

  const status = useQuery({
    queryKey: ["seed", "status", service],
    queryFn: (): Promise<{ seeded: boolean }> => api.get(`/seed/${service}/status`),
    staleTime: 30_000,
  });

  const seed = useMutation({
    mutationFn: () => api.post(`/seed/${service}`),
    onSuccess: () => {
      notify("success", "Sample data loaded");
      qc.invalidateQueries({ queryKey: ["seed", "status", service] });
      onSuccess();
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const seeded = status.data?.seeded ?? false;

  return (
    <button
      className={`btn-${variant}`}
      disabled={seeded || seed.isPending || status.isLoading}
      title={seeded ? "Sample data already loaded for this service" : "Load sample data"}
      onClick={() => seed.mutate()}
    >
      <Sparkles className="h-4 w-4" />
      {seeded ? "Sample data loaded" : seed.isPending ? "Loading…" : "Load sample data"}
    </button>
  );
}
