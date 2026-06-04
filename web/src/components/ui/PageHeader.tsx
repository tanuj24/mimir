import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-ink-500">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {c.to ? (
            <Link to={c.to} className="link">
              {c.label}
            </Link>
          ) : (
            <span className="text-ink-900">{c.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <div className="mb-4">
      {crumbs && <div className="mb-2"><Breadcrumbs items={crumbs} /></div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
