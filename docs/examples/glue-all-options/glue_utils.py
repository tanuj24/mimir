"""
glue_utils.py — a custom helper module loaded into a Glue job via extraPyFiles.

Upload this to S3 (e.g. s3://mimir-sample-data/scripts/glue_utils.py) and add
that S3 URI to the job's "Python library path" (extraPyFiles). Mimir fetches it
into the job's working directory and passes it to spark-submit --py-files, so
`from glue_utils import ...` works inside the job exactly like on AWS Glue.
"""
from pyspark.sql import DataFrame


def summarise_dataframe(df: DataFrame, label: str = "DataFrame") -> None:
    """Print a quick row/column/schema summary of a Spark DataFrame."""
    print(f"[glue_utils] {label}: {df.count()} rows x {len(df.columns)} cols")
    print(f"[glue_utils] schema: {df.dtypes}")


def clean_string_columns(df: DataFrame) -> DataFrame:
    """Trim leading/trailing whitespace from every string column."""
    from pyspark.sql import functions as F
    for col, dtype in df.dtypes:
        if dtype == "string":
            df = df.withColumn(col, F.trim(F.col(col)))
    return df
