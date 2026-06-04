import { Router } from "express";
import {
  SecretsManagerClient,
  ListSecretsCommand,
  DescribeSecretCommand,
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(SecretsManagerClient, { region: regionOf(req as never) });
}

export const secretsRouter = Router();

secretsRouter.get(
  "/secrets",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListSecretsCommand({ MaxResults: 100 }));
    res.json({
      secrets: (out.SecretList ?? []).map((s) => ({
        name: s.Name,
        arn: s.ARN,
        description: s.Description,
        lastChangedDate: s.LastChangedDate,
        lastAccessedDate: s.LastAccessedDate,
      })),
    });
  }),
);

secretsRouter.get(
  "/secrets/describe",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(
      new DescribeSecretCommand({ SecretId: String(req.query.id ?? "") }),
    );
    res.json({
      name: out.Name,
      arn: out.ARN,
      description: out.Description,
      createdDate: out.CreatedDate,
      lastChangedDate: out.LastChangedDate,
      rotationEnabled: out.RotationEnabled ?? false,
      tags: out.Tags ?? [],
    });
  }),
);

secretsRouter.get(
  "/secrets/value",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(
      new GetSecretValueCommand({ SecretId: String(req.query.id ?? "") }),
    );
    res.json({ secretString: out.SecretString ?? null, versionId: out.VersionId });
  }),
);

secretsRouter.post(
  "/secrets",
  asyncHandler(async (req, res) => {
    const { name, secretString, description } = req.body as {
      name: string;
      secretString: string;
      description?: string;
    };
    const out = await client(req).send(
      new CreateSecretCommand({ Name: name, SecretString: secretString, Description: description }),
    );
    res.status(201).json({ arn: out.ARN, name: out.Name });
  }),
);

secretsRouter.put(
  "/secrets/value",
  asyncHandler(async (req, res) => {
    const { id, secretString } = req.body as { id: string; secretString: string };
    const out = await client(req).send(
      new PutSecretValueCommand({ SecretId: id, SecretString: secretString }),
    );
    res.json({ versionId: out.VersionId });
  }),
);

secretsRouter.post(
  "/secrets/delete",
  asyncHandler(async (req, res) => {
    const { id, force } = req.body as { id: string; force?: boolean };
    await client(req).send(
      new DeleteSecretCommand({
        SecretId: id,
        ForceDeleteWithoutRecovery: force ?? true,
      }),
    );
    res.status(204).end();
  }),
);
