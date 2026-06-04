import { Router } from "express";
import {
  CloudWatchClient,
  ListMetricsCommand,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(CloudWatchClient, { region: regionOf(req as never) });
}

export const metricsRouter = Router();

metricsRouter.get(
  "/list",
  asyncHandler(async (req, res) => {
    const namespace = req.query.namespace ? String(req.query.namespace) : undefined;
    const out = await client(req).send(new ListMetricsCommand({ Namespace: namespace }));
    const metrics = (out.Metrics ?? []).map((m) => ({
      namespace: m.Namespace,
      name: m.MetricName,
      dimensions: (m.Dimensions ?? []).map((d) => ({ name: d.Name, value: d.Value })),
    }));
    const namespaces = Array.from(new Set(metrics.map((m) => m.namespace))).sort();
    res.json({ metrics, namespaces });
  }),
);

metricsRouter.post(
  "/statistics",
  asyncHandler(async (req, res) => {
    const { namespace, metricName, dimensions, periodMinutes } = req.body as {
      namespace: string;
      metricName: string;
      dimensions?: { name: string; value: string }[];
      periodMinutes?: number;
    };
    const end = new Date();
    const start = new Date(end.getTime() - (periodMinutes ?? 180) * 60 * 1000);
    const out = await client(req).send(
      new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions?.map((d) => ({ Name: d.name, Value: d.value })),
        StartTime: start,
        EndTime: end,
        Period: 300,
        Statistics: ["Average", "Sum", "Maximum", "Minimum"],
      }),
    );
    const points = (out.Datapoints ?? [])
      .map((d) => ({
        timestamp: d.Timestamp,
        average: d.Average,
        sum: d.Sum,
        max: d.Maximum,
        min: d.Minimum,
      }))
      .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());
    res.json({ points, unit: out.Datapoints?.[0]?.Unit ?? null });
  }),
);
