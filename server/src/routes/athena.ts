import { Router } from "express";
import { GlueClient, GetDatabasesCommand, GetTablesCommand } from "@aws-sdk/client-glue";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler } from "../lib/http.js";
import { config } from "../config.js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MIMIR_STORAGE_PERSISTENT_PATH ?? join(__dirname, "..", "..");
const STATE_FILE = join(DATA_DIR, "athena-state.json");

// mimir-duck sidecar URL — same process space as the Mimir backend in the all-in-one image.
const DUCK_URL = process.env.MIMIR_SERVICES_DUCK_URL ?? "http://127.0.0.1:3000";

// ---- local query state ----

interface AthenaQuery {
  id: string;
  sql: string;
  database?: string;
  state: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  submittedAt: string;
  completedAt?: string;
  executionMs?: number;
  error?: string;
  results?: { columns: string[]; rows: string[][] };
}

const queries = new Map<string, AthenaQuery>();

function persist() {
  try {
    const list = [...queries.values()]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 100);
    writeFileSync(STATE_FILE, JSON.stringify({ queries: list }, null, 2));
  } catch { /* best effort */ }
}

(function load() {
  if (!existsSync(STATE_FILE)) return;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as { queries?: AthenaQuery[] };
    for (const q of data.queries ?? []) {
      if (q.state === "RUNNING") q.state = "FAILED"; // orphaned from last process
      queries.set(q.id, q);
    }
  } catch { /* ignore */ }
})();

// ---- mimir-duck helpers ----

