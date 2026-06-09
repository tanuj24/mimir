import { spawn, execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { makeClient } from "../aws/clientFactory.js";
import { config } from "../config.js";
import { GlueJobLogger, publishSessionLog } from "./cwLogs.js";

/**
 * Local AWS-Glue-style execution engine.
 *
 * the Mimir backend does NOT implement Glue jobs or interactive sessions, so Mimir runs
 * them locally in Docker using the OFFICIAL AWS Glue runtime images. These
 * bundle the exact libraries a real Glue job ships with — the `awsglue` package
 * (GlueContext, DynamicFrame, the Glue transforms, Job, getResolvedOptions), a
 * version-matched Apache Spark, py4j, plus boto3/pandas/numpy/pyarrow — so an
 * unmodified Glue job script runs here the same way it does on AWS:
 *   - Spark (glueetl)    -> Glue image, `$SPARK_HOME/bin/spark-submit script.py`
 *   - Python shell jobs  -> Glue image, `python script.py` (awsglue on PYTHONPATH)
 *   - Notebooks/sessions -> a long-lived kernel container with stateful exec
 *
 * Containers are wired to the Mimir backend's emulated AWS (S3 via the s3a connector, boto3
 * via AWS_ENDPOINT_URL) so jobs can read/write real local buckets.
 *
 * Catalog (databases/tables) is handled separately against the Mimir backend's real API.
 */

// glueVersion -> the official AWS Glue libs image that matches that runtime.
// Every image ships `awsglue` on PYTHONPATH (PyGlue.zip) and a version-matched
// Spark, so real Glue code executes unchanged. Each is overridable via env.
const GLUE_IMAGES: Record<string, string> = {
  "5.0": process.env.GLUE_IMAGE_5_0 ?? "public.ecr.aws/glue/aws-glue-libs:5",
  "4.0": process.env.GLUE_IMAGE_4_0 ?? "amazon/aws-glue-libs:glue_libs_4.0.0_image_01",
  "3.0": process.env.GLUE_IMAGE_3_0 ?? "amazon/aws-glue-libs:glue_libs_3.0.0_image_01",
  "2.0": process.env.GLUE_IMAGE_2_0 ?? "amazon/aws-glue-libs:glue_libs_2.0.0_image_01",
  // AWS never published a 1.0 dev image; 2.0 is the closest runtime.
  "1.0": process.env.GLUE_IMAGE_2_0 ?? "amazon/aws-glue-libs:glue_libs_2.0.0_image_01",
};
const DEFAULT_GLUE_VERSION = "4.0";

/** Resolve a Glue version (e.g. "4.0") to its runtime Docker image. */
function glueImage(glueVersion: string): string {
  return GLUE_IMAGES[glueVersion] ?? GLUE_IMAGES[DEFAULT_GLUE_VERSION];
}

/**
 * Endpoint the job/kernel containers use to reach the Mimir backend. They run on the HOST
 * docker daemon (not the compose network), so they reach the Mimir backend's published port
 * via the host gateway, not the internal `mimir` hostname. Overridable.
 */
const RUNTIME_ENDPOINT = process.env.GLUE_AWS_ENDPOINT ?? "http://host.docker.internal:4566";

/** `-e KEY=VALUE` args that point boto3/AWS SDKs inside the container at the Mimir backend. */
function awsEnvArgs(): string[] {
  const env: Record<string, string> = {
    AWS_REGION: config.region,
    AWS_DEFAULT_REGION: config.region,
    AWS_ACCESS_KEY_ID: config.accessKeyId,
    AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
    AWS_ENDPOINT_URL: RUNTIME_ENDPOINT, // boto3 (botocore >= 1.28) honors this
    AWS_ENDPOINT_URL_S3: RUNTIME_ENDPOINT,
    AWS_ENDPOINT_URL_GLUE: RUNTIME_ENDPOINT,
    DISABLE_SSL: "true", // the Glue images skip SSL for local endpoints
  };
  return Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
}

/**
 * Spark confs required for Apache Hudi when a job specifies --datalake-formats hudi.
 * In the real Glue service these are injected automatically by the control plane;
 * locally we inject them ourselves when the parameter is present.
 */
function hudiSparkConf(): string[] {
  return [
    ["spark.serializer", "org.apache.spark.serializer.KryoSerializer"],
    ["spark.sql.extensions", "org.apache.spark.sql.hudi.HoodieSparkSessionExtension"],
    ["spark.sql.catalog.spark_catalog", "org.apache.spark.sql.hudi.catalog.HoodieCatalog"],
    ["spark.kryo.registrator", "org.apache.spark.HoodieSparkKryoRegistrar"],
  ].flatMap(([k, v]) => ["--conf", `${k}=${v}`]);
}

/**
 * Spark confs that point the runtime at the Mimir backend so unmodified Glue code "just
 * works" against the local stack:
 *   - fs.s3a.*          -> DataFrame/DynamicFrame S3 reads & writes
 *   - fs.s3.impl        -> route real catalog s3:// locations through S3A
 *   - hadoop aws.glue.* -> the Hive catalog client (AWSGlueDataCatalogHive-
 *                          ClientFactory) used by spark.sql("… db.table")
 * The Glue ETL catalog client (DynamicFrame.from_catalog) is NOT configured
 * here — it reads its endpoint from a classpath resource; see glueCatalogConf.
 * All clients fall back to the AWS default credential chain, satisfied by the
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env we inject.
 */
function s3aConf(): string[] {
  return [
    // S3 (s3a connector)
    ["spark.hadoop.fs.s3a.endpoint", RUNTIME_ENDPOINT],
    ["spark.hadoop.fs.s3a.path.style.access", "true"],
    ["spark.hadoop.fs.s3a.connection.ssl.enabled", "false"],
    ["spark.hadoop.fs.s3a.access.key", config.accessKeyId],
    ["spark.hadoop.fs.s3a.secret.key", config.secretAccessKey],
    [
      "spark.hadoop.fs.s3a.aws.credentials.provider",
      "org.apache.hadoop.fs.s3a.SimpleAWSCredentialsProvider",
    ],
    // Real catalog tables store s3:// locations — route that scheme through S3A
    // so from_catalog can read them against the Mimir backend's S3.
    ["spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem"],
    // Glue Data Catalog — Hive metastore client (spark.sql against db.table)
    ["spark.hadoop.aws.glue.endpoint", RUNTIME_ENDPOINT],
    ["spark.hadoop.aws.region", config.region],
  ].flatMap(([k, v]) => ["--conf", `${k}=${v}`]);
}

/**
 * The Glue ETL library's catalog client (used by DynamicFrame.from_catalog /
 * getCatalogSource) gets its endpoint from EndpointConfig, which loads two
 * classpath resources — `glue-default.conf` and `glue-override.conf`. Neither
 * exists in the local image, so it NPEs and falls back to the REAL AWS Glue
 * endpoint. We write both files (pointing at the Mimir backend) into the run/session dir
 * and put that dir on the driver classpath, so from_catalog hits the Mimir backend.
 */
function glueCatalogConfContent(): string {
  const ep = RUNTIME_ENDPOINT;
  return [
    `region = "${config.region}"`,
    `catalog { region = "${config.region}" }`,
    `credentials_provider = "com.amazonaws.auth.DefaultAWSCredentialsProviderChain"`,
    `glue { endpoint = "${ep}" }`,
    `datacatalog { endpoint = "${ep}" }`,
    `jes { endpoint = "${ep}" }`,
    `lakeformation { endpoint = "${ep}" }`,
    "",
  ].join("\n");
}

function writeGlueCatalogConf(dir: string): void {
  const content = glueCatalogConfContent();
  for (const name of ["glue-default.conf", "glue-override.conf"]) {
    const p = join(dir, name);
    writeFileSync(p, content);
    try {
      chmodSync(p, 0o644);
    } catch {
      /* best effort */
    }
  }
}

/**
 * Shell snippet that reads the image's preset driver classpath from
 * spark-defaults.conf into $DEFCP, so we can prepend our conf dir without
 * hard-coding per-image jar paths (glue_user vs hadoop, /home vs /usr/lib).
 */
const READ_DEFCP =
  `DEFCP=$(awk '$1=="spark.driver.extraClassPath"{ $1=""; sub(/^ +/,""); print }' "$SPARK_HOME/conf/spark-defaults.conf"); `;

/** Let the host gateway be reachable as host.docker.internal on Linux too. */
const ADD_HOST = ["--add-host", "host.docker.internal:host-gateway"];

/**
 * Relax temp dir perms so the image's non-root user (glue_user / hadoop) can
 * write Spark scratch (spark-warehouse, metastore_db, derby.log) into the CWD,
 * while keeping the given file world-readable.
 */
function makeWorldReadable(dir: string, file: string) {
  try {
    chmodSync(dir, 0o777);
    chmodSync(file, 0o644);
  } catch {
    /* best effort */
  }
}
const JOB_TIMEOUT_MS = Number(process.env.GLUE_JOB_TIMEOUT_MS ?? 300_000);
const NAME_PREFIX = "mimir-glue-";
/** In-container path the per-run work dir is bind-mounted at (world-writable /tmp). */
const CONTAINER_WORK = "/tmp/mimir-work";

/**
 * Base dir for per-run/session temp dirs. When Mimir runs inside a container
 * (Docker Compose) it talks to the HOST docker daemon via the mounted socket,
 * so the sibling job/kernel containers' `-v` source must be a path that exists
 * on the HOST. Bind-mounting an identical path (e.g. /tmp/mimir-glue) into the
 * server container and pointing GLUE_WORK_DIR at it makes the path valid on
 * both sides with no translation. Locally it just defaults to the OS temp dir.
 */
const WORK_DIR = process.env.GLUE_WORK_DIR ?? tmpdir();
try {
  mkdirSync(WORK_DIR, { recursive: true });
} catch {
  /* best effort */
}

// ---------------------------------------------------------------------------
// Hudi JAR cache
// Real AWS Glue 4.0 injects the Hudi bundle from its control plane; the dev
// Docker image ships without it. We download it once from Maven Central and
// cache it alongside WORK_DIR so subsequent runs reuse it without re-downloading.
// ---------------------------------------------------------------------------
const HUDI_CACHE_DIR = join(WORK_DIR, ".hudi-cache");
const HUDI_JAR_NAME = "hudi-spark3.3-bundle_2.12-0.13.1.jar";
const HUDI_JAR_URL =
  `https://repo1.maven.org/maven2/org/apache/hudi/hudi-spark3.3-bundle_2.12/0.13.1/${HUDI_JAR_NAME}`;
const CONTAINER_HUDI = "/tmp/mimir-hudi";
try { mkdirSync(HUDI_CACHE_DIR, { recursive: true }); } catch { /* best effort */ }

async function ensureHudiJar(log: (s: string) => void): Promise<string | null> {
  const dest = join(HUDI_CACHE_DIR, HUDI_JAR_NAME);
  if (existsSync(dest)) {
    log(`[mimir] using cached Hudi bundle\n`);
    return `${CONTAINER_HUDI}/${HUDI_JAR_NAME}`;
  }
  log(`[mimir] downloading Hudi bundle from Maven Central (~200 MB, cached after first run)…\n`);
  try {
    const resp = await fetch(HUDI_JAR_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const bytes = Buffer.from(await resp.arrayBuffer());
    writeFileSync(dest, bytes);
    log(`[mimir] Hudi bundle cached (${(bytes.length / 1e6).toFixed(0)} MB)\n`);
    return `${CONTAINER_HUDI}/${HUDI_JAR_NAME}`;
  } catch (e) {
    log(`[mimir] WARNING: could not download Hudi bundle: ${(e as Error).message}\n`);
    return null;
  }
}

export type JobType = "pythonshell" | "glueetl";

export interface JobParameter {
  key: string;
  value: string;
}

/** AWS-Glue-style job configuration ("Job details" tab). */
export interface JobConfig {
  glueVersion: string;
  language: string; // "python"
  workerType: string; // G.1X | G.2X | G.4X | Standard (cosmetic; informs cores)
  numberOfWorkers: number; // mapped to local[N] for Spark
  maxConcurrentRuns: number;
  timeoutMinutes: number; // enforced
  jobBookmark: string; // job-bookmark-enable | -disable | -pause (cosmetic)
  tempDir: string; // --TempDir
  extraPyFiles: string; // comma-separated s3:// / http(s) URIs  -> --extra-py-files / --py-files
  extraJars: string; // comma-separated  -> --extra-jars / --jars (Spark)
  extraFiles: string; // comma-separated  -> --extra-files / --files
  additionalPythonModules: string; // comma-separated pip packages -> pip install
  parameters: JobParameter[]; // default arguments (job parameters)
  sparkUiEnabled: boolean; // expose Spark UI on port 4040 during runs (uses extra memory)
}

export function defaultJobConfig(type: JobType): JobConfig {
  return {
    glueVersion: "4.0",
    language: "python",
    workerType: type === "glueetl" ? "G.1X" : "Standard",
    numberOfWorkers: 2,
    maxConcurrentRuns: 1,
    timeoutMinutes: 5,
    jobBookmark: "job-bookmark-disable",
    tempDir: "",
    extraPyFiles: "",
    extraJars: "",
    extraFiles: "",
    additionalPythonModules: "",
    parameters: [],
    sparkUiEnabled: false,
  };
}

export interface GlueJob {
  name: string;
  type: JobType;
  description?: string;
  role: string;
  glueVersion: string;
  script: string;
  scriptLocation?: string; // S3 URI (mirrors AWS Glue ScriptLocation); fetched at run time
  config: JobConfig;
  createdOn: string;
  lastModifiedOn: string;
}
export type RunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMEOUT" | "STOPPED";
export interface JobRun {
  id: string;
  jobName: string;
  status: RunStatus;
  startedOn: string;
  completedOn?: string;
  executionTimeMs?: number;
  logs: string;
  errorMessage?: string;
  sparkUiUrl?: string;
}

export interface SessionMeta {
  id: string;
  kind: "python" | "spark";
  status: "PROVISIONING" | "READY" | "FAILED" | "STOPPED";
  createdOn: string;
}
export interface Statement {
  id: number;
  code: string;
  output: string;
  ok: boolean;
  ranAt: string;
}

interface LiveSession extends SessionMeta {
  child?: ReturnType<typeof spawn>;
  dir: string; // persistent work dir (kernel.py + catalog conf) reused across respawns
  buffer: string;
  pending: Map<number, (r: { ok: boolean; output: string }) => void>;
  statements: Statement[];
  seq: number;
  lastUsed: number; // epoch ms of last statement — drives idle shutdown
}

/**
 * Idle notebooks tie up a container (and a JVM, for Spark). After this much
 * inactivity the kernel container is torn down; the next statement transparently
 * respawns it. Default 120 min, overridable.
 */
const SESSION_IDLE_MS = Number(process.env.GLUE_SESSION_IDLE_MS ?? 120 * 60_000);

const __dirname = dirname(fileURLToPath(import.meta.url));

// When running in the container, MIMIR_STORAGE_PERSISTENT_PATH points to the
// mounted data volume (/app/data) — one mount covers all persistent state.
// Locally (npm run dev) it falls back to the project root.
const DATA_DIR =
  process.env.MIMIR_STORAGE_PERSISTENT_PATH ?? join(__dirname, "..", "..");
const STATE_FILE = join(DATA_DIR, "glue-state.json");

const jobs = new Map<string, GlueJob>();
const runs = new Map<string, JobRun>(); // runId -> run
const sessions = new Map<string, LiveSession>();

// ---------- persistence (jobs + runs survive restarts; sessions don't) ----------
function persist() {
  try {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ jobs: [...jobs.values()], runs: [...runs.values()] }, null, 2),
    );
  } catch {
    /* best effort */
  }
}
function load() {
  if (!existsSync(STATE_FILE)) return;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    for (const j of data.jobs ?? []) {
      if (!j.config) j.config = { ...defaultJobConfig(j.type), glueVersion: j.glueVersion ?? "4.0" };
      jobs.set(j.name, j);
    }
    for (const r of data.runs ?? []) {
      // Any run still marked RUNNING after a restart is orphaned.
      if (r.status === "RUNNING") r.status = "STOPPED";
      runs.set(r.id, r);
    }
  } catch {
    /* ignore */
  }
}
load();

