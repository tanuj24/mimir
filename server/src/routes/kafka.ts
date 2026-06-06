import { Router } from "express";
import {
  KafkaClient,
  CreateClusterV2Command,
  ListClustersV2Command,
  DescribeClusterV2Command,
  DeleteClusterCommand,
  GetBootstrapBrokersCommand,
} from "@aws-sdk/client-kafka";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(KafkaClient, { region: regionOf(req as never) });
}

export const kafkaRouter = Router();

// Create a provisioned MSK cluster. Subnets/security groups are placeholders —
// the Mimir backend doesn't enforce real VPC wiring, so sensible defaults keep the UI simple.
kafkaRouter.post(
  "/clusters",
  asyncHandler(async (req, res) => {
    const { name, kafkaVersion, brokers, instanceType } = req.body as {
      name?: string;
      kafkaVersion?: string;
      brokers?: number;
      instanceType?: string;
    };
    if (!name) return res.status(400).json({ error: { code: "BadRequest", message: "name is required" } });
    const numberOfBrokers = brokers && brokers > 0 ? brokers : 1;
    const out = await client(req).send(
      new CreateClusterV2Command({
        ClusterName: name,
        Provisioned: {
          KafkaVersion: kafkaVersion || "3.5.1",
          NumberOfBrokerNodes: numberOfBrokers,
          BrokerNodeGroupInfo: {
            InstanceType: instanceType || "kafka.m5.large",
            ClientSubnets: ["subnet-mimir-a", "subnet-mimir-b"],
          },
        },
      }),
    );
    res.status(201).json({ name: out.ClusterName, arn: out.ClusterArn, state: out.State });
  }),
);

kafkaRouter.get(
  "/clusters",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new ListClustersV2Command({ MaxResults: 100 }));
    res.json({
      clusters: (out.ClusterInfoList ?? []).map((c) => ({
        name: c.ClusterName,
        arn: c.ClusterArn,
        state: c.State,
        type: c.ClusterType,
        creationTime: c.CreationTime,
        kafkaVersion:
          c.Provisioned?.CurrentBrokerSoftwareInfo?.KafkaVersion ?? c.Serverless ? "serverless" : undefined,
        brokers: c.Provisioned?.NumberOfBrokerNodes,
      })),
    });
  }),
);

kafkaRouter.get(
  "/clusters/describe",
  asyncHandler(async (req, res) => {
    const arn = String(req.query.arn ?? "");
    const c = client(req);
    const d = await c.send(new DescribeClusterV2Command({ ClusterArn: arn }));
    const brokers = await c
      .send(new GetBootstrapBrokersCommand({ ClusterArn: arn }))
      .catch(() => null);
    const info = d.ClusterInfo;
    res.json({
      name: info?.ClusterName,
      arn: info?.ClusterArn,
      state: info?.State,
      type: info?.ClusterType,
      creationTime: info?.CreationTime,
      bootstrapBrokers:
        brokers?.BootstrapBrokerString ?? brokers?.BootstrapBrokerStringSaslIam ?? null,
    });
  }),
);

kafkaRouter.post(
  "/clusters/delete",
  asyncHandler(async (req, res) => {
    await client(req).send(new DeleteClusterCommand({ ClusterArn: (req.body as { arn: string }).arn }));
    res.status(204).end();
  }),
);
