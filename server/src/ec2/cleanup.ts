import { execFile } from "node:child_process";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { makeClient } from "../aws/clientFactory.js";
import { config } from "../config.js";

/**
 * Floci backs each EC2 instance with a Docker container named
 * `floci-ec2-<instance-id>`, but it does NOT remove that container when an
 * instance is terminated — leaving exited containers behind. We clean those up:
 *   - immediately when the user terminates instances (removeInstanceContainers)
 *   - periodically, for any orphan left by an earlier process (startEc2Reconcile)
 *
 * The reconcile is deliberately conservative: it only removes containers that
 * are already EXITED/DEAD and whose instance is gone or terminated. A running
 * instance's container (Up) is never touched, and a STOPPED instance keeps its
 * container so it can be started again.
 */

const PREFIX = "floci-ec2-";

function dockerRm(names: string[]): void {
  if (names.length) execFile("docker", ["rm", "-f", ...names], () => {});
}

/** Remove the Floci containers backing the given instance ids (on terminate). */
export function removeInstanceContainers(ids: string[]): void {
  dockerRm(ids.filter(Boolean).map((id) => `${PREFIX}${id}`));
}

async function liveInstanceIds(): Promise<Set<string>> {
  const ec2 = makeClient(EC2Client, { region: config.region });
  const out = await ec2.send(new DescribeInstancesCommand({}));
  const live = new Set<string>();
  for (const r of out.Reservations ?? [])
    for (const i of r.Instances ?? []) {
      const state = i.State?.Name;
      if (i.InstanceId && state !== "terminated" && state !== "shutting-down") live.add(i.InstanceId);
    }
  return live;
}

/** Periodically drop exited Floci EC2 containers whose instance is gone. */
export function startEc2Reconcile(intervalMs = 60_000): void {
  const sweep = async () => {
    let live: Set<string>;
    try {
      live = await liveInstanceIds();
    } catch {
      return; // never act on an incomplete view of instances
    }
    execFile(
      "docker",
      ["ps", "-a", "--filter", `name=${PREFIX}`, "--filter", "status=exited", "--filter", "status=dead", "--format", "{{.Names}}"],
      (err, out) => {
        if (err || !out.trim()) return;
        const stale = out
          .trim()
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
          .filter((name) => !live.has(name.slice(PREFIX.length)));
        dockerRm(stale);
      },
    );
  };
  void sweep();
  setInterval(() => void sweep(), intervalMs).unref();
}
