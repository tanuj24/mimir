import { spawn, execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { makeClient } from "../aws/clientFactory.js";

/**
 * Local AWS-Glue-style execution engine.
 *
 * Floci does NOT implement Glue jobs or interactive sessions, so FlociUI runs
 * them locally in Docker containers:
 *   - Python shell jobs  -> python image, `python script.py`
 *   - Spark (glueetl)    -> spark image, `spark-submit script.py`
 *   - Notebooks/sessions -> a long-lived kernel container with stateful exec
 *
 * Catalog (databases/tables) is handled separately against Floci's real API.
 */

const PYTHON_IMAGE = process.env.GLUE_PYTHON_IMAGE ?? "python:3.11-slim";
const SPARK_IMAGE = process.env.GLUE_SPARK_IMAGE ?? "spark:python3";

/** Make a temp dir + its files readable by non-root container users (e.g. spark). */
function makeWorldReadable(dir: string, file: string) {
  try {
    chmodSync(dir, 0o755);
    chmodSync(file, 0o644);
  } catch {
    /* best effort */
  }
}
const JOB_TIMEOUT_MS = Number(process.env.GLUE_JOB_TIMEOUT_MS ?? 300_000);
const NAME_PREFIX = "mimir-glue-";

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
  };
}

export interface GlueJob {
  name: string;
  type: JobType;
  description?: string;
  role: string;
  glueVersion: string;
  script: string;
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
  buffer: string;
  pending: Map<number, (r: { ok: boolean; output: string }) => void>;
  statements: Statement[];
  seq: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", "..", ".glue-state.json");

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
 * in-container (/work/...) paths. Local bare filenames are passed through as-is.
 * s3:// is fetched from Floci's S3 — so "extra py files / jars" work like AWS.
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
        out.push(`/work/${name}`);
        log(`[flociui] fetched ${uri} -> /work/${name} (${bytes.length} bytes)\n`);
      } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
        const name = basename(new URL(uri).pathname) || `artifact-${out.length}`;
        const buf = Buffer.from(await (await fetch(uri)).arrayBuffer());
        const dest = join(dir, name);
        writeFileSync(dest, buf);
        makeWorldReadable(dir, dest);
        out.push(`/work/${name}`);
        log(`[flociui] downloaded ${uri} -> /work/${name} (${buf.length} bytes)\n`);
      } else {
        out.push(uri); // pass through (already a container path / module name)
      }
    } catch (e) {
      log(`[flociui] WARNING: could not resolve ${uri}: ${(e as Error).message}\n`);
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
  writeFileSync(scriptPath, job.script);
  makeWorldReadable(dir, scriptPath);

  try {
    // Resolve libraries from Floci S3 / URLs into the work dir.
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

    const image = isSpark ? SPARK_IMAGE : PYTHON_IMAGE;
    const cores = Math.max(1, cfg.numberOfWorkers || 1);
    let inner: string;

    if (isSpark) {
      const submit = ["/opt/spark/bin/spark-submit", "--master", `local[${cores}]`];
      if (pyFiles.length) submit.push("--py-files", pyFiles.join(","));
      if (jars.length) submit.push("--jars", jars.join(","));
      if (files.length) submit.push("--files", files.join(","));
      submit.push("/work/script.py", ...jobArgs);
      const pip = pipMods.length ? `pip install --user --quiet ${pipMods.join(" ")} && ` : "";
      inner = `${pip}${shellJoin(submit)}`;
    } else {
      // Python shell: extra py files all land in /work, so add it to PYTHONPATH.
      const ppath = pyFiles.length ? `PYTHONPATH="/work:$PYTHONPATH" ` : "";
      const pip = pipMods.length ? `pip install --quiet ${pipMods.join(" ")} && ` : "";
      inner = `${pip}${ppath}python /work/script.py ${shellJoin(jobArgs)}`;
    }

    const args = [
      "run",
      "--rm",
      "--name",
      `${NAME_PREFIX}run-${run.id}`,
      "-v",
      `${dir}:/work`,
      "-w",
      isSpark ? "/tmp" : "/work",
      image,
      "bash",
      "-lc",
      inner,
    ];

    const child = spawn("docker", args);
    const append = (chunk: Buffer) => {
      run.logs += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      run.status = "TIMEOUT";
      run.errorMessage = `Exceeded ${timeoutMs / 60000} min timeout`;
      child.kill("SIGKILL");
      execFile("docker", ["rm", "-f", `${NAME_PREFIX}run-${run.id}`], () => {});
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
g = {"__name__": "__floci__"}
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

export function createSession(kind: "python" | "spark"): SessionMeta {
  const id = `${randomUUID().slice(0, 8)}`;
  const dir = mkdtempSync(join(WORK_DIR, "mimir-glue-sess-"));
  const kernelPath = join(dir, "kernel.py");
  writeFileSync(kernelPath, KERNEL);
  makeWorldReadable(dir, kernelPath);

  const isSpark = kind === "spark";
  const image = isSpark ? SPARK_IMAGE : PYTHON_IMAGE;
  // Spark: put pyspark + py4j on PYTHONPATH and pin a local master so a plain
  // python3 kernel can create a SparkSession; run from /tmp (writable).
  const launch = isSpark
    ? [
        "bash",
        "-lc",
        'export PYTHONPATH="$SPARK_HOME/python:$(ls $SPARK_HOME/python/lib/py4j-*-src.zip)"; ' +
          "export PYSPARK_SUBMIT_ARGS='--master local[*] pyspark-shell'; " +
          "exec python3 -u /k/kernel.py",
      ]
    : ["python", "-u", "/k/kernel.py"];
  const child = spawn("docker", [
    "run",
    "-i",
    "--rm",
    "--name",
    `${NAME_PREFIX}${id}`,
    "-v",
    `${dir}:/k`,
    "-w",
    isSpark ? "/tmp" : "/k",
    image,
    ...launch,
  ]);

  const session: LiveSession = {
    id,
    kind,
    status: "PROVISIONING",
    createdOn: new Date().toISOString(),
    child,
    buffer: "",
    pending: new Map(),
    statements: [],
    seq: 0,
  };
  sessions.set(id, session);

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
    if (session.status !== "STOPPED") session.status = "FAILED";
    rmSync(dir, { recursive: true, force: true });
  });
  child.on("error", () => {
    session.status = "FAILED";
  });

  return { id, kind, status: session.status, createdOn: session.createdOn };
}

export async function runStatement(id: string, code: string): Promise<Statement> {
  const session = sessions.get(id);
  if (!session) throw Object.assign(new Error("Session not found"), { name: "EntityNotFoundException" });
  if (!session.child || session.status === "FAILED" || session.status === "STOPPED")
    throw Object.assign(new Error("Session is not running"), { name: "IllegalSessionStateException" });

  // Wait (briefly) for the kernel to finish provisioning / image pull.
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (session.status === "PROVISIONING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

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
  return stmt;
}

export function deleteSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.status = "STOPPED";
  session.child?.stdin?.end();
  session.child?.kill("SIGKILL");
  execFile("docker", ["rm", "-f", `${NAME_PREFIX}${id}`], () => {});
  sessions.delete(id);
}

export const engineInfo = { PYTHON_IMAGE, SPARK_IMAGE };
