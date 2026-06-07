# Run a Glue Spark job with Parquet on S3

This example shows a local AWS Glue workflow in Mimir:

- read Parquet files from local S3
- transform the data with a Spark Glue job
- write Parquet output back to local S3
- create a Glue Data Catalog table that points at the output

It is useful when you want to test Glue ETL logic locally before running it in AWS.

## Start Mimir

Run Mimir and open the console:

```bash
docker run -d --name mimir \
  -p 8080:80 -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/mimir-glue:/tmp/mimir-glue \
  tanujsoni027/mimir-aws:latest
```

- Console: http://localhost:8080
- AWS endpoint: http://localhost:4566

Use local credentials such as `mimir` / `mimir` and region `us-east-1`.

## Prepare sample data

Create a bucket for the example:

```bash
aws --endpoint-url http://localhost:4566 s3 mb s3://mimir-glue-demo
```

Upload your Parquet files under this prefix:

```text
s3://mimir-glue-demo/input/events/
```

For a small test, use any Parquet file with columns like:

| column | type |
|--------|------|
| `service` | string |
| `events` | long |

## Create the Glue job

Open **Glue** in the Mimir console and create a Spark job.

Use this script:

```python
import os
import boto3
from botocore.exceptions import ClientError
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

INPUT = "s3://mimir-glue-demo/input/events/"
OUTPUT = "s3://mimir-glue-demo/output/events_by_service/"
DATABASE = "local_analytics"
TABLE = "events_by_service"
ENDPOINT = os.environ.get("AWS_ENDPOINT_URL_GLUE") or os.environ.get("AWS_ENDPOINT_URL")

sc = SparkContext.getOrCreate()
glue_context = GlueContext(sc)
spark = glue_context.spark_session
job = Job(glue_context)
job.init("local-spark-parquet-demo", {})

print(f"Reading Parquet from {INPUT}")
source = spark.read.parquet(INPUT)
source.printSchema()

result = source.groupBy("service").sum("events").withColumnRenamed("sum(events)", "total_events")
result.show(truncate=False)

print(f"Writing Parquet to {OUTPUT}")
result.coalesce(1).write.mode("overwrite").parquet(OUTPUT)

print("Creating Glue Catalog table")
glue = boto3.client(
    "glue",
    region_name="us-east-1",
    endpoint_url=ENDPOINT,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "mimir"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "mimir"),
)

try:
    glue.create_database(DatabaseInput={"Name": DATABASE})
except ClientError as exc:
    code = exc.response.get("Error", {}).get("Code", "")
    if code not in ("AlreadyExistsException", "EntityAlreadyExistsException"):
        raise

try:
    glue.delete_table(DatabaseName=DATABASE, Name=TABLE)
except Exception:
    pass

glue.create_table(
    DatabaseName=DATABASE,
    TableInput={
        "Name": TABLE,
        "TableType": "EXTERNAL_TABLE",
        "Parameters": {"classification": "parquet", "typeOfData": "file"},
        "StorageDescriptor": {
            "Columns": [
                {"Name": "service", "Type": "string"},
                {"Name": "total_events", "Type": "bigint"},
            ],
            "Location": OUTPUT,
            "InputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
            "OutputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
            "SerdeInfo": {
                "SerializationLibrary": "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
                "Parameters": {"serialization.format": "1"},
            },
        },
    },
)

print(f"Created Glue Catalog table: {DATABASE}.{TABLE}")
job.commit()
```

## Run and inspect

Run the job from the console. The run history shows the live state and captured logs.

After it succeeds:

```bash
aws --endpoint-url http://localhost:4566 s3 ls s3://mimir-glue-demo/output/events_by_service/
```

Then open **Glue > Data Catalog** in the console. You should see:

- database: `local_analytics`
- table: `events_by_service`
- location: `s3://mimir-glue-demo/output/events_by_service/`

## What this validates

This tests the full local loop for Glue Spark development:

- Spark can read Parquet from local S3.
- Spark can write Parquet back to local S3.
- Python code in the job can call the local Glue API.
- The Glue Catalog can store the table metadata for the generated dataset.