// Remove orphaned kernel containers from a previous process on startup.
execFile("docker", ["ps", "-aq", "--filter", `name=${NAME_PREFIX}`], (err, out) => {
  if (err || !out.trim()) return;
  execFile("docker", ["rm", "-f", ...out.trim().split("\n")], () => {});
});

// ---------- jobs ----------
export function listJobs(): GlueJob[] {
  return [...jobs.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function getJob(name: string): GlueJob | undefined {
  return jobs.get(name);
}
export function upsertJob(input: {
  name: string;
  type: JobType;
  script: string;
  scriptLocation?: string;
  description?: string;
  role?: string;
  config?: Partial<JobConfig>;
}): GlueJob {
  const now = new Date().toISOString();
  const existing = jobs.get(input.name);
  const base = existing?.config ?? defaultJobConfig(input.type);
  const config: JobConfig = { ...base, ...input.config };
  const job: GlueJob = {
    name: input.name,
    type: input.type,
    script: input.script,
    scriptLocation: input.scriptLocation,
    description: input.description,
    role: input.role ?? "arn:aws:iam::000000000000:role/GlueServiceRole",
    glueVersion: config.glueVersion,
    config,
    createdOn: existing?.createdOn ?? now,
    lastModifiedOn: now,
  };
  jobs.set(job.name, job);
  persist();
  return job;
}
export function deleteJob(name: string): void {
  jobs.delete(name);
  for (const [id, r] of runs) if (r.jobName === name) runs.delete(id);
  persist();
}

export function listRuns(jobName: string): JobRun[] {
  return [...runs.values()]
    .filter((r) => r.jobName === jobName)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn));
}
export function getRun(id: string): JobRun | undefined {
  return runs.get(id);
}

