/**
 * Sample data seeder — runs once on first startup, writes a flag file when done.
 * Creates realistic resources in every service so the tool is immediately
 * explorable without requiring the user to set anything up.
 */

import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ScalarAttributeType,
  KeyType,
  BillingMode,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import {
  SNSClient,
  CreateTopicCommand,
} from "@aws-sdk/client-sns";
import {
  KMSClient,
  CreateKeyCommand,
  CreateAliasCommand,
  ListAliasesCommand,
} from "@aws-sdk/client-kms";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  DescribeSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  GlueClient,
  CreateDatabaseCommand,
  CreateJobCommand,
  GetJobCommand,
} from "@aws-sdk/client-glue";
import {
  ECSClient,
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import AdmZip from "adm-zip";
import { existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient } from "./aws/clientFactory.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR =
  process.env.MIMIR_STORAGE_PERSISTENT_PATH ?? join(__dirname, "..", "..");
const SEED_FLAG = join(DATA_DIR, ".mimir-seeded");

function ignore(codes: string[]) {
  return (e: unknown) => {
    const code = (e as { name?: string; Code?: string }).name ?? (e as { Code?: string }).Code ?? "";
    if (!codes.includes(code)) console.warn("[seed]", (e as Error).message);
  };
}

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------
async function seedS3() {
  const cl = makeClient(S3Client, { forcePathStyle: true });

  const exists = await cl
    .send(new HeadBucketCommand({ Bucket: "mimir-sample-data" }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  await cl.send(new CreateBucketCommand({ Bucket: "mimir-sample-data" })).catch(ignore(["BucketAlreadyExists", "BucketAlreadyOwnedByYou"]));
  await cl.send(new CreateBucketCommand({ Bucket: "mimir-uploads" })).catch(ignore(["BucketAlreadyExists", "BucketAlreadyOwnedByYou"]));
  await cl.send(new CreateBucketCommand({ Bucket: "mimir-logs" })).catch(ignore(["BucketAlreadyExists", "BucketAlreadyOwnedByYou"]));

  const put = (key: string, body: string, type = "application/json") =>
    cl.send(new PutObjectCommand({ Bucket: "mimir-sample-data", Key: key, Body: body, ContentType: type }));

  await put("data/users.json", JSON.stringify([
    { id: "u1", name: "Alice Johnson", email: "alice@example.com", role: "admin", createdAt: "2024-01-15T10:00:00Z" },
    { id: "u2", name: "Bob Smith", email: "bob@example.com", role: "developer", createdAt: "2024-02-20T14:30:00Z" },
    { id: "u3", name: "Carol White", email: "carol@example.com", role: "analyst", createdAt: "2024-03-05T09:15:00Z" },
  ], null, 2));

  await put("data/products.json", JSON.stringify([
    { id: "p1", name: "Widget Pro", price: 29.99, category: "hardware", stock: 142 },
    { id: "p2", name: "DataSync API", price: 49.99, category: "software", stock: 999 },
    { id: "p3", name: "CloudAdapter", price: 99.00, category: "software", stock: 500 },
  ], null, 2));

  await put("data/orders.csv",
    "orderId,userId,product,amount,status,createdAt\n" +
    "o1,u1,Widget Pro,29.99,shipped,2024-04-01T08:00:00Z\n" +
    "o2,u2,DataSync API,49.99,pending,2024-04-02T11:30:00Z\n" +
    "o3,u3,CloudAdapter,99.00,delivered,2024-04-03T14:00:00Z\n",
    "text/csv"
  );

  await put("logs/app-2024-04-01.log",
    "[2024-04-01 00:00:01] INFO  Server started on port 8080\n" +
    "[2024-04-01 00:01:15] INFO  Connected to database\n" +
    "[2024-04-01 00:05:32] INFO  Processed 42 orders\n" +
    "[2024-04-01 01:00:00] WARN  High memory usage: 78%\n" +
    "[2024-04-01 02:30:11] ERROR Failed to send email to user u2: SMTP timeout\n",
    "text/plain"
  );

  await put("README.txt",
    "Mimir Sample Data Bucket\n" +
    "========================\n" +
    "This bucket contains sample data pre-loaded by Mimir for exploration.\n\n" +
    "Contents:\n" +
    "  data/users.json    - Sample user records\n" +
    "  data/products.json - Sample product catalog\n" +
    "  data/orders.csv    - Sample order history\n" +
    "  logs/              - Sample application logs\n",
    "text/plain"
  );
}

// ---------------------------------------------------------------------------
// DynamoDB
// ---------------------------------------------------------------------------
async function seedDynamoDB() {
  const cl = makeClient(DynamoDBClient, {});
  const doc = DynamoDBDocumentClient.from(cl);

  const tableExists = await cl
    .send(new DescribeTableCommand({ TableName: "mimir-users" }))
    .then(() => true)
    .catch(() => false);
  if (tableExists) return;

  await cl.send(new CreateTableCommand({
    TableName: "mimir-users",
    AttributeDefinitions: [{ AttributeName: "userId", AttributeType: ScalarAttributeType.S }],
    KeySchema: [{ AttributeName: "userId", KeyType: KeyType.HASH }],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  })).catch(ignore(["ResourceInUseException"]));

  await cl.send(new CreateTableCommand({
    TableName: "mimir-orders",
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: ScalarAttributeType.S },
      { AttributeName: "userId", AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: "orderId", KeyType: KeyType.HASH },
      { AttributeName: "userId", KeyType: KeyType.RANGE },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  })).catch(ignore(["ResourceInUseException"]));

  await cl.send(new CreateTableCommand({
    TableName: "mimir-sessions",
    AttributeDefinitions: [{ AttributeName: "sessionId", AttributeType: ScalarAttributeType.S }],
    KeySchema: [{ AttributeName: "sessionId", KeyType: KeyType.HASH }],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  })).catch(ignore(["ResourceInUseException"]));

  for (const item of [
    { userId: "u1", name: "Alice Johnson", email: "alice@example.com", role: "admin", createdAt: "2024-01-15T10:00:00Z", active: true },
    { userId: "u2", name: "Bob Smith", email: "bob@example.com", role: "developer", createdAt: "2024-02-20T14:30:00Z", active: true },
    { userId: "u3", name: "Carol White", email: "carol@example.com", role: "analyst", createdAt: "2024-03-05T09:15:00Z", active: false },
  ]) {
    await doc.send(new PutCommand({ TableName: "mimir-users", Item: item })).catch(() => {});
  }

  for (const item of [
    { orderId: "o1", userId: "u1", product: "Widget Pro", amount: 29.99, status: "shipped", createdAt: "2024-04-01T08:00:00Z" },
    { orderId: "o2", userId: "u2", product: "DataSync API", amount: 49.99, status: "pending", createdAt: "2024-04-02T11:30:00Z" },
    { orderId: "o3", userId: "u3", product: "CloudAdapter", amount: 99.00, status: "delivered", createdAt: "2024-04-03T14:00:00Z" },
  ]) {
    await doc.send(new PutCommand({ TableName: "mimir-orders", Item: item })).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Lambda
// ---------------------------------------------------------------------------
function makeZip(filename: string, code: string): Uint8Array {
  const zip = new AdmZip();
  zip.addFile(filename, Buffer.from(code, "utf-8"));
  return new Uint8Array(zip.toBuffer());
}

async function seedLambda() {
  const cl = makeClient(LambdaClient, {});

  const exists = await cl
    .send(new GetFunctionCommand({ FunctionName: "hello-mimir" }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  const functions = [
    {
      name: "hello-mimir",
      runtime: "python3.12",
      handler: "index.lambda_handler",
      description: "Sample hello-world Lambda — invoke with {\"name\": \"Alice\"}",
      filename: "index.py",
      code: `def lambda_handler(event, context):
    name = event.get('name', 'World')
    return {
        'statusCode': 200,
        'body': f'Hello, {name}! Running on Mimir local AWS.'
    }
`,
    },
    {
      name: "process-s3-event",
      runtime: "nodejs20.x",
      handler: "index.handler",
      description: "Logs and counts S3 event records",
      filename: "index.mjs",
      code: `export const handler = async (event) => {
  console.log('S3 event received:', JSON.stringify(event, null, 2));
  const records = event.Records ?? [];
  for (const r of records) {
    console.log('Bucket:', r.s3?.bucket?.name, 'Key:', r.s3?.object?.key);
  }
  return { statusCode: 200, processed: records.length };
};
`,
    },
    {
      name: "transform-dynamo-stream",
      runtime: "python3.12",
      handler: "index.lambda_handler",
      description: "Processes DynamoDB stream events and logs changes",
      filename: "index.py",
      code: `import json

def lambda_handler(event, context):
    records = event.get('Records', [])
    changes = []
    for record in records:
        event_name = record.get('eventName')
        new_image = record.get('dynamodb', {}).get('NewImage', {})
        old_image = record.get('dynamodb', {}).get('OldImage', {})
        print(f'{event_name}: {json.dumps(new_image)}')
        changes.append({'event': event_name, 'new': new_image, 'old': old_image})
    return {'processed': len(records), 'changes': changes}
`,
    },
  ];

  for (const fn of functions) {
    await cl.send(new CreateFunctionCommand({
      FunctionName: fn.name,
      Runtime: fn.runtime as never,
      Handler: fn.handler,
      Role: "arn:aws:iam::000000000000:role/lambda-role",
      Code: { ZipFile: makeZip(fn.filename, fn.code) },
      Description: fn.description,
      Timeout: 30,
      MemorySize: 128,
    })).catch(ignore(["ResourceConflictException"]));
  }
}

// ---------------------------------------------------------------------------
// SQS
// ---------------------------------------------------------------------------
async function seedSqs() {
  const cl = makeClient(SQSClient, {});

  const alreadyExists = await cl
    .send(new GetQueueUrlCommand({ QueueName: "mimir-jobs-queue" }))
    .then(() => true)
    .catch(() => false);
  if (alreadyExists) return;

  for (const name of ["mimir-jobs-queue", "mimir-notifications-queue", "mimir-dead-letter-queue"]) {
    await cl.send(new CreateQueueCommand({ QueueName: name })).catch(ignore(["QueueAlreadyExists"]));
  }
}

// ---------------------------------------------------------------------------
// SNS
// ---------------------------------------------------------------------------
async function seedSns() {
  const cl = makeClient(SNSClient, {});
  for (const name of ["mimir-alerts", "mimir-notifications", "mimir-order-events"]) {
    await cl.send(new CreateTopicCommand({ Name: name })).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// KMS
// ---------------------------------------------------------------------------
async function seedKms() {
  const cl = makeClient(KMSClient, {});

  const aliases = await cl.send(new ListAliasesCommand({})).catch(() => ({ Aliases: [] }));
  if (aliases.Aliases?.some((a) => a.AliasName === "alias/mimir-master-key")) return;

  const key = await cl.send(new CreateKeyCommand({
    Description: "Mimir sample master encryption key",
    KeyUsage: "ENCRYPT_DECRYPT",
  })).catch(() => null);

  if (key?.KeyMetadata?.KeyId) {
    await cl.send(new CreateAliasCommand({
      AliasName: "alias/mimir-master-key",
      TargetKeyId: key.KeyMetadata.KeyId,
    })).catch(ignore(["AlreadyExistsException"]));
  }
}

// ---------------------------------------------------------------------------
// Secrets Manager
// ---------------------------------------------------------------------------
async function seedSecrets() {
  const cl = makeClient(SecretsManagerClient, {});

  const exists = await cl
    .send(new DescribeSecretCommand({ SecretId: "mimir/db/credentials" }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  const secrets = [
    {
      name: "mimir/db/credentials",
      description: "Sample database credentials",
      value: JSON.stringify({ username: "admin", password: "sample-p@ssw0rd!", host: "localhost", port: 5432, dbname: "myapp" }),
    },
    {
      name: "mimir/api/keys",
      description: "Sample third-party API keys",
      value: JSON.stringify({ stripe: "sk_test_mimir_sample_key_123", sendgrid: "SG.mimir_sample_key_abc" }),
    },
    {
      name: "mimir/app/jwt-secret",
      description: "JWT signing secret",
      value: "mimir-sample-jwt-secret-change-in-production",
    },
  ];

  for (const s of secrets) {
    await cl.send(new CreateSecretCommand({
      Name: s.name,
      Description: s.description,
      SecretString: s.value,
    })).catch(ignore(["ResourceExistsException"]));
  }
}

// ---------------------------------------------------------------------------
// SSM Parameter Store
// ---------------------------------------------------------------------------
async function seedSsm() {
  const cl = makeClient(SSMClient, {});

  const exists = await cl
    .send(new GetParameterCommand({ Name: "/mimir/app/environment" }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  const params = [
    { Name: "/mimir/app/environment", Value: "development", Description: "Deployment environment" },
    { Name: "/mimir/app/log-level", Value: "INFO", Description: "Application log level" },
    { Name: "/mimir/app/max-connections", Value: "100", Description: "Max DB connections" },
    { Name: "/mimir/db/host", Value: "localhost", Description: "Database host" },
    { Name: "/mimir/db/port", Value: "5432", Description: "Database port" },
    { Name: "/mimir/db/name", Value: "myapp", Description: "Database name" },
    { Name: "/mimir/feature-flags/dark-mode", Value: "true", Description: "Dark mode feature flag" },
    { Name: "/mimir/feature-flags/beta-ui", Value: "false", Description: "Beta UI feature flag" },
  ];

  for (const p of params) {
    await cl.send(new PutParameterCommand({
      Name: p.Name,
      Value: p.Value,
      Type: "String",
      Description: p.Description,
      Overwrite: false,
    })).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// CloudWatch Logs — sample app logs
// ---------------------------------------------------------------------------
async function seedCloudWatchLogs() {
  const cl = makeClient(CloudWatchLogsClient, {});

  const group = "/mimir/sample-app";
  await cl.send(new CreateLogGroupCommand({ logGroupName: group })).catch(ignore(["ResourceAlreadyExistsException"]));
  await cl.send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: "main" })).catch(ignore(["ResourceAlreadyExistsException"]));

  const base = Date.now() - 3_600_000;
  const lines = [
    "INFO  Application starting up",
    "INFO  Connected to database (host=localhost, pool=10)",
    "INFO  Loaded 3 users from cache",
    "INFO  HTTP server listening on :8080",
    "INFO  GET /api/users 200 12ms",
    "INFO  POST /api/orders 201 34ms",
    "WARN  Slow query detected (145ms): SELECT * FROM orders WHERE status='pending'",
    "INFO  GET /api/products 200 8ms",
    "ERROR Failed to send email: SMTP connection refused",
    "INFO  Retrying email in 30s",
    "INFO  Email sent successfully",
    "INFO  Scheduled cleanup: removed 12 expired sessions",
  ];

  await cl.send(new PutLogEventsCommand({
    logGroupName: group,
    logStreamName: "main",
    logEvents: lines.map((message, i) => ({ timestamp: base + i * 300_000, message })),
  })).catch(() => {});
}

// ---------------------------------------------------------------------------
// CloudWatch Metrics
// ---------------------------------------------------------------------------
async function seedCloudWatchMetrics() {
  const cl = makeClient(CloudWatchClient, {});
  const now = Date.now();

  await cl.send(new PutMetricDataCommand({
    Namespace: "Mimir/SampleApp",
    MetricData: [
      { MetricName: "RequestCount", Value: 1542, Unit: "Count", Timestamp: new Date(now - 3600_000) },
      { MetricName: "RequestCount", Value: 1891, Unit: "Count", Timestamp: new Date(now - 1800_000) },
      { MetricName: "RequestCount", Value: 2134, Unit: "Count", Timestamp: new Date(now) },
      { MetricName: "ErrorRate", Value: 0.8, Unit: "Percent", Timestamp: new Date(now - 3600_000) },
      { MetricName: "ErrorRate", Value: 1.2, Unit: "Percent", Timestamp: new Date(now - 1800_000) },
      { MetricName: "ErrorRate", Value: 0.5, Unit: "Percent", Timestamp: new Date(now) },
      { MetricName: "Latency", Value: 45, Unit: "Milliseconds", Timestamp: new Date(now - 3600_000) },
      { MetricName: "Latency", Value: 38, Unit: "Milliseconds", Timestamp: new Date(now - 1800_000) },
      { MetricName: "Latency", Value: 52, Unit: "Milliseconds", Timestamp: new Date(now) },
    ],
  })).catch(() => {});
}

// ---------------------------------------------------------------------------
// Glue — sample job + catalog
// ---------------------------------------------------------------------------
async function seedGlue() {
  const cl = makeClient(GlueClient, {});

  const exists = await cl
    .send(new GetJobCommand({ JobName: "mimir-sample-etl" }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  await cl.send(new CreateDatabaseCommand({
    DatabaseInput: { Name: "mimir_sample_db", Description: "Mimir sample data catalog database" },
  })).catch(ignore(["AlreadyExistsException"]));

  await cl.send(new CreateJobCommand({
    Name: "mimir-sample-etl",
    Role: "arn:aws:iam::000000000000:role/GlueServiceRole",
    Description: "Sample Python-shell ETL job — reads users from S3, counts by role",
    Command: { Name: "pythonshell", PythonVersion: "3" },
    DefaultArguments: {
      "--TempDir": "s3://mimir-sample-data/temp/",
      "--job-language": "python",
    },
    GlueVersion: "4.0",
    ExecutionProperty: { MaxConcurrentRuns: 1 },
    Timeout: 5,
    MaxCapacity: 0.0625,
  } as never)).catch(ignore(["AlreadyExistsException", "IdempotentParameterMismatchException"]));

  await cl.send(new CreateJobCommand({
    Name: "mimir-spark-transform",
    Role: "arn:aws:iam::000000000000:role/GlueServiceRole",
    Description: "Sample Spark ETL — reads orders, groups by status, writes Parquet",
    Command: { Name: "glueetl", PythonVersion: "3", ScriptLocation: "s3://mimir-sample-data/scripts/spark_transform.py" },
    DefaultArguments: {
      "--TempDir": "s3://mimir-sample-data/temp/",
      "--job-language": "python",
      "--enable-metrics": "true",
    },
    GlueVersion: "4.0",
    WorkerType: "G.1X",
    NumberOfWorkers: 2,
    ExecutionProperty: { MaxConcurrentRuns: 1 },
    Timeout: 10,
  } as never)).catch(ignore(["AlreadyExistsException"]));
}

// ---------------------------------------------------------------------------
// ECS
// ---------------------------------------------------------------------------
async function seedEcs() {
  const cl = makeClient(ECSClient, {});

  await cl.send(new CreateClusterCommand({ clusterName: "mimir-sample-cluster" })).catch(() => {});

  await cl.send(new RegisterTaskDefinitionCommand({
    family: "mimir-web-app",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "256",
    memory: "512",
    containerDefinitions: [
      {
        name: "web",
        image: "nginx:alpine",
        portMappings: [{ containerPort: 80, protocol: "tcp" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": "/ecs/mimir-web-app",
            "awslogs-region": config.region,
            "awslogs-stream-prefix": "ecs",
          },
        },
      },
    ],
  })).catch(() => {});
}

// ---------------------------------------------------------------------------
// ECR
// ---------------------------------------------------------------------------
async function seedEcr() {
  const cl = makeClient(ECRClient, {});

  const exists = await cl
    .send(new DescribeRepositoriesCommand({ repositoryNames: ["mimir-sample-app"] }))
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  for (const name of ["mimir-sample-app", "mimir-api-service", "mimir-worker"]) {
    await cl.send(new CreateRepositoryCommand({
      repositoryName: name,
      imageScanningConfiguration: { scanOnPush: true },
    })).catch(ignore(["RepositoryAlreadyExistsException"]));
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function seedSampleData(): Promise<void> {
  if (existsSync(SEED_FLAG)) return;

  console.log("[mimir] seeding sample data for first run…");
  const t = Date.now();

  await Promise.allSettled([
    seedS3(),
    seedDynamoDB(),
    seedLambda(),
    seedSqs(),
    seedSns(),
    seedKms(),
    seedSecrets(),
    seedSsm(),
    seedCloudWatchLogs(),
    seedCloudWatchMetrics(),
    seedGlue(),
    seedEcs(),
    seedEcr(),
  ]);

  writeFileSync(SEED_FLAG, new Date().toISOString() + "\n");
  console.log(`[mimir] sample data ready (${Date.now() - t}ms)`);
}
