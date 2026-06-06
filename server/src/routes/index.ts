import { Router } from "express";
import { s3Router } from "./s3.js";
import { dynamodbRouter } from "./dynamodb.js";
import { lambdaRouter } from "./lambda.js";
import { sqsRouter } from "./sqs.js";
import { snsRouter } from "./sns.js";
import { logsRouter } from "./logs.js";
import { metricsRouter } from "./metrics.js";
import { kmsRouter } from "./kms.js";
import { secretsRouter } from "./secrets.js";
import { ssmRouter } from "./ssm.js";
import { ec2Router } from "./ec2.js";
import { ecsRouter } from "./ecs.js";
import { ecrRouter } from "./ecr.js";
import { eksRouter } from "./eks.js";
import { glueRouter } from "./glue.js";
import { kafkaRouter } from "./kafka.js";
import { systemRouter } from "./system.js";

/**
 * Mounts every service router under /api/<service>.
 * Add new services here as they're implemented.
 */
export const apiRouter = Router();

apiRouter.use("/s3", s3Router);
apiRouter.use("/dynamodb", dynamodbRouter);
apiRouter.use("/lambda", lambdaRouter);
apiRouter.use("/sqs", sqsRouter);
apiRouter.use("/sns", snsRouter);
apiRouter.use("/logs", logsRouter);
apiRouter.use("/metrics", metricsRouter);
apiRouter.use("/kms", kmsRouter);
apiRouter.use("/secrets", secretsRouter);
apiRouter.use("/ssm", ssmRouter);
apiRouter.use("/ec2", ec2Router);
apiRouter.use("/ecs", ecsRouter);
apiRouter.use("/ecr", ecrRouter);
apiRouter.use("/eks", eksRouter);
apiRouter.use("/glue", glueRouter);
apiRouter.use("/kafka", kafkaRouter);
apiRouter.use("/system", systemRouter);