const duckS3 = {
  s3_endpoint: config.backendEndpoint.replace(/^https?:\/\//, ""),
  s3_region: config.region,
  s3_access_key: config.accessKeyId,
  s3_secret_key: config.secretAccessKey,
  s3_url_style: "path",
};

async function duckQuery(
  sql: string,
  setupSql: string,
): Promise<{ columns: string[]; rows: string[][] }> {
  const resp = await fetch(`${DUCK_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, setup_sql: setupSql, ...duckS3 }),
  });
  const body = (await resp.json()) as { error?: string; rows?: Record<string, unknown>[] };
  if (!resp.ok) throw new Error(body.error ?? `mimir-duck returned HTTP ${resp.status}`);

  const rawRows = body.rows ?? [];
  if (rawRows.length === 0) return { columns: [], rows: [] };
  const columns = Object.keys(rawRows[0]);
  const rows = rawRows.map((r) => columns.map((c) => {
    const v = r[c];
    return v == null ? "" : String(v);
  }));
  return { columns, rows };
}

// ---- Glue catalog → DuckDB setup SQL ----
// Creates a DuckDB schema + view for every Glue table so queries like
// SELECT * FROM "mimir_sample_db"."orders" resolve correctly.
//
// DuckDB resolves S3 globs eagerly at CREATE VIEW time (to infer column types),
// so we check S3 first. Tables without S3 data get a schema-typed empty view
// so the reference resolves rather than producing "table not found".

function glueTypeToDuck(t: string): string {
  const s = t.toLowerCase();
  if (s === "int" || s === "integer") return "INTEGER";
  if (s === "bigint" || s === "long") return "BIGINT";
  if (s === "double" || s === "float") return "DOUBLE";
  if (s === "boolean") return "BOOLEAN";
  if (s === "timestamp") return "TIMESTAMP";
  if (s === "date") return "DATE";
  return "VARCHAR";
}

async function s3HasObjects(bucket: string, prefix: string): Promise<boolean> {
  try {
    const s3 = makeClient(S3Client, { forcePathStyle: true });
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix.replace(/^\//, ""), MaxKeys: 1 }),
    );
    return (res.KeyCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function buildSetupSql(): Promise<string> {
  const glueClient = makeClient(GlueClient, {});
  const stmts: string[] = [];
  try {
    const dbsOut = await glueClient.send(new GetDatabasesCommand({ MaxResults: 100 }));
    for (const db of dbsOut.DatabaseList ?? []) {
      const dbName = db.Name!;
      stmts.push(`CREATE SCHEMA IF NOT EXISTS ${JSON.stringify(dbName)}`);
      try {
        const tablesOut = await glueClient.send(
          new GetTablesCommand({ DatabaseName: dbName, MaxResults: 200 }),
        );
        for (const table of tablesOut.TableList ?? []) {
          const tName = table.Name!;
          const location = table.StorageDescriptor?.Location ?? "";
          const inputFormat = table.StorageDescriptor?.InputFormat ?? "";
          const cols = table.StorageDescriptor?.Columns ?? [];
          const qName = `${JSON.stringify(dbName)}.${JSON.stringify(tName)}`;

          // Parse s3://bucket/prefix
          const s3Match = location.match(/^s3:\/\/([^/]+)\/?(.*)$/);
          const hasFiles = s3Match
            ? await s3HasObjects(s3Match[1], s3Match[2])
            : false;

          if (hasFiles) {
            const s3Glob = location.replace(/\/*$/, "") + "/**";
            let readExpr: string;
            if (inputFormat.includes("HoodieParquet") || inputFormat.toLowerCase().includes("parquet")) {
              readExpr = `read_parquet('${s3Glob}', hive_partitioning=true, union_by_name=true)`;
            } else {
              readExpr = `read_csv_auto('${s3Glob}', header=true, ignore_errors=true)`;
            }
            stmts.push(`CREATE OR REPLACE VIEW ${qName} AS SELECT * FROM ${readExpr}`);
          } else {
            // No S3 data yet — create a typed empty view so references resolve.
            if (cols.length === 0) continue;
            const colDefs = cols
              .map((c) => `NULL::${glueTypeToDuck(c.Type ?? "string")} AS ${JSON.stringify(c.Name ?? "")}`)
              .join(", ");
            stmts.push(`CREATE OR REPLACE VIEW ${qName} AS SELECT ${colDefs} WHERE FALSE`);
          }
        }
      } catch (e) {
        console.warn(`[athena] tables(${dbName}):`, (e as Error).message);
      }
    }
  } catch (e) {
    console.warn("[athena] databases:", (e as Error).message);
  }
  return stmts.join(";\n");
}

// ---- async execution ----

async function executeQuery(q: AthenaQuery): Promise<void> {
  const t0 = Date.now();
  try {
    const setupSql = await buildSetupSql();
    q.results = await duckQuery(q.sql, setupSql);
    q.state = "SUCCEEDED";
  } catch (e) {
    q.state = "FAILED";
    q.error = (e as Error).message;
  } finally {
    q.completedAt = new Date().toISOString();
    q.executionMs = Date.now() - t0;
    persist();
  }
}

// ---- router ----

export const athenaRouter = Router();

// Databases — still served from Glue catalog
athenaRouter.get(
  "/databases",
  asyncHandler(async (_req, res) => {
    const out = await makeClient(GlueClient, {}).send(new GetDatabasesCommand({ MaxResults: 100 }));
    res.json({
      databases: (out.DatabaseList ?? []).map((d) => ({
        name: d.Name,
        description: d.Description,
      })),
    });
  }),
);

// Tables per database
athenaRouter.get(
  "/databases/:db/tables",
  asyncHandler(async (req, res) => {
    const out = await makeClient(GlueClient, {}).send(
      new GetTablesCommand({ DatabaseName: req.params.db, MaxResults: 200 }),
    );
    res.json({
      tables: (out.TableList ?? []).map((t) => ({
        name: t.Name,
        tableType: t.TableType,
        location: t.StorageDescriptor?.Location,
        columns: (t.StorageDescriptor?.Columns ?? []).map((c) => ({ name: c.Name, type: c.Type })),
      })),
    });
  }),
);

// Start a query
athenaRouter.post(
  "/queries",
  asyncHandler(async (req, res) => {
    const { sql, database } = req.body as { sql: string; database?: string };
    if (!sql?.trim())
      return res.status(400).json({ error: { code: "BadRequest", message: "sql is required" } });

    const q: AthenaQuery = {
      id: randomUUID(),
      sql: sql.trim(),
      database,
      state: "RUNNING",
      submittedAt: new Date().toISOString(),
    };
    queries.set(q.id, q);
    persist();
    void executeQuery(q); // fire-and-forget; client polls
    res.status(202).json({ queryExecutionId: q.id });
  }),
);

// Query status + results
athenaRouter.get(
  "/queries/:id",
  asyncHandler(async (req, res) => {
    const q = queries.get(req.params.id);
    if (!q) return res.status(404).json({ error: { code: "NotFound", message: "Query not found" } });
    res.json({
      id: q.id,
      state: q.state,
      sql: q.sql,
      database: q.database,
      submittedAt: q.submittedAt,
      completedAt: q.completedAt,
      executionMs: q.executionMs,
      error: q.error,
      results: q.results,
    });
  }),
);

// Recent query history
athenaRouter.get(
  "/queries",
  asyncHandler(async (_req, res) => {
    const list = [...queries.values()]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 50)
      .map(({ results: _r, ...rest }) => rest); // strip results from list view
    res.json({ executions: list });
  }),
);

// Cancel
athenaRouter.delete(
  "/queries/:id",
  asyncHandler(async (req, res) => {
    const q = queries.get(req.params.id);
    if (q?.state === "RUNNING") {
      q.state = "CANCELLED";
      q.completedAt = new Date().toISOString();
      persist();
    }
    res.status(204).end();
  }),
);