function splitList(s: string): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Resolve s3:// and http(s):// artifacts into the run's work dir, returning the
 * in-container (CONTAINER_WORK/...) paths. Local bare filenames are passed
 * through as-is. s3:// is fetched from the Mimir backend's S3 — so "extra py files / jars"
 * work like AWS.
 */
async function resolveArtifacts(uris: string[], dir: string, log: (s: string) => void): Promise<string[]> {
  const out: string[] = [];
  let s3: S3Client | undefined;
  for (const uri of uris) {
    try {
      if (uri.startsWith("s3://")) {
        const [, , bucket, ...rest] = uri.split("/");
        const key = rest.join("/");
        const name = basename(key);
        s3 ??= makeClient(S3Client, { forcePathStyle: true });
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await res.Body!.transformToByteArray();
        const dest = join(dir, name);
        writeFileSync(dest, Buffer.from(bytes));
        makeWorldReadable(dir, dest);
        out.push(`${CONTAINER_WORK}/${name}`);
        log(`[mimir] fetched ${uri} -> ${CONTAINER_WORK}/${name} (${bytes.length} bytes)\n`);
      } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
        const name = basename(new URL(uri).pathname) || `artifact-${out.length}`;
        const buf = Buffer.from(await (await fetch(uri)).arrayBuffer());
        const dest = join(dir, name);
        writeFileSync(dest, buf);
        makeWorldReadable(dir, dest);
        out.push(`${CONTAINER_WORK}/${name}`);
        log(`[mimir] downloaded ${uri} -> ${CONTAINER_WORK}/${name} (${buf.length} bytes)\n`);
      } else {
        out.push(uri); // pass through (already a container path / module name)
      }
    } catch (e) {
      log(`[mimir] WARNING: could not resolve ${uri}: ${(e as Error).message}\n`);
    }
  }
  return out;
}

