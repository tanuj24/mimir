import { Router } from "express";
import {
  EC2Client,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeImagesCommand,
} from "@aws-sdk/client-ec2";
import { makeClient } from "../aws/clientFactory.js";
import { asyncHandler, regionOf } from "../lib/http.js";
import { removeInstanceContainers } from "../ec2/cleanup.js";

function client(req: { header(n: string): string | undefined }) {
  return makeClient(EC2Client, { region: regionOf(req as never) });
}

function nameTag(tags?: { Key?: string; Value?: string }[]) {
  return tags?.find((t) => t.Key === "Name")?.Value;
}

export const ec2Router = Router();

ec2Router.get(
  "/instances",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeInstancesCommand({}));
    const instances = (out.Reservations ?? []).flatMap((r) =>
      (r.Instances ?? []).map((i) => ({
        id: i.InstanceId,
        name: nameTag(i.Tags),
        type: i.InstanceType,
        state: i.State?.Name,
        privateIp: i.PrivateIpAddress,
        publicIp: i.PublicIpAddress,
        az: i.Placement?.AvailabilityZone,
        imageId: i.ImageId,
        launchTime: i.LaunchTime,
        vpcId: i.VpcId,
      })),
    );
    res.json({ instances });
  }),
);

ec2Router.post(
  "/instances",
  asyncHandler(async (req, res) => {
    const { imageId, instanceType, name, count } = req.body as {
      imageId: string;
      instanceType?: string;
      name?: string;
      count?: number;
    };
    const out = await client(req).send(
      new RunInstancesCommand({
        ImageId: imageId,
        InstanceType: (instanceType as never) ?? "t3.micro",
        MinCount: count ?? 1,
        MaxCount: count ?? 1,
        TagSpecifications: name
          ? [{ ResourceType: "instance", Tags: [{ Key: "Name", Value: name }] }]
          : undefined,
      }),
    );
    res.status(201).json({ ids: (out.Instances ?? []).map((i) => i.InstanceId) });
  }),
);

ec2Router.post(
  "/instances/state",
  asyncHandler(async (req, res) => {
    const { ids, action } = req.body as { ids: string[]; action: "start" | "stop" | "terminate" };
    const c = client(req);
    if (action === "start") await c.send(new StartInstancesCommand({ InstanceIds: ids }));
    else if (action === "stop") await c.send(new StopInstancesCommand({ InstanceIds: ids }));
    else {
      await c.send(new TerminateInstancesCommand({ InstanceIds: ids }));
      // Floci leaves the backing container behind on terminate — remove it.
      removeInstanceContainers(ids);
    }
    res.json({ ok: true });
  }),
);

ec2Router.get(
  "/security-groups",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeSecurityGroupsCommand({}));
    res.json({
      groups: (out.SecurityGroups ?? []).map((g) => ({
        id: g.GroupId,
        name: g.GroupName,
        description: g.Description,
        vpcId: g.VpcId,
        inboundRules: g.IpPermissions?.length ?? 0,
        outboundRules: g.IpPermissionsEgress?.length ?? 0,
      })),
    });
  }),
);

ec2Router.get(
  "/vpcs",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeVpcsCommand({}));
    res.json({
      vpcs: (out.Vpcs ?? []).map((v) => ({
        id: v.VpcId,
        name: nameTag(v.Tags),
        cidr: v.CidrBlock,
        state: v.State,
        isDefault: v.IsDefault,
      })),
    });
  }),
);

ec2Router.get(
  "/images",
  asyncHandler(async (req, res) => {
    const out = await client(req).send(new DescribeImagesCommand({ MaxResults: 50 }));
    res.json({
      images: (out.Images ?? []).map((i) => ({
        id: i.ImageId,
        name: i.Name,
        description: i.Description,
        architecture: i.Architecture,
        state: i.State,
      })),
    });
  }),
);
