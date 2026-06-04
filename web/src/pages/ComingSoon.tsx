import { useParams, Link } from "react-router-dom";
import { Construction } from "lucide-react";
import { getService } from "@/services/registry";
import { PageHeader } from "@/components/ui";

export function ComingSoon() {
  const { id } = useParams();
  const svc = id ? getService(id) : undefined;

  return (
    <div>
      <PageHeader
        title={svc?.name ?? "Service"}
        subtitle={svc?.description}
        crumbs={[{ label: "Console Home", to: "/" }, { label: svc?.short ?? "Service" }]}
      />
      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="rounded-full bg-floci/10 p-4 text-floci">
          {svc?.icon ? <svc.icon className="h-8 w-8" /> : <Construction className="h-8 w-8" />}
        </div>
        <div>
          <p className="text-lg font-medium">UI coming soon</p>
          <p className="mt-1 max-w-md text-sm text-ink-500">
            Floci already supports {svc?.name ?? "this service"} on the backend. The console screen
            for it is on the roadmap.
          </p>
        </div>
        <Link to="/" className="btn-default">
          Back to Console Home
        </Link>
      </div>
    </div>
  );
}
