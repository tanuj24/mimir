import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { getRegion, setRegion, REGIONS } from "@/lib/region";
import { SERVICES } from "@/services/registry";

function HealthDot() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/health"),
    refetchInterval: 15000,
  });
  const reachable = data?.flociReachable;
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-300">
      <Circle
        className={`h-2.5 w-2.5 ${reachable ? "fill-ok text-ok" : "fill-danger text-danger"}`}
      />
      <span className="hidden sm:inline">
        {reachable === undefined ? "…" : reachable ? "Floci connected" : "Floci offline"}
      </span>
    </div>
  );
}

function RegionMenu() {
  const [open, setOpen] = useState(false);
  const [region, setRegionState] = useState(getRegion());
  const current = REGIONS.find((r) => r.id === region);

  function pick(id: string) {
    setRegion(id);
    setRegionState(id);
    setOpen(false);
    // Region is read per-request from localStorage; reload to refetch everything.
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm hover:bg-squid-700"
      >
        <span className="font-medium">{current?.id ?? region}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-line bg-white py-1 text-ink-900 shadow-card">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase text-ink-500">Region</p>
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-canvas ${
                  r.id === region ? "font-semibold text-floci" : ""
                }`}
              >
                <span>{r.name}</span>
                <span className="text-xs text-ink-500">{r.id}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const results = q
    ? SERVICES.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.short.toLowerCase().includes(q.toLowerCase()),
      ).slice(0, 8)
    : [];

  return (
    <div className="relative w-full max-w-md">
      <div className="flex items-center gap-2 rounded-md bg-squid-800 px-3 py-1.5">
        <Search className="h-4 w-4 text-ink-300" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for services"
          className="w-full bg-transparent text-sm text-white placeholder:text-ink-300 outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-white py-1 text-ink-900 shadow-card">
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  navigate(s.available ? s.path : `/coming-soon/${s.id}`);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
              >
                <s.icon className="h-4 w-4" style={{ color: s.color }} />
                <span className="flex-1">{s.name}</span>
                {!s.available && (
                  <span className="text-xs text-ink-300">soon</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  // Close menus on route change handled by individual components.
  useEffect(() => {}, []);
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 bg-squid-600 px-3 text-white">
      <Link to="/" className="flex items-center gap-2 pr-1">
        <span className="grid h-7 w-7 place-items-center rounded bg-floci font-bold">M</span>
        <span className="hidden font-semibold sm:inline">Mimir</span>
      </Link>
      <a
        href="https://floci.io"
        target="_blank"
        rel="noreferrer"
        className="hidden items-center rounded bg-squid-800 px-1.5 py-0.5 text-[11px] text-ink-300 hover:text-white md:inline-flex"
        title="Mimir uses Floci as its local cloud backend"
      >
        Powered by Floci
      </a>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-3">
        <HealthDot />
        <RegionMenu />
        <div className="hidden items-center gap-1 rounded px-2 py-1.5 text-sm md:flex">
          <span className="text-ink-300">account:</span>
          <span className="font-medium">000000000000</span>
        </div>
      </div>
    </header>
  );
}
