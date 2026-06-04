import { useState } from "react";
import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Home } from "lucide-react";
import clsx from "clsx";
import { servicesByCategory, CATEGORY_ORDER } from "@/services/registry";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const grouped = servicesByCategory();

  return (
    <aside
      className={clsx(
        "flex h-full flex-col border-r border-line bg-squid-900 text-white transition-all",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-300">
            Services
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-1 text-ink-300 hover:bg-squid-700 hover:text-white"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto pb-6">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-squid-700",
              isActive && "bg-squid-700 font-medium",
            )
          }
        >
          <Home className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Console Home</span>}
        </NavLink>

        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (!items?.length) return null;
          return (
            <div key={cat} className="mt-3">
              {!collapsed && (
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-300/70">
                  {cat}
                </p>
              )}
              {items.map((s) => (
                <NavLink
                  key={s.id}
                  to={s.available ? s.path : `/coming-soon/${s.id}`}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-squid-700",
                      isActive && "bg-squid-700 font-medium",
                      !s.available && "opacity-60",
                    )
                  }
                  title={s.short}
                >
                  <s.icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
                  {!collapsed && (
                    <span className="flex-1 truncate">{s.short}</span>
                  )}
                  {!collapsed && !s.available && (
                    <span className="text-[10px] text-ink-300">soon</span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
