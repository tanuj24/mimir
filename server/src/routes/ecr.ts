import { Router } from "express";
import {
  ECRClient,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
  DeleteRepositoryCommand,
  DescribeImagesCommand,
} from "@aws-sdk/client-ecr";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(ECRClient, { region: regionOf(req as never) });
}

export const ecrRouter = Router();

ecrRouter.get(
  "/repositories",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeRepositoriesCommand({}));
    res.json({
      repositories: (out.repositories ?? []).map((r) => ({
        name: r.repositoryName,
        uri: r.repositoryUri,
        arn: r.repositoryArn,
        createdAt: r.createdAt,
        tagMutability: r.imageTagMutability,
        scanOnPush: r.imageScanningConfiguration?.scanOnPush,
      })),
    });
  }),
);

ecrRouter.post(
  "/repositories",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name: string };
    const out = await client(req).send(new CreateRepositoryCommand({ repositoryName: name }));
    res.status(201).json({ name: out.repository?.repositoryName, uri: out.repository?.repositoryUri });
  }),
);

ecrRouter.post(
  "/repositories/delete",
  asyncHandler(async (req, res) => {
    const { name, force } = req.body as { name: string; force?: boolean };
    await client(req).send(new DeleteRepositoryCommand({ repositoryName: name, force: force ?? true }));
    res.status(204).end();
  }),
);

ecrRouter.get(
  "/repositories/images",
  asyncHandler(async (req, res) => {
    const repo = String(req.query.repo ?? "");
    const out = await client(req).send(new DescribeImagesCommand({ repositoryName: repo }));
    res.json({
      images: (out.imageDetails ?? []).map((i) => ({
        digest: i.imageDigest,
        tags: i.imageTags ?? [],
        sizeBytes: i.imageSizeInBytes,
        pushedAt: i.imagePushedAt,
      })),
    });
  }),
);
