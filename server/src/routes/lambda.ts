import { Router } from "express";
import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionCommand,
  DeleteFunctionCommand,
  InvokeCommand,
  ListAliasesCommand,
} from "@aws-sdk/client-lambda";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(LambdaClient, { region: regionOf(req as never) });
}

export const lambdaRouter = Router();

lambdaRouter.get(
  "/functions",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListFunctionsCommand({ MaxItems: 100 }));
    res.json({
      functions: (out.Functions ?? []).map((f) => ({
        name: f.FunctionName,
        runtime: f.Runtime,
        handler: f.Handler,
        memorySize: f.MemorySize,
        timeout: f.Timeout,
        codeSize: f.CodeSize,
        lastModified: f.LastModified,
        description: f.Description,
        arn: f.FunctionArn,
        packageType: f.PackageType,
      })),
    });
  }),
);

lambdaRouter.get(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new GetFunctionCommand({ FunctionName: req.params.name }));
    const c = out.Configuration;
    const aliases = await client(req)
      .send(new ListAliasesCommand({ FunctionName: req.params.name }))
      .catch(() => ({ Aliases: [] }));
    res.json({
      name: c?.FunctionName,
      runtime: c?.Runtime,
      handler: c?.Handler,
      memorySize: c?.MemorySize,
      timeout: c?.Timeout,
      codeSize: c?.CodeSize,
      lastModified: c?.LastModified,
      description: c?.Description,
      role: c?.Role,
      arn: c?.FunctionArn,
      state: c?.State,
      packageType: c?.PackageType,
      environment: c?.Environment?.Variables ?? {},
      aliases: (aliases.Aliases ?? []).map((a) => ({ name: a.Name, version: a.FunctionVersion })),
    });
  }),
);

lambdaRouter.delete(
  "/functions/:name",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteFunctionCommand({ FunctionName: req.params.name }));
    res.status(204).end();
  }),
);

lambdaRouter.post(
  "/functions/:name/invoke",
  asyncHandler(async (req, res) => {
    const { payload } = req.body as { payload?: unknown };
    const out = await client(req).send(
      new InvokeCommand({
        FunctionName: req.params.name,
        Payload: payload !== undefined ? Buffer.from(JSON.stringify(payload)) : undefined,
        LogType: "Tail",
      }),
    );
    const responsePayload = out.Payload ? Buffer.from(out.Payload).toString("utf-8") : "";
    const logs = out.LogResult ? Buffer.from(out.LogResult, "base64").toString("utf-8") : "";
    res.json({
      statusCode: out.StatusCode,
      functionError: out.FunctionError ?? null,
      executedVersion: out.ExecutedVersion,
      payload: responsePayload,
      logs,
    });
  }),
);
