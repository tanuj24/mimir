import { Router } from "express";
import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  CreateClusterCommand,
  DeleteClusterCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(ECSClient, { region: regionOf(req as never) });
}

export const ecsRouter = Router();

ecsRouter.get(
  "/clusters",
  asyncHandler(async (req, res) => {
    const c = client(req);
    const list = await c.send(new ListClustersCommand({}));
    const arns = list.clusterArns ?? [];
    const described = arns.length
      ? await c.send(new DescribeClustersCommand({ clusters: arns }))
      : { clusters: [] };
    res.json({
      clusters: (described.clusters ?? []).map((cl) => ({
        name: cl.clusterName,
        arn: cl.clusterArn,
        status: cl.status,
        runningTasks: cl.runningTasksCount,
        pendingTasks: cl.pendingTasksCount,
        activeServices: cl.activeServicesCount,
        registeredContainerInstances: cl.registeredContainerInstancesCount,
      })),
    });
  }),
);

ecsRouter.post(
  "/clusters",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name: string };
    const out = await client(req).send(new CreateClusterCommand({ clusterName: name }));
    res.status(201).json({ arn: out.cluster?.clusterArn, name: out.cluster?.clusterName });
  }),
);

ecsRouter.post(
  "/clusters/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteClusterCommand({ cluster: (req.body as { name: string }).name }));
    res.status(204).end();
  }),
);

ecsRouter.get(
  "/clusters/services",
  asyncHandler(async (req, res) => {
    const cluster = String(req.query.cluster ?? "");
    const c = client(req);
    const list = await c.send(new ListServicesCommand({ cluster }));
    const arns = list.serviceArns ?? [];
    const described = arns.length
      ? await c.send(new DescribeServicesCommand({ cluster, services: arns }))
      : { services: [] };
    res.json({
      services: (described.services ?? []).map((s) => ({
        name: s.serviceName,
        status: s.status,
        desired: s.desiredCount,
        running: s.runningCount,
        pending: s.pendingCount,
        launchType: s.launchType,
        taskDefinition: s.taskDefinition?.split("/").pop(),
      })),
    });
  }),
);

ecsRouter.get(
  "/clusters/tasks",
  asyncHandler(async (req, res) => {
    const cluster = String(req.query.cluster ?? "");
    const out = await client(req).send(new ListTasksCommand({ cluster }));
    res.json({ taskArns: out.taskArns ?? [] });
  }),
);
