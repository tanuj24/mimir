import { api } from "@/lib/api";

export interface Bucket {
  name: string;
  creationDate?: string;
}

export interface S3Object {
  key: string;
  size?: number;
  lastModified?: string;
  storageClass?: string;
  etag?: string;
}

export interface ListObjectsResult {
  prefix: string;
  commonPrefixes: string[];
  objects: S3Object[];
  isTruncated: boolean;
  nextContinuationToken: string | null;
}

export const s3Api = {
  listBuckets: (): Promise<{ buckets: Bucket[]; owner: unknown }> => api.get("/s3/buckets"),

  createBucket: (name: string) => api.post("/s3/buckets", { name }),

  deleteBucket: (name: string) => api.del(`/s3/buckets/${encodeURIComponent(name)}`),

  listObjects: (bucket: string, prefix = "", token?: string): Promise<ListObjectsResult> => {
    const params = new URLSearchParams({ prefix });
    if (token) params.set("continuationToken", token);
    return api.get(`/s3/buckets/${encodeURIComponent(bucket)}/objects?${params}`);
  },

  objectMetadata: (bucket: string, key: string) =>
    api.get(
      `/s3/buckets/${encodeURIComponent(bucket)}/object/metadata?key=${encodeURIComponent(key)}`,
    ),

  downloadUrl: (bucket: string, key: string): Promise<{ url: string }> =>
    api.get(
      `/s3/buckets/${encodeURIComponent(bucket)}/object/download-url?key=${encodeURIComponent(key)}`,
    ),

  createFolder: (bucket: string, key: string) =>
    api.post(`/s3/buckets/${encodeURIComponent(bucket)}/folders`, { key }),

  upload: (bucket: string, prefix: string, files: FileList) => {
    const form = new FormData();
    form.set("prefix", prefix);
    Array.from(files).forEach((f) => form.append("files", f));
    return api.upload(`/s3/buckets/${encodeURIComponent(bucket)}/objects`, form);
  },

  deleteObject: (bucket: string, key: string) =>
    api.del(`/s3/buckets/${encodeURIComponent(bucket)}/object?key=${encodeURIComponent(key)}`),

  deleteObjects: (bucket: string, keys: string[]) =>
    api.post(`/s3/buckets/${encodeURIComponent(bucket)}/delete-objects`, { keys }),
};
