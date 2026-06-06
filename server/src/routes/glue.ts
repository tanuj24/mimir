import { Router } from "express";
import {
  GlueClient,
  GetDatabasesCommand,
  CreateDatabaseCommand,
  DeleteDatabaseCommand,
  GetTablesCommand,
} from "@aws-sdk/client-glue";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";
import * as engine from "../glue/engine.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(GlueClient, { region: regionOf(req as never) });
}

export const glueRouter = Router();

// ============================================================
// Data Catalog — backed by the Mimir backend's REAL Glue API
// ============================================================
glueRouter.get(
  "/databases",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new GetDatabasesCommand({ MaxResults: 100 }));
    res.json({
      databases: (out.DatabaseList ?? []).map((d) => ({
        name: d.Name,
        description: d.Description,
        locationUri: d.LocationUri,
        createTime: d.CreateTime,
      })),
    });
  }),
);

glueRouter.post(
  "/databases",
  asyncHandler(async (req, res) => {
    const { name, description } = req.body as { name: string; description?: string };
    await client(req).send(
      new CreateDatabaseCommand({ DatabaseInput: { Name: name, Description: description } }),
    );
    res.status(201).json({ name });
  }),
);

glueRouter.post(
  "/databases/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteDatabaseCommand({ Name: (req.body as { name: string }).name }));
    res.status(204).end();
  }),
);

glueRouter.get(
  "/databases/tables",
  asyncHandler(async (req, res) => {
    const db = String(req.query.database ?? "");
    const out = await client(req).send(new GetTablesCommand({ DatabaseName: db, MaxResults: 100 }));
    res.json({
      tables: (out.TableList ?? []).map((t) => ({
        name: t.Name,
        owner: t.Owner,
        tableType: t.TableType,
        columns: (t.StorageDescriptor?.Columns ?? []).map((c) => ({
          name: c.Name,
          type: c.Type,
          comment: c.Comment,
        })),
        location: t.StorageDescriptor?.Location,
        createTime: t.CreateTime,
      })),
    });
  }),
);

// ============================================================
// ETL jobs — executed LOCALLY in Docker (the Mimir backend has no Glue job API)
// ============================================================
glueRouter.get(
  "/jobs",
  asyncHandler(async (_req, res) => {
    res.json({ jobs: engine.listJobs(), engine: engine.engineInfo });
  }),
);

glueRouter.get(
  "/jobs/:name",
  asyncHandler(async (req, res) => {
    const job = engine.getJob(req.params.name);
    if (!job) return res.status(404).json({ error: { code: "NotFound", message: "Job not found" } });
    res.json({ job, runs: engine.listRuns(req.params.name) });
  }),
);

glueRouter.put(
  "/jobs",
  asyncHandler(async (req, res) => {
    const { name, type, script, description, role, config } = req.body as {
      name: string;
      type: engine.JobType;
      script: string;
      description?: string;
      role?: string;
      config?: Partial<engine.JobConfig>;
    };
    if (!name || !type || script === undefined)
      return res.status(400).json({ error: { code: "BadRequest", message: "name, type, script required" } });
    res.json({ job: engine.upsertJob({ name, type, script, description, role, config }) });
  }),
);

glueRouter.post(
  "/jobs/delete",
  asyncHandler(async (req, res) => {
    engine.deleteJob((req.body as { name: string }).name);
    res.status(204).end();
  }),
);

glueRouter.post(
  "/jobs/:name/run",
  asyncHandler(async (req, res) => {
    const run = engine.startJobRun(req.params.name);
    res.status(202).json({ run });
  }),
);

glueRouter.get(
  "/jobs/:name/runs",
  asyncHandler(async (req, res) => {
    res.json({ runs: engine.listRuns(req.params.name) });
  }),
);

glueRouter.get(
  "/runs/:id",
  asyncHandler(async (req, res) => {
    const run = engine.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: { code: "NotFound", message: "Run not found" } });
    res.json({ run });
  }),
);

// ============================================================
// Notebooks / interactive sessions — LOCAL stateful kernels
// ============================================================
glueRouter.get(
  "/sessions",
  asyncHandler(async (_req, res) => {
    res.json({ sessions: engine.listSessions() });
  }),
);

glueRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const { kind } = req.body as { kind?: "python" | "spark" };
    res.status(201).json({ session: engine.createSession(kind ?? "python") });
  }),
);

glueRouter.get(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const session = engine.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: { code: "NotFound", message: "Session not found" } });
    res.json({ session, statements: engine.listStatements(req.params.id) });
  }),
);

glueRouter.post(
  "/sessions/:id/statements",
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };
    const statement = await engine.runStatement(req.params.id, code ?? "");
    res.json({ statement });
  }),
);

glueRouter.post(
  "/sessions/:id/delete",
  asyncHandler(async (req, res) => {
    engine.deleteSession(req.params.id);
    res.status(204).end();
  }),
);
