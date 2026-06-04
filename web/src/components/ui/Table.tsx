import type { ReactNode } from "react";
import clsx from "clsx";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Render a cell. */
  render: (row: T) => ReactNode;
  className?: string;
  width?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (key: string) => void;
  onToggleAll?: (checked: boolean) => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-left text-xs uppercase tracking-wide text-ink-500">
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={!!allSelected}
                  onChange={(e) => onToggleAll?.(e.target.checked)}
                  className="cursor-pointer"
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={clsx("px-3 py-2.5 font-semibold", c.className)} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={clsx(
                    "border-b border-line/70 hover:bg-canvas/60",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!selected?.has(key)}
                        onChange={() => onToggle?.(key)}
                        className="cursor-pointer"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={clsx("px-3 py-2.5 align-middle", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
