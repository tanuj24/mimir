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
  const reachable = data?.backendReachable;
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-300">
      <Circle
        className={`h-2.5 w-2.5 ${reachable ? "fill-ok text-ok" : "fill-danger text-danger"}`}
      />
      <span className="hidden sm:inline">
        {reachable === undefined ? "…" : reachable ? "Backend connected" : "Backend offline"}
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
                  r.id === region ? "font-semibold text-mimir" : ""
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
      <Link to="/" className="flex items-center gap-2 pr-1 transition-opacity hover:opacity-80">
        <svg className="h-7 w-7" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="topbar-lg1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4dd9ff"/>
              <stop offset="100%" stopColor="#36d5c0"/>
            </linearGradient>
            <linearGradient id="topbar-lg2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#36d5c0"/>
              <stop offset="100%" stopColor="#0d94d9"/>
            </linearGradient>
            <linearGradient id="topbar-cg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4dd9ff"/>
              <stop offset="100%" stopColor="#0d94d9"/>
            </linearGradient>
          </defs>
          <ellipse cx="55" cy="70" rx="32" ry="28" fill="url(#topbar-lg1)"/>
          <circle cx="35" cy="65" r="22" fill="url(#topbar-lg1)"/>
          <circle cx="47" cy="48" r="26" fill="url(#topbar-lg1)"/>
          <ellipse cx="145" cy="70" rx="32" ry="28" fill="url(#topbar-lg2)"/>
          <circle cx="165" cy="65" r="22" fill="url(#topbar-lg2)"/>
          <circle cx="153" cy="48" r="26" fill="url(#topbar-lg2)"/>
          <polyline points="80,75 95,90 110,70" fill="none" stroke="url(#topbar-cg)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="110,70 130,50 150,30" fill="none" stroke="url(#topbar-cg)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="hidden font-semibold sm:inline">Mimir</span>
      </Link>
      <span
        className="hidden items-center rounded bg-squid-800 px-1.5 py-0.5 text-[11px] text-ink-300 md:inline-flex"
        title="Mimir bundles its own local AWS cloud backend"
      >
        Local AWS cloud
      </span>
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
