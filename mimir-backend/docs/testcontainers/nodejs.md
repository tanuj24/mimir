# Testcontainers — Node.js / TypeScript

The `@mimir/testcontainers` package integrates Mimir with [Testcontainers for Node.js](https://node.testcontainers.org/). It works with any test runner that supports `async`/`await` — Jest, Vitest, Mocha, and others.

## Installation

```sh
npm install --save-dev @mimir/testcontainers
```

```sh
# yarn
yarn add --dev @mimir/testcontainers

# pnpm
pnpm add -D @mimir/testcontainers
```

## Basic usage — Jest

```typescript
import { MimirContainer } from "@mimir/testcontainers";
import { S3Client, CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

describe("S3", () => {
    let mimir: MimirContainer;

    beforeAll(async () => {
        mimir = await new MimirContainer().start();
    });

    afterAll(async () => {
        await mimir.stop();
    });

    it("should create and list a bucket", async () => {
        const s3 = new S3Client({
            endpoint: mimir.getEndpoint(),
            region: mimir.getRegion(),
            credentials: {
                accessKeyId: mimir.getAccessKey(),
                secretAccessKey: mimir.getSecretKey(),
            },
            forcePathStyle: true,
        });

        await s3.send(new CreateBucketCommand({ Bucket: "my-bucket" }));

        const { Buckets } = await s3.send(new ListBucketsCommand({}));
        expect(Buckets?.some(b => b.Name === "my-bucket")).toBe(true);
    });
});
```

## SQS example

```typescript
import { MimirContainer } from "@mimir/testcontainers";
import {
    SQSClient,
    CreateQueueCommand,
    SendMessageCommand,
    ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";

describe("SQS", () => {
    let mimir: MimirContainer;
    let sqs: SQSClient;

    beforeAll(async () => {
        mimir = await new MimirContainer().start();
        sqs = new SQSClient({
            endpoint: mimir.getEndpoint(),
            region: mimir.getRegion(),
            credentials: {
                accessKeyId: mimir.getAccessKey(),
                secretAccessKey: mimir.getSecretKey(),
            },
        });
    });

    afterAll(async () => {
        await mimir.stop();
    });

    it("should send and receive a message", async () => {
        const { QueueUrl } = await sqs.send(
            new CreateQueueCommand({ QueueName: "orders" })
        );

        await sqs.send(
            new SendMessageCommand({
                QueueUrl,
                MessageBody: JSON.stringify({ event: "order.placed" }),
            })
        );

        const { Messages } = await sqs.send(
            new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 1 })
        );

        expect(Messages).toHaveLength(1);
        expect(JSON.parse(Messages![0].Body!).event).toBe("order.placed");
    });
});
```

## DynamoDB example

```typescript
import { MimirContainer } from "@mimir/testcontainers";
import {
    DynamoDBClient,
    CreateTableCommand,
    PutItemCommand,
    GetItemCommand,
} from "@aws-sdk/client-dynamodb";

describe("DynamoDB", () => {
    let mimir: MimirContainer;
    let dynamo: DynamoDBClient;

    beforeAll(async () => {
        mimir = await new MimirContainer().start();
        dynamo = new DynamoDBClient({
            endpoint: mimir.getEndpoint(),
            region: mimir.getRegion(),
            credentials: {
                accessKeyId: mimir.getAccessKey(),
                secretAccessKey: mimir.getSecretKey(),
            },
        });
    });

    afterAll(async () => {
        await mimir.stop();
    });

    it("should put and get an item", async () => {
        await dynamo.send(
            new CreateTableCommand({
                TableName: "Orders",
                AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
                KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
                BillingMode: "PAY_PER_REQUEST",
            })
        );

        await dynamo.send(
            new PutItemCommand({
                TableName: "Orders",
                Item: {
                    id: { S: "order-1" },
                    status: { S: "placed" },
                },
            })
        );

        const { Item } = await dynamo.send(
            new GetItemCommand({
                TableName: "Orders",
                Key: { id: { S: "order-1" } },
            })
        );

        expect(Item?.status?.S).toBe("placed");
    });
});
```

## Vitest

The same pattern works with Vitest — replace `describe`/`it`/`expect` with their Vitest equivalents (the API is identical):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MimirContainer } from "@mimir/testcontainers";
import { S3Client, CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

describe("S3", () => {
    let mimir: MimirContainer;

    beforeAll(async () => {
        mimir = await new MimirContainer().start();
    });

    afterAll(async () => {
        await mimir.stop();
    });

    it("should create a bucket", async () => {
        const s3 = new S3Client({
            endpoint: mimir.getEndpoint(),
            region: mimir.getRegion(),
            credentials: {
                accessKeyId: mimir.getAccessKey(),
                secretAccessKey: mimir.getSecretKey(),
            },
            forcePathStyle: true,
        });

        await s3.send(new CreateBucketCommand({ Bucket: "vitest-bucket" }));

        const { Buckets } = await s3.send(new ListBucketsCommand({}));
        expect(Buckets?.some(b => b.Name === "vitest-bucket")).toBe(true);
    });
});
```

## Reusing the container across test files

Start the container once in a global setup file and expose the endpoint via an environment variable or a shared module so individual test files don't each start their own container.

=== "Jest — globalSetup"

    ```typescript
    // jest.global-setup.ts
    import { MimirContainer } from "@mimir/testcontainers";

    let mimir: MimirContainer;

    export async function setup() {
        mimir = await new MimirContainer().start();
        process.env.MIMIR_ENDPOINT = mimir.getEndpoint();
    }

    export async function teardown() {
        await mimir?.stop();
    }
    ```

    ```json
    // jest.config.json
    {
      "globalSetup": "./jest.global-setup.ts"
    }
    ```

=== "Vitest — globalSetup"

    ```typescript
    // vitest.global-setup.ts
    import { MimirContainer } from "@mimir/testcontainers";

    let mimir: MimirContainer;

    export async function setup() {
        mimir = await new MimirContainer().start();
        process.env.MIMIR_ENDPOINT = mimir.getEndpoint();
    }

    export async function teardown() {
        await mimir?.stop();
    }
    ```

    ```typescript
    // vitest.config.ts
    import { defineConfig } from "vitest/config";

    export default defineConfig({
        test: {
            globalSetup: "./vitest.global-setup.ts",
        },
    });
    ```

## Source and changelog

[github.com/mimir-io/testcontainers-mimir-node](https://github.com/mimir-io/testcontainers-mimir-node)
