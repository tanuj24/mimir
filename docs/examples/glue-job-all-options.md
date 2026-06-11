# A Glue job that uses every job option

This example is a single Spark Glue job wired to **every** Glue job-config
option Mimir supports, so you can see each one resolve in the run log:

| Option | What this job uses it for |
|--------|---------------------------|
| **Script location** | the job script lives in S3, fetched at run time |
| **Python library path** (`extraPyFiles`) | a `.whl` (`tabulate`) **and** a custom module (`glue_utils.py`) |
| **Dependent JARs path** (`extraJars`) | `commons-csv` downloaded from Maven Central |
| **Referenced files path** (`extraFiles`) | a `job_config.json` staged next to the script |
| **Additional Python modules** (`additionalPythonModules`) | `faker` pip-installed at run time |
| **Job parameters** | `--input_path`, `--output_path`, `--batch_size`, `--environment`, `--enable_metrics` |

The files are in [`glue-all-options/`](./glue-all-options/):

- [`mimir-demo-full-featured.py`](./glue-all-options/mimir-demo-full-featured.py) — the job script
- [`glue_utils.py`](./glue-all-options/glue_utils.py) — custom module loaded via `extraPyFiles`
- [`job_config.json`](./glue-all-options/job_config.json) — config file loaded via `extraFiles`

## Start Mimir

```bash
docker run -d --name mimir \
  -p 8080:8080 -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/mimir-glue:/tmp/mimir-glue \
  tanujsoni027/mimir-aws:v3
```

- Console: http://localhost:8080
- AWS endpoint: http://localhost:4566 — credentials `mimir` / `mimir`, region `us-east-1`

> **Tip:** publishing `4566` (as above) lets Glue jobs read/write the local S3
> from inside their container. Without it, jobs still run, but S3 reads/writes
> time out — see the note in the script.

## Upload the job assets to S3

```bash
EP="--endpoint-url http://localhost:4566"

# bucket (already present if you've loaded sample data)
aws $EP s3 mb s3://mimir-sample-data 2>/dev/null || true

# a real wheel to install via extraPyFiles
pip download tabulate==0.9.0 --no-deps --only-binary=:all: -d /tmp/whl
aws $EP s3 cp /tmp/whl/tabulate-0.9.0-py3-none-any.whl s3://mimir-sample-data/libs/

# the custom module + config file + the job script itself
aws $EP s3 cp docs/examples/glue-all-options/glue_utils.py              s3://mimir-sample-data/scripts/
aws $EP s3 cp docs/examples/glue-all-options/job_config.json            s3://mimir-sample-data/config/
aws $EP s3 cp docs/examples/glue-all-options/mimir-demo-full-featured.py s3://mimir-sample-data/scripts/
```

`commons-csv` is fetched straight from Maven Central by the job — no upload
needed. Mimir resolves `https://` URLs in `extraJars` at run time.

## Create the job

Open **Glue → Jobs → Create job** in the console and fill in:

- **Type:** Spark
- **Script location:** `s3://mimir-sample-data/scripts/mimir-demo-full-featured.py`
  (or paste the script directly into the editor)

In **Job details**, set:

| Field | Value |
|-------|-------|
| Python library path | `s3://mimir-sample-data/libs/tabulate-0.9.0-py3-none-any.whl,s3://mimir-sample-data/scripts/glue_utils.py` |
| Dependent JARs path | `https://repo1.maven.org/maven2/org/apache/commons/commons-csv/1.10.0/commons-csv-1.10.0.jar` |
| Referenced files path | `s3://mimir-sample-data/config/job_config.json` |
| Additional Python modules | `faker==22.2.0` |
| Temporary directory | `s3://mimir-sample-data/temp/` |

Add these **Job parameters**:

| Key | Value |
|-----|-------|
| `--input_path` | `s3://mimir-sample-data/tables/orders/` |
| `--output_path` | `s3://mimir-sample-data/output/demo-full/` |
| `--batch_size` | `1000` |
| `--environment` | `dev` |
| `--enable_metrics` | `true` |

## Run and read the log

Run the job. As it starts, Mimir fetches each artifact — you'll see lines like:

```
[mimir] loaded script from s3://mimir-sample-data/scripts/mimir-demo-full-featured.py
[mimir] fetched  s3://mimir-sample-data/libs/tabulate-0.9.0-py3-none-any.whl
[mimir] fetched  s3://mimir-sample-data/scripts/glue_utils.py
[mimir] fetched  s3://mimir-sample-data/config/job_config.json
[mimir] downloaded https://repo1.maven.org/.../commons-csv-1.10.0.jar
```

Then the job itself prints one tagged line per feature, so the log is a checklist:

```
[extra-file]   job_config.json loaded — version=1.0, max_rows=500, tags={'team': 'data-eng', ...}
[extra-py-file] glue_utils.py imported — summarise_dataframe & clean_string_columns available
[whl]          tabulate==0.9.0 imported (installed from S3 .whl via extraPyFiles)
[pip-module]   faker imported — sample generated name: 'Noah Scott'
[extra-jar]    commons-csv JAR on classpath — CSVFormat.DEFAULT = ...
[data] Orders by status:
+----------+-----+
|   status |count|
...
  Job complete.
```

## What this validates

A single run proves every job-config path works end to end:

- the script can come from S3 (`scriptLocation`)
- `.whl` files **and** plain `.py` modules load via `extraPyFiles`
- external JARs reach the Spark/JVM classpath via `extraJars`
- arbitrary files are staged next to the script via `extraFiles`
- extra pip packages install at run time via `additionalPythonModules`
- job parameters arrive through `getResolvedOptions`
