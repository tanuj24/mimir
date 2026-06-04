import { Router } from "express";
import {
  SNSClient,
  ListTopicsCommand,
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(SNSClient, { region: regionOf(req as never) });
}

export const snsRouter = Router();

snsRouter.get(
  "/topics",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListTopicsCommand({}));
    res.json({
      topics: (out.Topics ?? []).map((t) => ({
        arn: t.TopicArn,
        name: t.TopicArn?.split(":").pop(),
      })),
    });
  }),
);

snsRouter.post(
  "/topics",
  asyncHandler(async (req, res) => {
    const { name, fifo } = req.body as { name: string; fifo?: boolean };
    const out = await client(req).send(
      new CreateTopicCommand({
        Name: fifo && !name.endsWith(".fifo") ? `${name}.fifo` : name,
        Attributes: fifo ? { FifoTopic: "true" } : undefined,
      }),
    );
    res.status(201).json({ arn: out.TopicArn });
  }),
);

snsRouter.post(
  "/topics/attributes",
  asyncHandler(async (req, res) => {
    const { arn } = req.body as { arn: string };
    const [attrs, subs] = await Promise.all([
      client(req).send(new GetTopicAttributesCommand({ TopicArn: arn })),
      client(req).send(new ListSubscriptionsByTopicCommand({ TopicArn: arn })),
    ]);
    res.json({
      attributes: attrs.Attributes ?? {},
      subscriptions: (subs.Subscriptions ?? []).map((s) => ({
        arn: s.SubscriptionArn,
        protocol: s.Protocol,
        endpoint: s.Endpoint,
      })),
    });
  }),
);

snsRouter.post(
  "/topics/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteTopicCommand({ TopicArn: (req.body as { arn: string }).arn }));
    res.status(204).end();
  }),
);

snsRouter.post(
  "/topics/subscribe",
  asyncHandler(async (req, res) => {
    const { arn, protocol, endpoint } = req.body as {
      arn: string;
      protocol: string;
      endpoint: string;
    };
    const out = await client(req).send(
      new SubscribeCommand({ TopicArn: arn, Protocol: protocol, Endpoint: endpoint, ReturnSubscriptionArn: true }),
    );
    res.status(201).json({ subscriptionArn: out.SubscriptionArn });
  }),
);

snsRouter.post(
  "/topics/unsubscribe",
  asyncHandler(async (req, res) => {
    await client(req).send(
      new UnsubscribeCommand({ SubscriptionArn: (req.body as { subscriptionArn: string }).subscriptionArn }),
    );
    res.status(204).end();
  }),
);

snsRouter.post(
  "/topics/publish",
  asyncHandler(async (req, res) => {
    const { arn, message, subject, groupId } = req.body as {
      arn: string;
      message: string;
      subject?: string;
      groupId?: string;
    };
    const out = await client(req).send(
      new PublishCommand({
        TopicArn: arn,
        Message: message,
        Subject: subject || undefined,
        MessageGroupId: groupId || undefined,
        MessageDeduplicationId: groupId ? `${Date.now()}` : undefined,
      }),
    );
    res.json({ messageId: out.MessageId });
  }),
);
