import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Plus, RefreshCw, Trash2 } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { s3Api, type Bucket } from "./s3Api";
import { formatDate } from "@/lib/format";
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

function CreateBucketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const { notify } = useToast();
  const m = useMutation({
    mutationFn: () => s3Api.createBucket(name.trim()),
    onSuccess: () => {
      notify("success", `Bucket "${name}" created`);
      qc.invalidateQueries({ queryKey: ["s3", "buckets"] });
      setName("");
      onClose();
    },
    onError: (e: Error) => notify("error", e.message),
  });

  return (
    <Modal
      open={open}
      title="Create bucket"
      onClose={onClose}
      footer={
        <>
          <button className="btn-default" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim() || m.isPending}
            onClick={() => m.mutate()}
          >
            Create bucket
          </button>
        </>
      }
    >
      <label className="label">Bucket name</label>
      <input
        autoFocus
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="my-bucket"
        onKeyDown={(e) => e.key === "Enter" && name.trim() && m.mutate()}
      />
      <p className="mt-2 text-xs text-ink-500">
        Bucket names must be globally unique within the Mimir backend and use lowercase letters, numbers and
        hyphens.
      </p>
    </Modal>
  );
}

export function BucketsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Bucket | null>(null);
  const qc = useQueryClient();
  const { notify } = useToast();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["s3", "buckets"],
    queryFn: s3Api.listBuckets,
  });

  const del = useMutation({
    mutationFn: (name: string) => s3Api.deleteBucket(name),
    onSuccess: (_d, name) => {
      notify("success", `Bucket "${name}" deleted`);
      qc.invalidateQueries({ queryKey: ["s3", "buckets"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Bucket>[] = [
    {
      key: "name",
      header: "Name",
      render: (b) => (
        <Link to={`/s3/${encodeURIComponent(b.name)}`} className="link font-medium">
          {b.name}
        </Link>
      ),
    },
    { key: "created", header: "Creation date", render: (b) => formatDate(b.creationDate) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (b) => (
        <button
          className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          onClick={(e) => {
            e.preventDefault();
            setToDelete(b);
          }}
          title="Delete bucket"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon S3"
        subtitle="Buckets"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "S3" }]}
        actions={
          <>
            <SeedDataButton service="s3" onSuccess={refetch} />
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create bucket
            </button>
          </>
        }
      />

      <div className="card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.buckets ?? []}
            rowKey={(b) => b.name}
            empty={
              <EmptyState
                icon={HardDrive}
                title="No buckets yet"
                description="Create your first bucket to start storing objects."
                action={
                  <div className="flex gap-2">
                    <SeedDataButton service="s3" onSuccess={refetch} variant="primary" />
                    <button className="btn-default" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4" /> Create bucket
                    </button>
                  </div>
                }
              />
            }
          />
        )}
      </div>

      <CreateBucketModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete bucket"
        message={
          <>
            Permanently delete bucket <strong>{toDelete?.name}</strong>? The bucket must be empty.
          </>
        }
        onConfirm={() => toDelete && del.mutateAsync(toDelete.name)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