export function startJobRun(jobName: string): JobRun {
  const job = jobs.get(jobName);
  if (!job) throw Object.assign(new Error("Job not found"), { name: "EntityNotFoundException" });

  const run: JobRun = {
    id: `jr_${randomUUID().replace(/-/g, "")}`,
    jobName,
    status: "RUNNING",
    startedOn: new Date().toISOString(),
    logs: "",
  };
  runs.set(run.id, run);
  persist();
  void executeRun(run, job);
  return run;
}

async function executeRun(run: JobRun, job: GlueJob): Promise<void> {
  const cfg = job.config;
  const isSpark = job.type === "glueetl";
  const started = Date.now();
  const log = (s: string) => {
    run.logs += s;
  };
  const timeoutMs = Math.max(1, cfg.timeoutMinutes || 5) * 60_000;

  const dir = mkdtempSync(join(WORK_DIR, "mimir-glue-"));
  const scriptPath = join(dir, "script.py");

  // If a scriptLocation is set, fetch the script from S3; fall back to inline script.
  if (job.scriptLocation?.startsWith("s3://")) {
    try {
      const [, , bucket, ...rest] = job.scriptLocation.split("/");
      const key = rest.join("/");
      const s3c = makeClient(S3Client, { forcePathStyle: true });
      const res = await s3c.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      writeFileSync(scriptPath, Buffer.from(bytes));
      log(`[mimir] loaded script from ${job.scriptLocation} (${bytes.length} bytes)\n`);
    } catch (e) {
      log(`[mimir] WARNING: could not fetch ${job.scriptLocation}: ${(e as Error).message} — using inline script\n`);
      writeFileSync(scriptPath, job.script);
    }
  } else {
    writeFileSync(scriptPath, job.script);
  }
  makeWorldReadable(dir, scriptPath);

  try {
    // Resolve libraries from the Mimir backend S3 / URLs into the work dir.
    const pyFiles = await resolveArtifacts(splitList(cfg.extraPyFiles), dir, log);
    const files = await resolveArtifacts(splitList(cfg.extraFiles), dir, log);
    const jars = isSpark ? await resolveArtifacts(splitList(cfg.extraJars), dir, log) : [];
    const pipMods = splitList(cfg.additionalPythonModules);

    // Default arguments (job parameters) -> --key value, plus AWS-style --JOB_NAME.
    const jobArgs: string[] = ["--JOB_NAME", job.name];
    if (cfg.tempDir) jobArgs.push("--TempDir", cfg.tempDir);
    for (const p of cfg.parameters) {
      if (!p.key) continue;
      jobArgs.push(p.key.startsWith("--") ? p.key : `--${p.key}`, p.value ?? "");
    }

    const image = glueImage(cfg.glueVersion);
    const cores = Math.max(1, cfg.numberOfWorkers || 1);
    const script = `${CONTAINER_WORK}/script.py`;

    // Detect --datalake-formats hudi early — needed both in submit args and docker args.
    const datalakeFormats = (
      cfg.parameters.find((p) => p.key === "--datalake-formats" || p.key === "datalake-formats")?.value ?? ""
    ).split(",").map((s) => s.trim());
    const hasHudi = isSpark && datalakeFormats.includes("hudi");

    // Ensure the Hudi JAR is cached locally before building the docker args.
    // The JAR is ~200 MB and downloaded once from Maven Central; subsequent runs skip the download.
    let hudiJarContainerPath: string | null = null;
    if (hasHudi) {
      hudiJarContainerPath = await ensureHudiJar(log);
    }

    let inner: string;

    if (isSpark) {
      // Endpoint config for the Glue catalog client (from_catalog) lives in the
      // work dir, which we put on the driver classpath below.
      writeGlueCatalogConf(dir);
      // $SPARK_HOME differs per image (/home/glue_user/spark, /usr/lib/spark…),
      // so reference it from the shell rather than hard-coding a path.
      const submit = ["--master", `local[${cores}]`, ...s3aConf()];
      if (hasHudi) submit.push(...hudiSparkConf());
      if (cfg.sparkUiEnabled) {
        submit.push(
          "--conf", "spark.ui.enabled=true",
          "--conf", "spark.ui.port=4040",
        );
        run.sparkUiUrl = "http://localhost:4040";
      } else {
        submit.push("--conf", "spark.ui.enabled=false");
      }
      if (pyFiles.length) submit.push("--py-files", pyFiles.join(","));
      // Merge user-supplied jars with the Hudi bundle (if downloaded).
      const allJars = [...(hudiJarContainerPath ? [hudiJarContainerPath] : []), ...jars];
      if (allJars.length) submit.push("--jars", allJars.join(","));
      if (files.length) submit.push("--files", files.join(","));
      submit.push(script, ...jobArgs);
      // Prepend the work dir (holding glue-*.conf) to the preset classpath.
      const cp = `--conf spark.driver.extraClassPath="${CONTAINER_WORK}:$DEFCP" --conf spark.executor.extraClassPath="${CONTAINER_WORK}:$DEFCP"`;
      const pip = pipMods.length ? `pip install --user --quiet ${pipMods.join(" ")} && ` : "";
      inner = `${pip}${READ_DEFCP}"$SPARK_HOME"/bin/spark-submit ${cp} ${shellJoin(submit)}`;
    } else {
      // Python shell: awsglue + boto3/pandas/numpy already ship on the image's
      // PYTHONPATH; prepend the work dir so extra-py-files resolve too.
      const ppath = pyFiles.length ? `PYTHONPATH="${CONTAINER_WORK}:$PYTHONPATH" ` : "";
      // The Glue image ships python2 as `python`; awsglue/boto3 live in python3.
      const pip = pipMods.length ? `pip3 install --user --quiet ${pipMods.join(" ")} && ` : "";
      inner = `${pip}${ppath}python3 ${script} ${shellJoin(jobArgs)}`;
    }

    const args = [
      "run",
      "--rm",
      "--name",
      `${NAME_PREFIX}run-${run.id}`,
      ...ADD_HOST,
      ...awsEnvArgs(),
      ...(isSpark && cfg.sparkUiEnabled ? ["-p", "4040:4040"] : []),
      // Bind-mount the Hudi JAR cache so the Glue container can access it.
      ...(hudiJarContainerPath ? ["-v", `${HUDI_CACHE_DIR}:${CONTAINER_HUDI}:ro`] : []),
      "-v",
      `${dir}:${CONTAINER_WORK}`,
      "-w",
      CONTAINER_WORK,
      // The Glue images set ENTRYPOINT ["bash","-l"]; override it so our command
      // runs directly instead of being passed as args to the login shell.
      "--entrypoint",
      "bash",
      image,
      "-lc",
      inner,
    ];

    const child = spawn("docker", args);
    const cwLogger = new GlueJobLogger(run.jobName, run.id, job.type);
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      run.logs += text;
      cwLogger.appendOutput(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      run.logs += text;
      cwLogger.appendError(text);
    });

    const timer = setTimeout(() => {
      run.status = "TIMEOUT";
      run.errorMessage = `Exceeded ${timeoutMs / 60000} min timeout`;
      child.kill("SIGKILL");
      execFile("docker", ["rm", "-f", `${NAME_PREFIX}run-${run.id}`], () => {});
      cwLogger.close().catch(() => {});
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (run.status === "RUNNING") {
        run.status = code === 0 ? "SUCCEEDED" : "FAILED";
        if (code !== 0) run.errorMessage = `Exited with code ${code}`;
      }
      run.completedOn = new Date().toISOString();
      run.executionTimeMs = Date.now() - started;
      rmSync(dir, { recursive: true, force: true });
      persist();
      cwLogger.close().catch(() => {});
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      run.status = "FAILED";
      run.errorMessage = e.message;
      run.completedOn = new Date().toISOString();
      run.executionTimeMs = Date.now() - started;
      rmSync(dir, { recursive: true, force: true });
      persist();
    });
  } catch (e) {
    run.status = "FAILED";
    run.errorMessage = (e as Error).message;
    run.completedOn = new Date().toISOString();
    run.executionTimeMs = Date.now() - started;
    rmSync(dir, { recursive: true, force: true });
    persist();
  }
}

