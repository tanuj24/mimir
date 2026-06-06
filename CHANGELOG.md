# Changelog

All notable changes to Mimir are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

> The **`v2`** branch is where Mimir 2.x is developed. The **`main`** branch
> continues the 1.x line.

## [2.0.0] - Unreleased (v2 branch)

Mimir 2.0 ditches the external Floci dependency and ships its **own local AWS
cloud backend** in-repo, so the entire tool — console, proxy, and emulated AWS —
builds and runs as a single bundle.

### Added
- **`mimir-backend/`** — the bundled local AWS cloud (Java / Quarkus emulator).
  `docker compose up` builds and runs it directly; no external image required.

### Changed
- `docker compose` now builds and starts `mimir-backend` instead of pulling the
  `floci/floci` image. The backend still serves the AWS edge on `localhost:4566`.
- The proxy server points the AWS SDKs and the Glue engine at the Mimir backend.
  Endpoint env vars are now `BACKEND_ENDPOINT` / `PUBLIC_BACKEND_ENDPOINT`
  (legacy `FLOCI_ENDPOINT` is still honored). The health check uses the
  backend's `/_mimir/health`, and EC2 instance containers are matched as
  `mimir-ec2-<id>`.
- Console branding and copy no longer reference Floci; the brand accent color
  token is `mimir`.

### Removed
- The external Floci service from `docker-compose.yml` and all Floci references.

## [1.1] - 2026-06-06

Mimir v1.1 makes the compute services run real workloads. AWS Glue jobs now
execute unmodified Glue code on the official Glue runtime, AWS Lambda gains a
full function console, and the whole stack is easier to keep an eye on.

### Added

#### AWS Glue — real runtime
- Glue jobs and notebooks now run on the **official AWS Glue runtime images**
  (mapped by Glue version: 5.0, 4.0, 3.0, 2.0), so unmodified Glue code runs
  locally with the real `awsglue` library, a version-matched Spark, and the
  same preinstalled libraries (boto3/pandas/numpy/pyarrow) as AWS.
- `GlueContext`, `DynamicFrame`, the Glue transforms, `Job`, and
  `getResolvedOptions` all work; both Spark (`glueetl`) and Python-shell jobs
  are supported.
- `create_dynamic_frame.from_catalog` reads from the local Glue Data Catalog,
  and `s3://` / `s3a://` reads and writes are wired to local S3.
- Interactive notebook kernels expose the same runtime for cell-by-cell work.

#### AWS Lambda — full function console
- New per-function detail view with **Code**, **Test**, **Configuration**,
  **Aliases & versions**, and **Triggers** tabs.
- Edit and redeploy function code (inline editor or `.zip` upload).
- Configuration: memory, timeout, ephemeral storage (`/tmp`), handler, runtime,
  description, environment variables, X-Ray tracing, reserved concurrency,
  Function URLs, tags, and asynchronous-invocation settings.
- Publish versions, create/delete aliases, and invoke a specific version/alias.
- Add and remove triggers (event source mappings for SQS / DynamoDB / Kinesis).
- Create flow expanded with architecture (x86_64 / arm64), ephemeral storage,
  description, and an extended runtime list (Node.js 18/20/22, Python
  3.9–3.13, Ruby 3.3, Java 17/21, `provided.al2023`).

#### Observability & lifecycle
- **Resource monitor**: a constant bottom bar shows host CPU, RAM, and running
  container count, so it is clear when local capacity is the limit.
- Glue job run logs now stream live in the UI without a manual refresh.
- Glue notebook kernels auto-stop after 120 minutes idle and transparently
  resume on the next cell, freeing resources while you are away.

### Changed
- Glue job/notebook containers are pointed at the local stack (S3, Glue
  Catalog) out of the box.

### Fixed
- EC2 instance containers are now cleaned up when an instance is terminated,
  and orphaned containers from terminated instances are reaped automatically.
- Build and Docker image fixes for a smoother `docker compose up`.

## [1.0] - 2026-06-05

- Initial release: local AWS console for Floci covering S3, DynamoDB, Lambda,
  SQS, SNS, CloudWatch Logs/Metrics, KMS, Secrets Manager, SSM, EC2, ECS, ECR,
  EKS, Glue, and MSK/Kafka, plus an EC2 browser terminal.
