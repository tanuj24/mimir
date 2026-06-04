import { Router } from "express";
import {
  KMSClient,
  ListKeysCommand,
  DescribeKeyCommand,
  CreateKeyCommand,
  ListAliasesCommand,
  ScheduleKeyDeletionCommand,
  EnableKeyCommand,
  DisableKeyCommand,
} from "@aws-sdk/client-kms";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(KMSClient, { region: regionOf(req as never) });
}

export const kmsRouter = Router();

kmsRouter.get(
  "/keys",
  asyncHandler(async (req, res) => {
    const c = client(req);
    const [list, aliases] = await Promise.all([
      c.send(new ListKeysCommand({ Limit: 100 })),
      c.send(new ListAliasesCommand({ Limit: 100 })).catch(() => ({ Aliases: [] })),
    ]);
    const aliasByKey = new Map<string, string[]>();
    for (const a of aliases.Aliases ?? []) {
      if (a.TargetKeyId) {
        const arr = aliasByKey.get(a.TargetKeyId) ?? [];
        arr.push(a.AliasName!);
        aliasByKey.set(a.TargetKeyId, arr);
      }
    }
    const keys = await Promise.all(
      (list.Keys ?? []).map(async (k) => {
        const d = await c.send(new DescribeKeyCommand({ KeyId: k.KeyId })).catch(() => null);
        const m = d?.KeyMetadata;
        return {
          keyId: k.KeyId,
          arn: k.KeyArn,
          aliases: aliasByKey.get(k.KeyId!) ?? [],
          description: m?.Description,
          state: m?.KeyState,
          enabled: m?.Enabled,
          usage: m?.KeyUsage,
          spec: m?.KeySpec,
          creationDate: m?.CreationDate,
        };
      }),
    );
    res.json({ keys });
  }),
);

kmsRouter.post(
  "/keys",
  asyncHandler(async (req, res) => {
    const { description } = req.body as { description?: string };
    const out = await client(req).send(new CreateKeyCommand({ Description: description }));
    res.status(201).json({ keyId: out.KeyMetadata?.KeyId, arn: out.KeyMetadata?.Arn });
  }),
);

kmsRouter.post(
  "/keys/enable",
  asyncHandler(async (req, res) => {
    const { keyId, enabled } = req.body as { keyId: string; enabled: boolean };
    await client(req).send(
      enabled ? new EnableKeyCommand({ KeyId: keyId }) : new DisableKeyCommand({ KeyId: keyId }),
    );
    res.json({ ok: true });
  }),
);

kmsRouter.post(
  "/keys/schedule-deletion",
  asyncHandler(async (req, res) => {
    const { keyId, days } = req.body as { keyId: string; days?: number };
    await client(req).send(
      new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: days ?? 7 }),
    );
    res.json({ ok: true });
  }),
);