/** Minimal POSIX shell quoting for building the `bash -lc` command. */
function shellJoin(parts: string[]): string {
  return parts.map((p) => (/^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, "'\\''")}'`)).join(" ");
}

// ---------- sessions / notebooks ----------
const KERNEL = `
import sys, json, io, contextlib, traceback
g = {"__name__": "__mimir__"}
def emit(o):
    sys.stdout.write(json.dumps(o) + "\\n"); sys.stdout.flush()
emit({"ready": True})
while True:
    line = sys.stdin.readline()
    if not line: break
    line = line.strip()
    if not line: continue
    try: msg = json.loads(line)
    except Exception: continue
    buf = io.StringIO(); ok = True
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec(compile(msg.get("code", ""), "<cell>", "exec"), g)
    except SystemExit: pass
    except Exception:
        ok = False; buf.write(traceback.format_exc())
    emit({"id": msg.get("id"), "ok": ok, "output": buf.getvalue()})
`.trim();

export function listSessions(): SessionMeta[] {
  return [...sessions.values()]
    .map(({ id, kind, status, createdOn }) => ({ id, kind, status, createdOn }))
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}
export function getSession(id: string): SessionMeta | undefined {
  const s = sessions.get(id);
  return s ? { id: s.id, kind: s.kind, status: s.status, createdOn: s.createdOn } : undefined;
}
export function listStatements(id: string): Statement[] {
  return sessions.get(id)?.statements ?? [];
}

