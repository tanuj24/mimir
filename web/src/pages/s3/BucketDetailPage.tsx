import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FolderPlus,
  Upload,
  RefreshCw,
  Trash2,
  Folder,
  File as FileIcon,
  ChevronRight,
} from "lucide-react";
import { s3Api, type S3Object } from "./s3Api";
import { formatBytes, formatDate } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  LoadingBlock,
  ErrorState,
  EmptyState,
  Modal,
  ConfirmDialog,
  useToast,
  type Column,
} from "@/components/ui";

type Row =
  | { kind: "prefix"; key: string; name: string }
  | { kind: "object"; key: string; name: string; obj: S3Object };

export function BucketDetailPage() {
  const { bucket = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const prefix = search.get("prefix") ?? "";
  const qc = useQueryClient();
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const queryKey = ["s3", "objects", bucket, prefix];
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => s3Api.listObjects(bucket, prefix),
  });

  function setPrefix(p: string) {
    setSelected(new Set());
    if (p) setSearch({ prefix: p });
    else setSearch({});
  }

  const upload = useMutation({
    mutationFn: (files: File[]) => s3Api.upload(bucket, prefix, files),
    onSuccess: (r: { uploaded: string[] }) => {
      notify("success", `Uploaded ${r.uploaded.length} object(s)`);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const createFolder = useMutation({
    mutationFn: () => s3Api.createFolder(bucket, `${prefix}${folderName}`),
    onSuccess: () => {
      notify("success", "Folder created");
      qc.invalidateQueries({ queryKey });
      setFolderName("");
      setFolderOpen(false);
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const deleteSelected = useMutation({
    mutationFn: () => s3Api.deleteObjects(bucket, Array.from(selected)),
    onSuccess: (r: { deleted: string[] }) => {
      notify("success", `Deleted ${r.deleted.length} object(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  async function download(key: string) {
    try {
      const { url } = await s3Api.downloadUrl(bucket, key);
      window.open(url, "_blank");
    } catch (e) {
      notify("error", (e as Error).message);
    }
  }

  const rows: Row[] = [
    ...(data?.commonPrefixes ?? []).map((p) => ({
      kind: "prefix" as const,
      key: p,
      name: p.slice(prefix.length).replace(/\/$/, ""),
    })),
    ...(data?.objects ?? [])
      .filter((o) => o.key !== prefix) // hide the folder placeholder itself
      .map((o) => ({
        kind: "object" as const,
        key: o.key,
        name: o.key.slice(prefix.length),
        obj: o,
      })),
  ];

  const selectableKeys = rows.filter((r) => r.kind === "object").map((r) => r.key);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) =>
        r.kind === "prefix" ? (
          <button
            className="flex items-center gap-2 font-medium text-link hover:underline"
            onClick={() => setPrefix(r.key)}
          >
            <Folder className="h-4 w-4 text-mimir" />
            {r.name}/
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <FileIcon className="h-4 w-4 text-ink-300" />
            {r.name}
          </span>
        ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (r.kind === "prefix" ? "Folder" : "Object"),
    },
    {
      key: "size",
      header: "Size",
      render: (r) => (r.kind === "object" ? formatBytes(r.obj.size) : "—"),
    },
    {
      key: "modified",
      header: "Last modified",
      render: (r) => (r.kind === "object" ? formatDate(r.obj.lastModified) : "—"),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) =>
        r.kind === "object" ? (
          <button
            className="rounded p-1.5 text-ink-500 hover:bg-canvas hover:text-link"
            onClick={(e) => {
              e.stopPropagation();
              download(r.key);
            }}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  // Build folder breadcrumb segments from the current prefix.
  const segments = prefix.split("/").filter(Boolean);

  return (
    <div>
      <PageHeader
        title={bucket}
        crumbs={[
          { label: "Console Home", to: "/" },
          { label: "S3", to: "/s3" },
          { label: bucket },
        ]}
        actions={
          <>
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-default" onClick={() => setFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" /> Create folder
            </button>
            <button className="btn-primary" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                // Snapshot the files before clearing the input — the FileList is
                // live, so resetting e.target.value empties it before the async
                // upload can read it.
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length) upload.mutate(files);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      {/* Folder breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button className="link" onClick={() => setPrefix("")}>
          {bucket}
        </button>
        {segments.map((seg, i) => {
          const p = segments.slice(0, i + 1).join("/") + "/";
          return (
            <span key={p} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
              <button className="link" onClick={() => setPrefix(p)}>
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-mimir/30 bg-mimir/5 px-4 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            selectable
            selected={selected}
            onToggle={(key) =>
              setSelected((s) => {
                const next = new Set(s);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              })
            }
            onToggleAll={(checked) =>
              setSelected(checked ? new Set(selectableKeys) : new Set())
            }
            empty={
              <EmptyState
                icon={Upload}
                title="This location is empty"
                description="Upload files or create a folder to get started."
              />
            }
          />
        )}
      </div>

      <Modal
        open={folderOpen}
        title="Create folder"
        onClose={() => setFolderOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setFolderOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!folderName.trim() || createFolder.isPending}
              onClick={() => createFolder.mutate()}
            >
              Create
            </button>
          </>
        }
      >
        <label className="label">Folder name</label>
        <input
          autoFocus
          className="input"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="images"
        />
        <p className="mt-2 text-xs text-ink-500">
          Created under <span className="font-mono">{prefix || "/"}</span>
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete objects"
        message={`Permanently delete ${selected.size} object(s)? This cannot be undone.`}
        onConfirm={() => deleteSelected.mutateAsync()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
