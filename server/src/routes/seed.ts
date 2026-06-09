import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { makeClient } from "../aws/clientFactory.js";
import {
  seedS3,
  seedDynamoDB,
  seedLambda,
  seedSqs,
  seedSns,
  seedKms,
  seedSecrets,
  seedSsm,
  seedCloudWatchLogs,
  seedCloudWatchMetrics,
  seedGlue,
  seedEcs,
  seedEcr,
} from "../seed.js";

import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";
import { SQSClient, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { SNSClient, ListTopicsCommand } from "@aws-sdk/client-sns";
import { KMSClient, ListAliasesCommand } from "@aws-sdk/client-kms";
import { SecretsManagerClient, DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient, ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
import { ECSClient, DescribeClustersCommand } from "@aws-sdk/client-ecs";
import { getJob } from "../glue/engine.js";
import { ECRClient, DescribeRepositoriesCommand } from "@aws-sdk/client-ecr";

const SEEDERS: Record<string, () => Promise<void>> = {
  s3: seedS3,
  dynamodb: seedDynamoDB,
  lambda: seedLambda,
  sqs: seedSqs,
  sns: seedSns,
  kms: seedKms,
  secrets: seedSecrets,
  ssm: seedSsm,
  logs: seedCloudWatchLogs,
  metrics: seedCloudWatchMetrics,
  glue: seedGlue,
  ecs: seedEcs,
  ecr: seedEcr,
};

// Each check mirrors the idempotency guard at the top of the corresponding seed function.
const STATUS_CHECKS: Record<string, () => Promise<boolean>> = {
  s3: () =>
    makeClient(S3Client, { forcePathStyle: true })
      .send(new HeadBucketCommand({ Bucket: "mimir-sample-data" }))
      .then(() => true).catch(() => false),

  dynamodb: () =>
    makeClient(DynamoDBClient, {})
      .send(new DescribeTableCommand({ TableName: "mimir-users" }))
      .then(() => true).catch(() => false),

  lambda: () =>
    makeClient(LambdaClient, {})
      .send(new GetFunctionCommand({ FunctionName: "hello-mimir" }))
      .then(() => true).catch(() => false),

  sqs: () =>
    makeClient(SQSClient, {})
      .send(new GetQueueUrlCommand({ QueueName: "mimir-jobs-queue" }))
      .then(() => true).catch(() => false),

  sns: async () => {
    const res = await makeClient(SNSClient, {})
      .send(new ListTopicsCommand({}))
      .catch(() => ({ Topics: [] }));
    return res.Topics?.some((t) => t.TopicArn?.includes("mimir-alerts")) ?? false;
  },

  kms: async () => {
    const res = await makeClient(KMSClient, {})
      .send(new ListAliasesCommand({}))
      .catch(() => ({ Aliases: [] }));
    return res.Aliases?.some((a) => a.AliasName === "alias/mimir-master-key") ?? false;
  },

  secrets: () =>
    makeClient(SecretsManagerClient, {})
      .send(new DescribeSecretCommand({ SecretId: "mimir/db/credentials" }))
      .then(() => true).catch(() => false),

  ssm: () =>
    makeClient(SSMClient, {})
      .send(new GetParameterCommand({ Name: "/mimir/app/environment" }))
      .then(() => true).catch(() => false),

  logs: async () => {
    const res = await makeClient(CloudWatchLogsClient, {})
      .send(new DescribeLogGroupsCommand({ logGroupNamePrefix: "/mimir/sample-app" }))
      .catch(() => ({ logGroups: [] }));
    return (res.logGroups?.length ?? 0) > 0;
  },

  metrics: async () => {
    const res = await makeClient(CloudWatchClient, {})
      .send(new ListMetricsCommand({ Namespace: "Mimir/SampleApp" }))
      .catch(() => ({ Metrics: [] }));
    return (res.Metrics?.length ?? 0) > 0;
  },

  glue: () => Promise.resolve(!!getJob("mimir-hudi-ingest")),

  ecs: async () => {
    const res = await makeClient(ECSClient, {})
      .send(new DescribeClustersCommand({ clusters: ["mimir-sample-cluster"] }))
      .catch(() => ({ clusters: [] }));
    return (res.clusters?.filter((c) => c.status === "ACTIVE").length ?? 0) > 0;
  },

  ecr: () =>
    makeClient(ECRClient, {})
      .send(new DescribeRepositoriesCommand({ repositoryNames: ["mimir-sample-app"] }))
      .then(() => true).catch(() => false),
};

export const seedRouter = Router();

seedRouter.get(
  "/:service/status",
  asyncHandler(async (req, res) => {
    const fn = STATUS_CHECKS[req.params.service];
    if (!fn) { res.status(404).json({ error: `Unknown service: ${req.params.service}` }); return; }
    const seeded = await fn();
    res.json({ seeded });
  }),
);

seedRouter.post(
  "/:service",
  asyncHandler(async (req, res) => {
    const fn = SEEDERS[req.params.service];
    if (!fn) { res.status(404).json({ error: `Unknown service: ${req.params.service}` }); return; }
    await fn();
    res.json({ ok: true });
  }),
);