/** (Re)launch the kernel container for a session and wire up its IO handlers. */
function spawnKernel(session: LiveSession): void {
  const { id, dir, kind } = session;
  const isSpark = kind === "spark";
  // Both kernels use the Glue runtime image so `awsglue` (utils, and for Spark
  // GlueContext/DynamicFrame/transforms) plus boto3/pandas are importable. The
  // image already has pyspark + py4j + awsglue on PYTHONPATH.
  const image = process.env.GLUE_SESSION_IMAGE ?? glueImage(DEFAULT_GLUE_VERSION);
  // Spark: pin a local master, point s3a + catalog at the Mimir backend, and put the kernel
  // dir (with glue-*.conf) on the driver classpath so GlueContext(sc) and
  // from_catalog hit the Mimir backend. /k holds kernel.py and the catalog conf.
  let innerCmd: string;
  if (isSpark) {
    const sparkArgs = ["--master", "local[*]", "--conf", "spark.driver.extraClassPath=/k:$DEFCP", ...s3aConf(), "pyspark-shell"].join(" ");
    // Double-quote so $DEFCP expands; the conf values have no quotes/spaces.
    innerCmd = `${READ_DEFCP}export PYSPARK_SUBMIT_ARGS="${sparkArgs}"; exec python3 -u /k/kernel.py`;
  } else {
    innerCmd = "exec python3 -u /k/kernel.py";
  }
  const child = spawn("docker", [
    "run",
    "-i",
    "--rm",
    "--name",
    `${NAME_PREFIX}${id}`,
    ...ADD_HOST,
    ...awsEnvArgs(),
    "-v",
    `${dir}:/k`,
    "-w",
    "/k",
    // Override the Glue image's ENTRYPOINT ["bash","-l"] so our kernel launches.
    "--entrypoint",
    "bash",
    image,
    "-lc",
    innerCmd,
  ]);

  session.child = child;
  session.status = "PROVISIONING";
  session.buffer = "";

  child.stdout.on("data", (chunk: Buffer) => {
    session.buffer += chunk.toString();
    let nl: number;
    while ((nl = session.buffer.indexOf("\n")) >= 0) {
      const line = session.buffer.slice(0, nl).trim();
      session.buffer = session.buffer.slice(nl + 1);
      if (!line) continue;
      let msg: { ready?: boolean; id?: number; ok?: boolean; output?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.ready) {
        session.status = "READY";
      } else if (typeof msg.id === "number") {
        session.pending.get(msg.id)?.({ ok: !!msg.ok, output: msg.output ?? "" });
        session.pending.delete(msg.id);
      }
    }
  });
  child.stderr.on("data", () => {}); // image-pull / spark noise ignored
  child.on("close", () => {
    // Only an unexpected exit is a failure; idle/delete teardown sets STOPPED first.
    if (session.child === child && session.status !== "STOPPED") session.status = "FAILED";
  });
  child.on("error", () => {
    if (session.child === child) session.status = "FAILED";
  });
}

