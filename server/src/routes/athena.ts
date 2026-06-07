import { Router } from "express";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  ListQueryExecutionsCommand,
  StopQueryExecutionCommand,
  QueryExecutionState,
} from "@aws-sdk/client-athena";
import { GlueClient, GetDatabasesCommand, GetTablesCommand } from "@aws-sdk/client-glue";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function athena(req: { header(n: string): string | undefined }) {
  return makeClient(AthenaClient, { region: regionOf(req as never) });
}
function glue(req: { header(n: string): string | undefined }) {
  return makeClient(GlueClient, { region: regionOf(req as never) });
}

export const athenaRouter = Router();

// ---- Databases (from Glue catalog) ----

athenaRouter.get(
  "/databases",
  asyncHandler(async (req, res) => {
    const out = await glue(req).send(new GetDatabasesCommand({ MaxResults: 100 }));
    res.json({
      databases: (out.DatabaseList ?? []).map((d) => ({
        name: d.Name,
        description: d.Description,
      })),
    });
  }),
);

athenaRouter.get(
  "/databases/:db/tables",
  asyncHandler(async (req, res) => {
    const out = await glue(req).send(
      new GetTablesCommand({ DatabaseName: req.params.db, MaxResults: 200 }),
    );
    res.json({
      tables: (out.TableList ?? []).map((t) => ({
        name: t.Name,
        tableType: t.TableType,
        location: t.StorageDescriptor?.Location,
        columns: (t.StorageDescriptor?.Columns ?? []).map((c) => ({
          name: c.Name,
          type: c.Type,
        })),
      })),
    });
  }),
);

// ---- Query execution ----

athenaRouter.post(
  "/queries",
  asyncHandler(async (req, res) => {
    const { sql, database } = req.body as { sql: string; database?: string };
    if (!sql?.trim())
      return res.status(400).json({ error: { code: "BadRequest", message: "sql is required" } });

    const out = await athena(req).send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: database ? { Database: database } : undefined,
        ResultConfiguration: { OutputLocation: "s3://mimir-athena-results/" },
      }),
    );
    res.status(202).json({ queryExecutionId: out.QueryExecutionId });
  }),
);

athenaRouter.get(
  "/queries/:id",
  asyncHandler(async (req, res) => {
    const cl = athena(req);
    const exec = await cl.send(
      new GetQueryExecutionCommand({ QueryExecutionId: req.params.id }),
    );
    const qe = exec.QueryExecution;
    const state = qe?.Status?.State;

    let results: { columns: string[]; rows: string[][] } | null = null;
    if (state === QueryExecutionState.SUCCEEDED) {
      const r = await cl.send(
        new GetQueryResultsCommand({ QueryExecutionId: req.params.id, MaxResults: 1000 }),
      );
      const rows = r.ResultSet?.Rows ?? [];
      const columns = rows[0]?.Data?.map((d) => d.VarCharValue ?? "") ?? [];
      const data = rows.slice(1).map(
        (row) => row.Data?.map((d) => d.VarCharValue ?? "") ?? [],
      );
      results = { columns, rows: data };
    }

    res.json({
      id: req.params.id,
      state,
      sql: qe?.Query,
      database: qe?.QueryExecutionContext?.Database,
      submittedAt: qe?.Status?.SubmissionDateTime,
      completedAt: qe?.Status?.CompletionDateTime,
      error: qe?.Status?.AthenaError?.ErrorMessage ?? qe?.Status?.StateChangeReason,
      scannedBytes: qe?.Statistics?.DataScannedInBytes,
      executionMs: qe?.Statistics?.TotalExecutionTimeInMillis,
      results,
    });
  }),
);

athenaRouter.get(
  "/queries",
  asyncHandler(async (req, res) => {
    const cl = athena(req);
    const list = await cl.send(new ListQueryExecutionsCommand({ MaxResults: 50 }));
    const ids = list.QueryExecutionIds ?? [];

    const settled = await Promise.allSettled(
      ids.slice(0, 25).map((id) =>
        cl.send(new GetQueryExecutionCommand({ QueryExecutionId: id })),
      ),
    );

    const executions = settled
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ QueryExecution?: { QueryExecutionId?: string; Query?: string; Status?: { State?: string; SubmissionDateTime?: Date; CompletionDateTime?: Date; AthenaError?: { ErrorMessage?: string }; StateChangeReason?: string }; QueryExecutionContext?: { Database?: string }; Statistics?: { TotalExecutionTimeInMillis?: number } } }>).value.QueryExecution)
      .filter(Boolean)
      .map((qe) => ({
        id: qe!.QueryExecutionId,
        sql: qe!.Query,
        state: qe!.Status?.State,
        database: qe!.QueryExecutionContext?.Database,
        submittedAt: qe!.Status?.SubmissionDateTime,
        completedAt: qe!.Status?.CompletionDateTime,
        executionMs: qe!.Statistics?.TotalExecutionTimeInMillis,
        error: qe!.Status?.AthenaError?.ErrorMessage ?? qe!.Status?.StateChangeReason,
      }));

    res.json({ executions });
  }),
);

athenaRouter.delete(
  "/queries/:id",
  asyncHandler(async (req, res) => {
    await athena(req).send(
      new StopQueryExecutionCommand({ QueryExecutionId: req.params.id }),
    );
    res.status(204).end();
  }),
);
