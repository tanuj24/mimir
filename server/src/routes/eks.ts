import { Router } from "express";
import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
  CreateClusterCommand,
  DeleteClusterCommand,
  ListNodegroupsCommand,
} from "@aws-sdk/client-eks";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(EKSClient, { region: regionOf(req as never) });
}

export const eksRouter = Router();

eksRouter.get(
  "/clusters",
  asyncHandler(async (req, res) => {
    const c = client(req);
    const list = await c.send(new ListClustersCommand({}));
    const clusters = await Promise.all(
      (list.clusters ?? []).map(async (name) => {
        const d = await c.send(new DescribeClusterCommand({ name })).catch(() => null);
        const cl = d?.cluster;
        return {
          name,
          status: cl?.status,
          version: cl?.version,
          endpoint: cl?.endpoint,
          arn: cl?.arn,
          createdAt: cl?.createdAt,
          platformVersion: cl?.platformVersion,
        };
      }),
    );
    res.json({ clusters });
  }),
);

eksRouter.get(
  "/clusters/:name",
  asyncHandler(async (req, res) => {
    const c = client(req);
    const d = await c.send(new DescribeClusterCommand({ name: req.params.name }));
    const ng = await c
      .send(new ListNodegroupsCommand({ clusterName: req.params.name }))
      .catch(() => ({ nodegroups: [] }));
    const cl = d.cluster;
    res.json({
      name: cl?.name,
      status: cl?.status,
      version: cl?.version,
      endpoint: cl?.endpoint,
      arn: cl?.arn,
      roleArn: cl?.roleArn,
      createdAt: cl?.createdAt,
      vpcConfig: cl?.resourcesVpcConfig ?? {},
      nodegroups: ng.nodegroups ?? [],
    });
  }),
);

eksRouter.post(
  "/clusters",
  asyncHandler(async (req, res) => {
    const { name, role, subnets } = req.body as { name: string; role?: string; subnets?: string[] };
    const out = await client(req).send(
      new CreateClusterCommand({
        name,
        roleArn: role ?? "arn:aws:iam::000000000000:role/eks-role",
        resourcesVpcConfig: { subnetIds: subnets ?? [] },
      }),
    );
    res.status(201).json({ name: out.cluster?.name, status: out.cluster?.status });
  }),
);

eksRouter.post(
  "/clusters/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteClusterCommand({ name: (req.body as { name: string }).name }));
    res.status(204).end();
  }),
);