/** Tear down a session's kernel container but keep its metadata + work dir so
 *  it can be transparently respawned (idle shutdown). */
function stopKernel(session: LiveSession): void {
  session.status = "STOPPED";
  const child = session.child;
  session.child = undefined;
  try {
    child?.stdin?.end();
    child?.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  execFile("docker", ["rm", "-f", `${NAME_PREFIX}${session.id}`], () => {});
  // Fail any in-flight statements so callers don't hang.
  for (const cb of session.pending.values()) cb({ ok: false, output: "[session stopped]" });
  session.pending.clear();
}

export function createSession(kind: "python" | "spark"): SessionMeta {
  const id = `${randomUUID().slice(0, 8)}`;
  const dir = mkdtempSync(join(WORK_DIR, "mimir-glue-sess-"));
  const kernelPath = join(dir, "kernel.py");
  writeFileSync(kernelPath, KERNEL);
  makeWorldReadable(dir, kernelPath);
  // Spark catalog conf is written once and reused across respawns.
  if (kind === "spark") writeGlueCatalogConf(dir);

  const session: LiveSession = {
    id,
    kind,
    status: "PROVISIONING",
    createdOn: new Date().toISOString(),
    child: undefined,
    dir,
    buffer: "",
    pending: new Map(),
    statements: [],
    seq: 0,
    lastUsed: Date.now(),
  };
  sessions.set(id, session);
  spawnKernel(session);

  return { id, kind, status: session.status, createdOn: session.createdOn };
}

export async function runStatement(id: string, code: string): Promise<Statement> {
  const session = sessions.get(id);
  if (!session) throw Object.assign(new Error("Session not found"), { name: "EntityNotFoundException" });
  session.lastUsed = Date.now();

  // Wake an idle (STOPPED) or crashed (FAILED) kernel transparently.
  if (!session.child || session.status === "STOPPED" || session.status === "FAILED") {
    spawnKernel(session);
  }

  // Wait (briefly) for the kernel to finish provisioning / image pull.
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (session.status === "PROVISIONING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (session.status !== "READY" || !session.child)
    throw Object.assign(new Error("Session is not running"), { name: "IllegalSessionStateException" });

  const sid = ++session.seq;
  const result = await new Promise<{ ok: boolean; output: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(sid);
      reject(Object.assign(new Error("Statement timed out"), { name: "Timeout" }));
    }, JOB_TIMEOUT_MS);
    session.pending.set(sid, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    session.child!.stdin!.write(JSON.stringify({ id: sid, code }) + "\n");
  });

  const stmt: Statement = {
    id: sid,
    code,
    output: result.output,
    ok: result.ok,
    ranAt: new Date().toISOString(),
  };
  session.statements.push(stmt);
  publishSessionLog(id, result.output, Date.now()).catch(() => {});
  return stmt;
}

export function deleteSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  stopKernel(session);
  rmSync(session.dir, { recursive: true, force: true });
  sessions.delete(id);
}

// Idle sweep: tear down kernels untouched for SESSION_IDLE_MS. The next
// statement respawns them (see runStatement). unref so it never blocks exit.
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    if (s.child && now - s.lastUsed > SESSION_IDLE_MS) stopKernel(s);
  }
}, 60_000).unref();

export const engineInfo = {
  images: GLUE_IMAGES,
  defaultImage: glueImage(DEFAULT_GLUE_VERSION),
  runtimeEndpoint: RUNTIME_ENDPOINT,
};
