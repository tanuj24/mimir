import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { SERVICES, servicesByCategory, CATEGORY_ORDER } from "@/services/registry";

function ConnectionCard() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: () => api.get("/health") });
  return (
    <div className="card flex items-center justify-between p-4">
      <div>
        <p className="text-sm text-ink-500">Connected backend</p>
        <p className="font-mono text-sm">{data?.flociEndpoint ?? "…"}</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Circle
          className={`h-2.5 w-2.5 ${data?.flociReachable ? "fill-ok text-ok" : "fill-danger text-danger"}`}
        />
        {data?.flociReachable ? "Floci reachable" : "Floci offline"}
      </div>
    </div>
  );
}

export function Home() {
  const grouped = servicesByCategory();
  const available = SERVICES.filter((s) => s.available);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Console Home</h1>
        <p className="mt-1 text-sm text-ink-500">
          See your cloud, before you ship your cloud. Build and test against {SERVICES.length}{" "}
          services locally — powered by{" "}
          <a href="https://floci.io" target="_blank" rel="noreferrer" className="link">
            Floci
          </a>
          .
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConnectionCard />
        <div className="card p-4">
          <p className="text-sm text-ink-500">Services available</p>
          <p className="text-2xl font-semibold">
            {available.length}
            <span className="text-base font-normal text-ink-300"> / {SERVICES.length}</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ink-500">Cost</p>
          <p className="text-2xl font-semibold text-ok">$0.00</p>
        </div>
      </div>

      {available.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Ready to use
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {available.map((s) => (
              <Link key={s.id} to={s.path} className="card group p-4 transition-shadow hover:shadow-lg">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                  >
                    <s.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 font-medium group-hover:text-floci">
                      {s.name}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                    <p className="mt-0.5 text-sm text-ink-500">{s.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          All services
        </h2>
        <div className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-medium text-ink-700">{cat}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      to={s.available ? s.path : `/coming-soon/${s.id}`}
                      className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:border-floci/40 hover:bg-canvas"
                    >
                      <s.icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
                      <span className="flex-1 truncate">{s.name}</span>
                      {!s.available && <span className="text-xs text-ink-300">soon</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
