import { Router } from "express";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(CloudWatchLogsClient, { region: regionOf(req as never) });
}

export const logsRouter = Router();

logsRouter.get(
  "/groups",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeLogGroupsCommand({ limit: 50 }));
    res.json({
      groups: (out.logGroups ?? []).map((g) => ({
        name: g.logGroupName,
        arn: g.arn,
        creationTime: g.creationTime,
        storedBytes: g.storedBytes,
        retentionInDays: g.retentionInDays,
      })),
    });
  }),
);

logsRouter.post(
  "/groups",
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name: string };
    await client(req).send(new CreateLogGroupCommand({ logGroupName: name }));
    res.status(201).json({ name });
  }),
);

logsRouter.post(
  "/groups/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(
      new DeleteLogGroupCommand({ logGroupName: (req.body as { name: string }).name }),
    );
    res.status(204).end();
  }),
);

logsRouter.get(
  "/groups/streams",
  asyncHandler(async (req, res) => {
    const group = String(req.query.group ?? "");
    const out = await client(req).send(
      new DescribeLogStreamsCommand({
        logGroupName: group,
        orderBy: "LastEventTime",
        descending: true,
        limit: 50,
      }),
    );
    res.json({
      streams: (out.logStreams ?? []).map((s) => ({
        name: s.logStreamName,
        lastEventTimestamp: s.lastEventTimestamp,
        firstEventTimestamp: s.firstEventTimestamp,
        storedBytes: s.storedBytes,
      })),
    });
  }),
);

logsRouter.get(
  "/groups/events",
  asyncHandler(async (req, res) => {
    const group = String(req.query.group ?? "");
    const stream = String(req.query.stream ?? "");
    const out = await client(req).send(
      new GetLogEventsCommand({
        logGroupName: group,
        logStreamName: stream,
        limit: 200,
        startFromHead: false,
      }),
    );
    res.json({
      events: (out.events ?? []).map((e) => ({ timestamp: e.timestamp, message: e.message })),
    });
  }),
);
