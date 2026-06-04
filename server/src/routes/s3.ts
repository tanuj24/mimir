import { Router } from "express";
import multer from "multer";
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";
import { config } from "../config.js";

const upload = multer({ storage: multer.memoryStorage() });

function client(req: { header(name: string): string | undefined }) {
  return makeClient(S3Client, {
    region: regionOf(req as never),
    forcePathStyle: true,
  });
}

export const s3Router = Router();

// List all buckets
s3Router.get(
  "/buckets",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListBucketsCommand({}));
    res.json({
      owner: out.Owner ?? null,
      buckets: (out.Buckets ?? []).map((b) => ({
        name: b.Name,
        creationDate: b.CreationDate,
      })),
    });
  }),
);

// Create bucket
s3Router.post(
  "/buckets",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    if (!name) return res.status(400).json({ error: { code: "BadRequest", message: "name is required" } });
    await client(req).send(new CreateBucketCommand({ Bucket: name }));
    res.status(201).json({ name });
  }),
);

// Delete bucket
s3Router.delete(
  "/buckets/:bucket",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteBucketCommand({ Bucket: req.params.bucket }));
    res.status(204).end();
  }),
);

// Get bucket region/location
s3Router.get(
  "/buckets/:bucket/location",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(
      new GetBucketLocationCommand({ Bucket: req.params.bucket }),
    );
    res.json({ location: out.LocationConstraint ?? "us-east-1" });
  }),
);

// List objects (supports prefix + delimiter for folder-style browsing)
s3Router.get(
  "/buckets/:bucket/objects",
  asyncHandler(async (req, res) => {
    const { prefix, continuationToken, delimiter } = req.query as Record<string, string>;
    const out = await client(req).send(
      new ListObjectsV2Command({
        Bucket: req.params.bucket,
        Prefix: prefix || undefined,
        Delimiter: delimiter ?? "/",
        ContinuationToken: continuationToken || undefined,
        MaxKeys: 1000,
      }),
    );
    res.json({
      prefix: prefix ?? "",
      commonPrefixes: (out.CommonPrefixes ?? []).map((p) => p.Prefix),
      objects: (out.Contents ?? []).map((o) => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified,
        storageClass: o.StorageClass,
        etag: o.ETag,
      })),
      isTruncated: out.IsTruncated ?? false,
      nextContinuationToken: out.NextContinuationToken ?? null,
    });
  }),
);

// Object metadata
s3Router.get(
  "/buckets/:bucket/object/metadata",
  asyncHandler(async (req, res) => {
    const key = String(req.query.key ?? "");
    const out = await client(req).send(
      new HeadObjectCommand({ Bucket: req.params.bucket, Key: key }),
    );
    res.json({
      key,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
      lastModified: out.LastModified,
      etag: out.ETag,
      metadata: out.Metadata ?? {},
    });
  }),
);

// Upload object(s)
s3Router.post(
  "/buckets/:bucket/objects",
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const prefix = (req.body.prefix as string) || "";
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0)
      return res.status(400).json({ error: { code: "BadRequest", message: "no files" } });
    const c = client(req);
    const uploaded: string[] = [];
    for (const f of files) {
      const key = `${prefix}${f.originalname}`;
      await c.send(
        new PutObjectCommand({
          Bucket: req.params.bucket,
          Key: key,
          Body: f.buffer,
          ContentType: f.mimetype,
        }),
      );
      uploaded.push(key);
    }
    res.status(201).json({ uploaded });
  }),
);

// Create folder (zero-byte key ending in /)
s3Router.post(
  "/buckets/:bucket/folders",
  asyncHandler(async (req, res) => {
    const { key } = req.body as { key?: string };
    if (!key) return res.status(400).json({ error: { code: "BadRequest", message: "key required" } });
    const folderKey = key.endsWith("/") ? key : `${key}/`;
    await client(req).send(
      new PutObjectCommand({ Bucket: req.params.bucket, Key: folderKey, Body: "" }),
    );
    res.status(201).json({ key: folderKey });
  }),
);

// Presigned download URL — signed against the browser-facing endpoint so the
// returned URL is openable from the user's browser (matters in Docker Compose).
s3Router.get(
  "/buckets/:bucket/object/download-url",
  asyncHandler(async (req, res) => {
    const key = String(req.query.key ?? "");
    const presignClient = makeClient(S3Client, {
      region: regionOf(req),
      forcePathStyle: true,
      endpoint: config.publicEndpoint,
    });
    const url = await getSignedUrl(
      presignClient,
      new GetObjectCommand({ Bucket: req.params.bucket, Key: key }),
      { expiresIn: 300 },
    );
    res.json({ url });
  }),
);

// Delete a single object
s3Router.delete(
  "/buckets/:bucket/object",
  asyncHandler(async (req, res) => {
    const key = String(req.query.key ?? "");
    await client(req).send(
      new DeleteObjectCommand({ Bucket: req.params.bucket, Key: key }),
    );
    res.status(204).end();
  }),
);

// Delete multiple objects
s3Router.post(
  "/buckets/:bucket/delete-objects",
  asyncHandler(async (req, res) => {
    const { keys } = req.body as { keys?: string[] };
    if (!keys?.length)
      return res.status(400).json({ error: { code: "BadRequest", message: "keys required" } });
    const out = await client(req).send(
      new DeleteObjectsCommand({
        Bucket: req.params.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
    res.json({ deleted: (out.Deleted ?? []).map((d) => d.Key) });
  }),
);
