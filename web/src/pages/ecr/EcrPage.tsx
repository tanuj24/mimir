import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Container, RefreshCw, Trash2 } from "lucide-react";
import { SeedDataButton } from "@/components/SeedDataButton";
import { ecrApi, type Repository } from "./ecrApi";
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

function ImagesModal({ repo, onClose }: { repo: Repository | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["ecr", "images", repo?.name],
    queryFn: () => ecrApi.images(repo!.name),
    enabled: !!repo,
  });
  return (
    <Modal open={!!repo} title={`${repo?.name} · images`} onClose={onClose} wide footer={<button className="btn-default" onClick={onClose}>Close</button>}>
      <p className="mb-2 font-mono text-xs text-ink-500">{repo?.uri}</p>
      {q.isLoading ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={[
            { key: "tags", header: "Tags", render: (i) => (i.tags.length ? i.tags.join(", ") : <span className="text-ink-300">untagged</span>) },
            { key: "digest", header: "Digest", render: (i) => <span className="font-mono text-xs">{i.digest?.slice(0, 19)}…</span> },
            { key: "size", header: "Size", render: (i) => formatBytes(i.sizeBytes) },
            { key: "pushed", header: "Pushed", render: (i) => formatDate(i.pushedAt) },
          ]}
          rows={q.data?.images ?? []}
          rowKey={(i) => i.digest ?? Math.random().toString()}
          empty={<EmptyState icon={Container} title="No images pushed" />}
        />
      )}
    </Modal>
  );
}

export function EcrPage() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<Repository | null>(null);
  const [toDelete, setToDelete] = useState<Repository | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ecr", "repos"],
    queryFn: ecrApi.list,
  });

  const create = useMutation({
    mutationFn: () => ecrApi.create(name.trim()),
    onSuccess: () => {
      notify("success", "Repository created");
      qc.invalidateQueries({ queryKey: ["ecr", "repos"] });
      setCreateOpen(false);
      setName("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const del = useMutation({
    mutationFn: (n: string) => ecrApi.remove(n),
    onSuccess: () => {
      notify("success", "Repository deleted");
      qc.invalidateQueries({ queryKey: ["ecr", "repos"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const columns: Column<Repository>[] = [
    {
      key: "name",
      header: "Repository",
      render: (r) => (
        <button className="link font-medium" onClick={() => setView(r)}>
          {r.name}
        </button>
      ),
    },
    { key: "uri", header: "URI", render: (r) => <span className="font-mono text-xs text-ink-500">{r.uri}</span> },
    { key: "mutability", header: "Tag mutability", render: (r) => r.tagMutability ?? "—" },
    { key: "created", header: "Created", render: (r) => formatDate(r.createdAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <button className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger" onClick={() => setToDelete(r)}>
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Amazon ECR"
        subtitle="Private repositories"
        crumbs={[{ label: "Console Home", to: "/" }, { label: "ECR" }]}
        actions={
          <>
            <SeedDataButton service="ecr" onSuccess={refetch} />
            <button className="btn-default" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create repository</button>
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
            rows={data?.repositories ?? []}
            rowKey={(r) => r.name}
            empty={<EmptyState icon={Container} title="No repositories" description="Create a repository to store container images." action={<SeedDataButton service="ecr" onSuccess={refetch} variant="primary" />} />}
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create repository"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-default" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</button>
          </>
        }
      >
        <label className="label">Repository name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" autoFocus />
      </Modal>

      <ImagesModal repo={view} onClose={() => setView(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete repository"
        message={<>Delete repository <strong>{toDelete?.name}</strong> and all its images?</>}
        onConfirm={() => toDelete && del.mutateAsync(toDelete.name)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
