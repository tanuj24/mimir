import { Router } from "express";
import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
  DeleteTableCommand,
  type AttributeDefinition,
  type KeySchemaElement,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function raw(req: { header(n: string): string | undefined }) {
  return makeClient(DynamoDBClient, { region: regionOf(req as never) });
}
function doc(req: { header(n: string): string | undefined }) {
  return DynamoDBDocumentClient.from(raw(req), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export const dynamodbRouter = Router();

dynamodbRouter.get(
  "/tables",
  asyncHandler(async (req, res) => {
    const out = await raw(req).send(new ListTablesCommand({}));
    res.json({ tables: out.TableNames ?? [] });
  }),
);

dynamodbRouter.get(
  "/tables/:name",
  asyncHandler(async (req, res) => {
    const out = await raw(req).send(new DescribeTableCommand({ TableName: req.params.name }));
    const t = out.Table;
    res.json({
      name: t?.TableName,
      status: t?.TableStatus,
      itemCount: t?.ItemCount,
      sizeBytes: t?.TableSizeBytes,
      creationDate: t?.CreationDateTime,
      keySchema: t?.KeySchema ?? [],
      attributeDefinitions: t?.AttributeDefinitions ?? [],
      billingMode: t?.BillingModeSummary?.BillingMode ?? "PROVISIONED",
      gsis: (t?.GlobalSecondaryIndexes ?? []).map((g) => ({
        name: g.IndexName,
        keySchema: g.KeySchema,
        status: g.IndexStatus,
      })),
      arn: t?.TableArn,
    });
  }),
);

dynamodbRouter.post(
  "/tables",
  asyncHandler(async (req, res) => {
    const { name, partitionKey, partitionKeyType, sortKey, sortKeyType } = req.body as {
      name: string;
      partitionKey: string;
      partitionKeyType: "S" | "N" | "B";
      sortKey?: string;
      sortKeyType?: "S" | "N" | "B";
    };
    if (!name || !partitionKey)
      return res.status(400).json({ error: { code: "BadRequest", message: "name and partitionKey required" } });

    const attrs: AttributeDefinition[] = [
      { AttributeName: partitionKey, AttributeType: partitionKeyType ?? "S" },
    ];
    const keys: KeySchemaElement[] = [{ AttributeName: partitionKey, KeyType: "HASH" }];
    if (sortKey) {
      attrs.push({ AttributeName: sortKey, AttributeType: sortKeyType ?? "S" });
      keys.push({ AttributeName: sortKey, KeyType: "RANGE" });
    }
    await raw(req).send(
      new CreateTableCommand({
        TableName: name,
        AttributeDefinitions: attrs,
        KeySchema: keys,
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    res.status(201).json({ name });
  }),
);

dynamodbRouter.delete(
  "/tables/:name",
  asyncHandler(async (req, res) => {
    await raw(req).send(new DeleteTableCommand({ TableName: req.params.name }));
    res.status(204).end();
  }),
);

// Scan items (with optional pagination)
dynamodbRouter.get(
  "/tables/:name/items",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const startKey = req.query.startKey ? JSON.parse(String(req.query.startKey)) : undefined;
    const out = await doc(req).send(
      new ScanCommand({ TableName: req.params.name, Limit: limit, ExclusiveStartKey: startKey }),
    );
    res.json({
      items: out.Items ?? [],
      count: out.Count ?? 0,
      scannedCount: out.ScannedCount ?? 0,
      lastEvaluatedKey: out.LastEvaluatedKey ?? null,
    });
  }),
);

// Query by partition key (and optional sort condition handled client side via filter)
dynamodbRouter.post(
  "/tables/:name/query",
  asyncHandler(async (req, res) => {
    const { partitionKey, partitionValue } = req.body as {
      partitionKey: string;
      partitionValue: string | number;
    };
    const out = await doc(req).send(
      new QueryCommand({
        TableName: req.params.name,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": partitionKey },
        ExpressionAttributeValues: { ":pk": partitionValue },
      }),
    );
    res.json({ items: out.Items ?? [], count: out.Count ?? 0 });
  }),
);

// Put (create/update) an item from JSON
dynamodbRouter.put(
  "/tables/:name/items",
  asyncHandler(async (req, res) => {
    const { item } = req.body as { item: Record<string, unknown> };
    if (!item || typeof item !== "object")
      return res.status(400).json({ error: { code: "BadRequest", message: "item object required" } });
    await doc(req).send(new PutCommand({ TableName: req.params.name, Item: item }));
    res.status(201).json({ ok: true });
  }),
);

// Delete an item by key
dynamodbRouter.post(
  "/tables/:name/delete-item",
  asyncHandler(async (req, res) => {
    const { key } = req.body as { key: Record<string, unknown> };
    await doc(req).send(new DeleteCommand({ TableName: req.params.name, Key: key }));
    res.status(204).end();
  }),
);
