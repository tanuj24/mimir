"""
mimir-demo-full-featured — Glue Spark job demonstrating every job config option.

Features exercised
------------------
scriptLocation          : s3://mimir-sample-data/scripts/mimir-demo-full-featured.py
extraPyFiles (.whl)     : tabulate-0.9.0-py3-none-any.whl  (pip-installed from S3)
extraPyFiles (.py)      : glue_utils.py                     (custom module, --py-files)
extraJars               : commons-csv-1.10.0.jar            (downloaded from Maven Central)
extraFiles              : job_config.json                   (config file staged into CWD)
additionalPythonModules : faker==22.2.0                     (pip-installed at runtime)
parameters              : --input_path, --output_path, --batch_size,
                          --environment, --enable_metrics

Each block prints a line tagged with the feature it proves, so the run log
doubles as a checklist that every Glue job option resolved correctly.
"""
import sys
import json
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

# ── resolve parameters ────────────────────────────────────────────────────────
args = getResolvedOptions(sys.argv, [
    "JOB_NAME",
    "input_path",
    "output_path",
    "batch_size",
    "environment",
    "enable_metrics",
])

sc          = SparkContext()
glueContext = GlueContext(sc)
spark       = glueContext.spark_session
job         = Job(glueContext)
job.init(args["JOB_NAME"], args)

SEP = "=" * 60
print(SEP)
print("  Mimir — Full-Featured Glue Job Demo")
print(SEP)
print(f"  JOB_NAME       : {args['JOB_NAME']}")
print(f"  environment    : {args['environment']}")
print(f"  input_path     : {args['input_path']}")
print(f"  output_path    : {args['output_path']}")
print(f"  batch_size     : {args['batch_size']}")
print(f"  enable_metrics : {args['enable_metrics']}")
print()

# ── [extra-file] job_config.json ─────────────────────────────────────────────
# Staged into the working directory by spark-submit --files (extraFiles).
try:
    with open("job_config.json") as fh:
        cfg = json.load(fh)
    print(f"[extra-file]   job_config.json loaded — version={cfg.get('version')}, "
          f"max_rows={cfg.get('max_rows')}, tags={cfg.get('tags')}")
except Exception as exc:
    print(f"[extra-file]   WARNING: could not read job_config.json: {exc}")
    cfg = {}

# ── [extra-py-file] glue_utils.py ────────────────────────────────────────────
# Fetched from S3 and added to --py-files (extraPyFiles); a normal import.
try:
    from glue_utils import summarise_dataframe, clean_string_columns
    print("[extra-py-file] glue_utils.py imported — summarise_dataframe & clean_string_columns available")
except ImportError as exc:
    print(f"[extra-py-file] WARNING: could not import glue_utils: {exc}")
    def summarise_dataframe(df, label="df"):
        print(f"  {label}: {df.count()} rows")
    def clean_string_columns(df):
        return df

# ── [whl] tabulate — installed from a .whl listed in extraPyFiles ────────────
try:
    from tabulate import tabulate as fmt_table
    from tabulate import __version__ as tabulate_ver
    print(f"[whl]          tabulate=={tabulate_ver} imported (installed from S3 .whl via extraPyFiles)")
    _tabulate_ok = True
except ImportError as exc:
    print(f"[whl]          WARNING: tabulate not available: {exc}")
    _tabulate_ok = False

# ── [pip-module] faker — installed via additionalPythonModules ────────────────
try:
    from faker import Faker
    fake = Faker()
    sample_name = fake.name()
    print(f"[pip-module]   faker imported — sample generated name: {sample_name!r}")
except ImportError as exc:
    print(f"[pip-module]   WARNING: faker not available: {exc}")

# ── [extra-jar] commons-csv — verify it reached the JVM classpath ─────────────
try:
    jvm = spark.sparkContext._jvm
    fmt = jvm.org.apache.commons.csv.CSVFormat.DEFAULT
    print(f"[extra-jar]    commons-csv JAR on classpath — CSVFormat.DEFAULT = {fmt}")
except Exception as exc:
    print(f"[extra-jar]    WARNING: commons-csv not accessible: {exc}")

# ── data processing ───────────────────────────────────────────────────────────
def to_s3a(path: str) -> str:
    """Glue reads/writes S3 through the s3a:// connector; normalise s3:// → s3a://."""
    return path.replace("s3://", "s3a://", 1) if path.startswith("s3://") else path

print()
output_s3a = to_s3a(args["output_path"])

# A small in-memory dataset that mirrors the seeded orders CSV.
#
# NOTE on reading from S3: a Glue job container reaches the Mimir backend's S3
# at the host gateway's published :4566. The all-in-one image does not publish
# 4566 by default, so boto3/s3a reads time out there. To read real S3 data from
# a Glue job, run with `-p 4566:4566` (or use docker-compose), then replace the
# block below with:
#     df = spark.read.option("header", "true").csv(to_s3a(args["input_path"]))
print(f"[data] building sample orders DataFrame (mirrors {args['input_path']})")
sample_orders = [
    ("o1", "u1", "Widget Pro",    "29.99", "shipped",   "2024-04-01"),
    ("o2", "u2", "DataSync API",  "49.99", "pending",   "2024-04-02"),
    ("o3", "u3", "CloudAdapter",  "99.00", "delivered", "2024-04-03"),
    ("o4", "u1", "DataSync API",  "49.99", "shipped",   "2024-04-04"),
    ("o5", "u2", "Widget Pro",    "29.99", "cancelled", "2024-04-05"),
    ("o6", "u3", "ServerMon",     "19.99", "shipped",   "2024-04-06"),
    ("o7", "u1", "CloudAdapter",  "99.00", "pending",   "2024-04-07"),
    ("o8", "u2", "ServerMon",     "19.99", "delivered", "2024-04-08"),
]
schema = ["order_id", "user_id", "product", "amount", "status", "created_at"]
df = spark.createDataFrame(sample_orders, schema=schema)
df = clean_string_columns(df)          # from glue_utils.py
summarise_dataframe(df, "orders (sample)")   # from glue_utils.py

# Group by status
status_counts = (
    df.groupBy("status")
      .count()
      .orderBy("count", ascending=False)
)
print("\n[data] Orders by status:")
status_counts.show()

# Pretty-print with tabulate (the .whl we installed above)
if _tabulate_ok:
    rows = [(r["status"], r["count"]) for r in status_counts.collect()]
    print(fmt_table(rows, headers=["Status", "Count"], tablefmt="rounded_grid"))

# Write output. Local path keeps the demo self-contained in the all-in-one image;
# with `-p 4566:4566` published you can write to output_s3a instead.
local_out = "/tmp/mimir-work/output/demo-full"
print(f"\n[data] writing Parquet to {local_out} (use {output_s3a} when port 4566 is published)")
status_counts.write.mode("overwrite").parquet(local_out)
print("[data] write complete")

job.commit()
print()
print(SEP)
print("  Job complete.")
print(SEP)
