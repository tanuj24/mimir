import { Router } from "express";
import { execFile } from "node:child_process";
import { asyncHandler } from "../lib/http.js";

/**
 * Host resource usage, derived from the Docker daemon the engine launches
 * containers on. Surfaces in the UI's bottom monitor bar so users see that
 * spinning up more EC2 instances / Glue jobs is bounded by their own machine.
 */

export interface SystemStats {
  cpuPercent: number; // 0–100, summed across containers / host cores
  cores: number;
  memUsedBytes: number; // summed container memory
  memTotalBytes: number; // host/VM total
  containers: number; // running containers
}

let cache: { at: number; data: SystemStats } | null = null;
const TTL_MS = 2500; // docker stats is ~1–2s; cache so frequent polls are cheap

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, (err, out) => resolve(err ? "" : out)));
}

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1e3,
  kib: 1024,
  mb: 1e6,
  mib: 1024 ** 2,
  gb: 1e9,
  gib: 1024 ** 3,
  tb: 1e12,
  tib: 1024 ** 4,
};
function parseBytes(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([A-Za-z]+)?$/);
  if (!m) return 0;
  return parseFloat(m[1]) * (UNITS[(m[2] ?? "b").toLowerCase()] ?? 1);
}

async function compute(): Promise<SystemStats> {
  const info = await run("docker", ["info", "--format", "{{.NCPU}}|{{.MemTotal}}"]);
  const [ncpu, memTotal] = info.trim().split("|");
  const cores = parseInt(ncpu, 10) || 1;
  const memTotalBytes = parseInt(memTotal, 10) || 0;

  const stats = await run("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}"]);
  let cpuSum = 0;
  let memUsedBytes = 0;
  let containers = 0;
  for (const line of stats.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const [cpu, mem] = t.split("|");
    cpuSum += parseFloat(cpu) || 0; // "12.34%"
    memUsedBytes += parseBytes((mem ?? "").split("/")[0]); // "1.5GiB / 7.6GiB"
    containers++;
  }
  return {
    cpuPercent: Math.min(100, cores ? cpuSum / cores : 0),
    cores,
    memUsedBytes,
    memTotalBytes,
    containers,
  };
}

export const systemRouter = Router();

systemRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), data: await compute() };
    res.json(cache.data);
  }),
);
