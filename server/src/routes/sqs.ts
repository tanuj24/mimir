import { Router } from "express";
import {
  SQSClient,
  ListQueuesCommand,
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(SQSClient, { region: regionOf(req as never) });
}

export const sqsRouter = Router();

sqsRouter.get(
  "/queues",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListQueuesCommand({ MaxResults: 1000 }));
    res.json({
      queues: (out.QueueUrls ?? []).map((url) => ({ url, name: url.split("/").pop() })),
    });
  }),
);

sqsRouter.post(
  "/queues",
  asyncHandler(async (req, res) => {
    const { name, fifo } = req.body as { name: string; fifo?: boolean };
    const out = await client(req).send(
      new CreateQueueCommand({
        QueueName: fifo && !name.endsWith(".fifo") ? `${name}.fifo` : name,
        Attributes: fifo ? { FifoQueue: "true" } : undefined,
      }),
    );
    res.status(201).json({ url: out.QueueUrl });
  }),
);

sqsRouter.post(
  "/queues/attributes",
  asyncHandler(async (req, res) => {
    const { url } = req.body as { url: string };
    const out = await client(req).send(
      new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["All"] }),
    );
    res.json({ attributes: out.Attributes ?? {} });
  }),
);

sqsRouter.post(
  "/queues/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteQueueCommand({ QueueUrl: (req.body as { url: string }).url }));
    res.status(204).end();
  }),
);

sqsRouter.post(
  "/queues/purge",
  asyncHandler(async (req, res) => {
    await client(req).send(new PurgeQueueCommand({ QueueUrl: (req.body as { url: string }).url }));
    res.json({ ok: true });
  }),
);

sqsRouter.post(
  "/queues/send",
  asyncHandler(async (req, res) => {
    const { url, body, groupId } = req.body as { url: string; body: string; groupId?: string };
    const out = await client(req).send(
      new SendMessageCommand({
        QueueUrl: url,
        MessageBody: body,
        MessageGroupId: groupId || undefined,
        MessageDeduplicationId: groupId ? `${Date.now()}` : undefined,
      }),
    );
    res.json({ messageId: out.MessageId });
  }),
);

sqsRouter.post(
  "/queues/receive",
  asyncHandler(async (req, res) => {
    const { url } = req.body as { url: string };
    const out = await client(req).send(
      new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        MessageAttributeNames: ["All"],
      }),
    );
    res.json({
      messages: (out.Messages ?? []).map((m) => ({
        messageId: m.MessageId,
        body: m.Body,
        receiptHandle: m.ReceiptHandle,
      })),
    });
  }),
);
