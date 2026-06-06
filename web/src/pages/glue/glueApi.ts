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
  jobs: (): Promise<{
    jobs: GlueJob[];
    engine: { images: Record<string, string>; defaultImage: string; runtimeEndpoint: string };
  }> => api.get("/glue/jobs"),
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
  pythonshell: `# AWS Glue — Python shell job. Runs on the real Glue runtime image, so the
# libraries a Glue python-shell job ships with (boto3, pandas, numpy, awsglue
# utils) are available and this exact code runs unmodified.
import sys
from datetime import datetime
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
print("Job", args["JOB_NAME"], "started at", datetime.utcnow().isoformat())

# Example: talk to local AWS (Floci) via boto3 — endpoint is pre-wired.
import boto3
s3 = boto3.client("s3")
print("Buckets:", [b["Name"] for b in s3.list_buckets().get("Buckets", [])])

print("Done.")
`,
  glueetl: `# AWS Glue — Spark (PySpark/Glue) job. Runs the real awsglue runtime via
# spark-submit, so GlueContext, DynamicFrame and the Glue transforms work and
# this exact AWS Glue script executes locally against Floci's S3/Catalog.
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Build a DynamicFrame from in-memory data and inspect it.
df = spark.createDataFrame([(1, "alpha"), (2, "beta"), (3, "gamma")], ["id", "name"])
from awsglue.dynamicframe import DynamicFrame
dyf = DynamicFrame.fromDF(df, glueContext, "demo")
dyf.printSchema()
dyf.toDF().show()
print("Row count:", dyf.count())

# Read straight from the local Glue Data Catalog (database + table must exist
# under the Catalog tab). Reads the table's S3 data via Floci too:
# src = glueContext.create_dynamic_frame.from_catalog(database="my_db", table_name="my_table")
# src.toDF().show()

# Read/write Floci S3 just like AWS, e.g.:
# dyf.toDF().write.mode("overwrite").parquet("s3a://my-bucket/output/")

job.commit()
`,
};
