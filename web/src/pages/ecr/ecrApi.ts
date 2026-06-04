import { api } from "@/lib/api";

export interface Repository {
  name: string;
  uri?: string;
  arn?: string;
  createdAt?: string;
  tagMutability?: string;
  scanOnPush?: boolean;
}
export interface RepoImage {
  digest?: string;
  tags: string[];
  sizeBytes?: number;
  pushedAt?: string;
}

export const ecrApi = {
  list: (): Promise<{ repositories: Repository[] }> => api.get("/ecr/repositories"),
  create: (name: string) => api.post("/ecr/repositories", { name }),
  remove: (name: string) => api.post("/ecr/repositories/delete", { name, force: true }),
  images: (repo: string): Promise<{ images: RepoImage[] }> =>
    api.get(`/ecr/repositories/images?repo=${encodeURIComponent(repo)}`),
};
