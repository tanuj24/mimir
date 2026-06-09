import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ddbApi } from "./dynamodbApi";
import { formatBytes, formatDate } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  DetailList,
  StatusBadge,
  useToast,
  type Column,
} from "@/components/ui";

const PAGE_SIZES = [25, 50, 100, 200];

export function TableDetailPage() {
  const { name = "" } = useParams();
  const qc = useQueryClient();
  const { notify } = useToast();
  const [tab, setTab] = useState<"items" | "overview">("items");
  const [itemModal, setItemModal] = useState(false);
  const [itemJson, setItemJson] = useState('{\n  "id": "1"\n}');
  const [toDelete, setToDelete] = useState<Record<string, unknown> | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState(50);
  // Stack of startKeys for visited pages (empty = on page 1).
  // pageStack[i] is the startKey needed to load page i+2.
  const [pageStack, setPageStack] = useState<unknown[]>([]);
  const currentStartKey = pageStack.at(-1);
  const currentPage = pageStack.length + 1;

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Search
  const [search, setSearch] = useState("");

  // Reset pagination + search when table changes.
  useEffect(() => {
    setPageStack([]);
    setSearch("");
    setSortCol(null);
  }, [name]);

  const detail = useQuery({
    queryKey: ["ddb", "describe", name],
    queryFn: () => ddbApi.describe(name),
  });

  const items = useQuery({
    queryKey: ["ddb", "items", name, pageSize, currentStartKey ?? null],
    queryFn: () => ddbApi.scan(name, { limit: pageSize, startKey: currentStartKey }),
  });

  const keyAttrs = useMemo(
    () => (detail.data?.keySchema ?? []).map((k) => k.AttributeName),
    [detail.data],
  );

  const putItem = useMutation({
    mutationFn: () => ddbApi.putItem(name, JSON.parse(itemJson)),
    onSuccess: () => {
      notify("success", "Item saved");
      qc.invalidateQueries({ queryKey: ["ddb", "items", name] });
      setItemModal(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const delItem = useMutation({
    mutationFn: (key: Record<string, unknown>) => ddbApi.deleteItem(name, key),
    onSuccess: () => {
      notify("success", "Item deleted");
      qc.invalidateQueries({ queryKey: ["ddb", "items", name] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const allKeys = useMemo(() => {
    const set = new Set<string>(keyAttrs);
    for (const it of items.data?.items ?? []) Object.keys(it).forEach((k) => set.add(k));
    return Array.from(set);
  }, [items.data, keyAttrs]);

  // Client-side sort + filter applied to the current page.
  const displayedItems = useMemo(() => {
    let rows = items.data?.items ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortCol] ?? "");
        const bv = String(b[sortCol] ?? "");
        const an = Number(av);
        const bn = Number(bv);
        const cmp = !isNaN(an) && !isNaN(bn) && av !== "" && bv !== ""
          ? an - bn
          : av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [items.data, search, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="ml-1 inline h-3 w-3 text-mimir" />
      : <ChevronDown className="ml-1 inline h-3 w-3 text-mimir" />;
  };

  const columns: Column<Record<string, unknown>>[] = [
    ...allKeys.map((k) => ({
      key: k,
      header: (
        <button
          className="flex items-center gap-0.5 hover:text-ink-900"
          onClick={() => handleSort(k)}
        >
          {k}
          {keyAttrs.includes(k) && <span className="ml-1 text-mimir">●</span>}
          <SortIcon col={k} />
        </button>
      ),
      render: (row: Record<string, unknown>) => {
        const v = row[k];
        return (
          <span className="font-mono text-xs">
            {v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        );
      },
    })),
    {
      key: "_actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <button
          className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          onClick={() => {
            const key: Record<string, unknown> = {};
            for (const ka of keyAttrs) key[ka] = row[ka];
            setToDelete(key);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  const hasNext = !!items.data?.lastEvaluatedKey;
  const hasPrev = pageStack.length > 0;

  return (
    <div>
      <PageHeader
        title={name}
        crumbs={[
          { label: "Console Home", to: "/" },
          { label: "DynamoDB", to: "/dynamodb" },
          { label: name },
        ]}
        actions={
          <>
            <button
              className="btn-default"
              onClick={() => {
                detail.refetch();
                items.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="btn-primary" onClick={() => setItemModal(true)}>
              <Plus className="h-4 w-4" /> Create item
            </button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-line">
        {(["items", "overview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-mimir text-mimir" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="card p-5">
          {detail.isLoading ? (
            <LoadingBlock />
          ) : detail.error ? (
            <ErrorState error={detail.error} onRetry={detail.refetch} />
          ) : (
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge status={detail.data?.status} /> },
                { label: "Items", value: detail.data?.itemCount ?? 0 },
                { label: "Size", value: formatBytes(detail.data?.sizeBytes) },
                { label: "Billing mode", value: detail.data?.billingMode },
                {
                  label: "Partition key",
                  value: detail.data?.keySchema.find((k) => k.KeyType === "HASH")?.AttributeName,
                },
                {
                  label: "Sort key",
                  value:
                    detail.data?.keySchema.find((k) => k.KeyType === "RANGE")?.AttributeName ?? "—",
                },
                { label: "Created", value: formatDate(detail.data?.creationDate) },
                { label: "ARN", value: <span className="font-mono text-xs">{detail.data?.arn}</span> },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="card">
          {/* Toolbar: search + page size */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                className="input w-full pl-8 text-sm"
                placeholder="Filter items on this page…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-ink-500">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                className="input py-1 text-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPageStack([]);
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {items.isLoading ? (
            <LoadingBlock />
          ) : items.error ? (
            <ErrorState error={items.error} onRetry={items.refetch} />
          ) : (
            <>
              {/* Result meta + pagination */}
              <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm text-ink-500">
                <span>
                  {search.trim()
                    ? `${displayedItems.length} match${displayedItems.length !== 1 ? "es" : ""} (filtered from ${items.data?.count ?? 0})`
                    : `${items.data?.count ?? 0} item(s) · scanned ${items.data?.scannedCount ?? 0}`}
                  {sortCol && (
                    <span className="ml-2 text-mimir">
                      sorted by {sortCol} {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span>Page {currentPage}</span>
                  <button
                    className="rounded p-1 hover:bg-surface-100 disabled:opacity-40"
                    disabled={!hasPrev}
                    onClick={() => setPageStack((s) => s.slice(0, -1))}
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-surface-100 disabled:opacity-40"
                    disabled={!hasNext}
                    onClick={() =>
                      setPageStack((s) => [...s, items.data?.lastEvaluatedKey])
                    }
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <DataTable
                columns={columns}
                rows={displayedItems}
                rowKey={(r) => keyAttrs.map((k) => String(r[k])).join("#") || JSON.stringify(r)}
                empty={
                  <EmptyState
                    icon={search.trim() ? Search : Plus}
                    title={search.trim() ? "No matches" : "No items"}
                    description={
                      search.trim()
                        ? "No items on this page match your filter."
                        : "Create an item to populate this table."
                    }
                  />
                }
              />
            </>
          )}
        </div>
      )}

      <Modal
        open={itemModal}
        title="Create / edit item"
        onClose={() => setItemModal(false)}
        wide
        footer={
          <>
            <button className="btn-default" onClick={() => setItemModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={putItem.isPending} onClick={() => putItem.mutate()}>
              Save item
            </button>
          </>
        }
      >
        <label className="label">Item JSON</label>
        <textarea
          className="input min-h-[220px] font-mono text-xs"
          value={itemJson}
          onChange={(e) => setItemJson(e.target.value)}
          spellCheck={false}
        />
        <p className="mt-2 text-xs text-ink-500">
          Must include the table's key attribute(s): {keyAttrs.join(", ") || "—"}
        </p>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete item"
        message={
          <>
            Delete item with key <span className="font-mono">{JSON.stringify(toDelete)}</span>?
          </>
        }
        onConfirm={() => toDelete && delItem.mutateAsync(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
