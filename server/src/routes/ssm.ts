import { Router } from "express";
import {
  SSMClient,
  DescribeParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(SSMClient, { region: regionOf(req as never) });
}

export const ssmRouter = Router();

ssmRouter.get(
  "/parameters",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeParametersCommand({ MaxResults: 50 }));
    res.json({
      parameters: (out.Parameters ?? []).map((p) => ({
        name: p.Name,
        type: p.Type,
        version: p.Version,
        lastModifiedDate: p.LastModifiedDate,
        description: p.Description,
        tier: p.Tier,
      })),
    });
  }),
);

ssmRouter.get(
  "/parameters/value",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(
      new GetParameterCommand({ Name: String(req.query.name ?? ""), WithDecryption: true }),
    );
    res.json({
      name: out.Parameter?.Name,
      value: out.Parameter?.Value,
      type: out.Parameter?.Type,
      version: out.Parameter?.Version,
    });
  }),
);

ssmRouter.put(
  "/parameters",
  asyncHandler(async (req, res) => {
    const { name, value, type, description } = req.body as {
      name: string;
      value: string;
      type?: "String" | "StringList" | "SecureString";
      description?: string;
    };
    const out = await client(req).send(
      new PutParameterCommand({
        Name: name,
        Value: value,
        Type: type ?? "String",
        Description: description,
        Overwrite: true,
      }),
    );
    res.json({ version: out.Version });
  }),
);

ssmRouter.post(
  "/parameters/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(
      new DeleteParameterCommand({ Name: (req.body as { name: string }).name }),
    );
    res.status(204).end();
  }),
);
