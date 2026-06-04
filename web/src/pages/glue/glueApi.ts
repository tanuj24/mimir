import { api } from "@/lib/api";

// ---- Data Catalog (real Floci) ----
export interface GlueDatabase {
  name: string;
  description?: string;
  locationUri?: string;
  createTime?: string;
}
export interface GlueTable {
  name: string;
  owner?: string;
  tableType?: string;
  columns: { name: string; type: string; comment?: string }[];
  location?: string;
  createTime?: string;
}

// ---- Jobs (local engine) ----
export type JobType = "pythonshell" | "glueetl";
export interface JobParameter {
  key: string;
  value: string;
}
export interface JobConfig {
  glueVersion: string;
  language: string;
  workerType: string;
  numberOfWorkers: number;
  maxConcurrentRuns: number;
  timeoutMinutes: number;
  jobBookmark: string;
  tempDir: string;
  extraPyFiles: string;
  extraJars: string;
  extraFiles: string;
  additionalPythonModules: string;
  parameters: JobParameter[];
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

// ---- Sessions / notebooks (local engine) ----
export interface GlueSession {
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

export const glueApi = {
  // catalog
  databases: (): Promise<{ databases: GlueDatabase[] }> => api.get("/glue/databases"),
  createDatabase: (name: string, description?: string) =>
    api.post("/glue/databases", { name, description }),
  deleteDatabase: (name: string) => api.post("/glue/databases/delete", { name }),
  tables: (database: string): Promise<{ tables: GlueTable[] }> =>
    api.get(`/glue/databases/tables?database=${encodeURIComponent(database)}`),

  // jobs
  jobs: (): Promise<{ jobs: GlueJob[]; engine: { PYTHON_IMAGE: string; SPARK_IMAGE: string } }> =>
    api.get("/glue/jobs"),
  job: (name: string): Promise<{ job: GlueJob; runs: JobRun[] }> =>
    api.get(`/glue/jobs/${encodeURIComponent(name)}`),
  saveJob: (body: {
    name: string;
    type: JobType;
    script: string;
    description?: string;
    config?: Partial<JobConfig>;
  }): Promise<{ job: GlueJob }> => api.put("/glue/jobs", body),
  deleteJob: (name: string) => api.post("/glue/jobs/delete", { name }),
  runJob: (name: string): Promise<{ run: JobRun }> =>
    api.post(`/glue/jobs/${encodeURIComponent(name)}/run`),
  runs: (name: string): Promise<{ runs: JobRun[] }> =>
    api.get(`/glue/jobs/${encodeURIComponent(name)}/runs`),
  run: (id: string): Promise<{ run: JobRun }> => api.get(`/glue/runs/${encodeURIComponent(id)}`),

  // sessions
  sessions: (): Promise<{ sessions: GlueSession[] }> => api.get("/glue/sessions"),
  createSession: (kind: "python" | "spark"): Promise<{ session: GlueSession }> =>
    api.post("/glue/sessions", { kind }),
  session: (id: string): Promise<{ session: GlueSession; statements: Statement[] }> =>
    api.get(`/glue/sessions/${encodeURIComponent(id)}`),
  runStatement: (id: string, code: string): Promise<{ statement: Statement }> =>
    api.post(`/glue/sessions/${encodeURIComponent(id)}/statements`, { code }),
  deleteSession: (id: string) => api.post(`/glue/sessions/${encodeURIComponent(id)}/delete`),
};

export const JOB_TEMPLATES: Record<JobType, string> = {
  pythonshell: `# AWS Glue — Python shell job (runs locally in Docker via FlociUI)
import sys
from datetime import datetime

print("Job started at", datetime.utcnow().isoformat())

# Your ETL logic here. The Python standard library is available.
records = [{"id": i, "value": i * i} for i in range(10)]
total = sum(r["value"] for r in records)

print(f"Processed {len(records)} records, total value = {total}")
print("Done.")
`,
  glueetl: `# AWS Glue — Spark (PySpark) job (runs locally via spark-submit in Docker)
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("flociui-glue-job").getOrCreate()

df = spark.createDataFrame(
    [(1, "alpha"), (2, "beta"), (3, "gamma")],
    ["id", "name"],
)
df.show()
print("Row count:", df.count())

spark.stop()
`,
};
