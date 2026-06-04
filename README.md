<div align="center">

![Mimir Hero Banner](./brand/hero-banner.svg)

[![License: MIT](https://img.shields.io/badge/license-MIT-0d94d9.svg)](LICENSE) · [Powered by Floci](https://floci.io)

</div>

---

## The idea

Build and test your cloud locally — **mimic** AWS services, **run** them on your machine, see how everything *actually* behaves before it's real.

No AWS account. No bill. No internet required. Just a sandbox you can break, reset, and learn from.

---

## What you get

**15+ AWS services** with real, working UIs:

| Storage | Databases | Compute | Containers | Messaging | Analytics | Security | Observability |
|---------|-----------|---------|-----------|-----------|-----------|----------|----------------|
| **S3** | **DynamoDB** | **Lambda** | **ECS** | **SQS** | **Glue** | **KMS** | **CloudWatch Logs** |
| Buckets, objects, upload, presigned URLs | Tables, items, scans | Invoke, logs, versions | Task defs, services | Send, receive, purge | Jobs, notebooks, catalog | Encrypt, decrypt | Log groups, streams |
| | | **EC2** | **ECR** | **SNS** | **MSK/Kafka** | **Secrets Manager** | **CloudWatch Metrics** |
| | | Instances, security groups, VPCs | Repositories, images | Topics, subscriptions, publish | Brokers, topics | Secrets CRUD | Metrics, dashboards |

If Floci doesn't support an operation, Mimir tells you plainly — no cryptic errors, no silent failures.

---

## AWS Glue: the star feature

Glue gets special treatment because it's more than just table-browsing. Floci handles the **Data Catalog** (databases, tables, schemas). Mimir handles the *execution*:

- **ETL jobs** in PySpark (via `spark-submit`) or plain Python, with full run history and logs
- **Notebooks** — interactive sessions with a live, stateful kernel you drive cell by cell
- **Job configuration** like the real AWS console: Glue version, worker count, timeouts, job parameters, and libraries
- **Libraries from S3** — point a job at `s3://my-bucket/helpers.py` and it gets pulled and imported at run time

These aren't mock jobs. They actually execute. They just run on Docker containers on your machine instead of a Glue fleet.

---

## Get started in 30 seconds

### Docker Compose (recommended)

Requires **Docker** (Desktop or Engine) with Compose.

```bash
git clone https://github.com/tanuj24/mimir.git
cd mimir
docker compose up -d
```

Open **http://localhost:8080**.

That one command brings up three services:
- **Floci** (the backend, port 4566)
- **Mimir server** (the API proxy + Glue engine)
- **Mimir web** (the console)

Floci stays on `localhost:4566`, so your existing AWS CLI/SDKs can hit the same backend:

```bash
aws --endpoint-url http://localhost:4566 s3 mb s3://hello
aws --endpoint-url http://localhost:4566 s3 ls
# Refresh Mimir → your bucket appears
```

Stop it anytime:

```bash
docker compose down       # keep data
docker compose down -v    # wipe everything
```

### Local development

If you want to hack on Mimir itself, run the pieces separately with hot reload. You'll need Floci up first — either `docker compose up -d floci`, or the [Floci CLI](https://floci.io): `floci start`.

```bash
npm install
cp .env.example .env
npm run dev
```

Server comes up on `:4000`, web on `:5173`. Open **http://localhost:5173**.

| Command | What it does |
|---------|-----------|
| `npm run dev` | Both server + web with hot reload |
| `npm run dev:server` | Just the server |
| `npm run dev:web` | Just the web console |
| `npm run build` | Type-check + build both for production |

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│ Your browser                                                │
│   ↓ http://localhost:5173                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Mimir Web Console (React + Vite + TanStack Query)       │ │
│ │   Services sidebar, region picker, resource tables     │ │
│ │   /api requests → mimir-server:4000                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
                ┌──────────────────────┐
                │ Mimir Server         │
                │ (Express + AWS SDK)  │
                │                      │
                │ • S3, DynamoDB, etc  │ → Floci :4566
                │ • Glue execution     │
                │   (Docker engine)    │
                └──────────────────────┘
                           │
                           ↓
            ┌──────────────────────────┐
            │ Floci (local AWS)        │
            │ :4566                    │
            │                          │
            │ Real emulation of:       │
            │ • S3, DynamoDB, SQS, etc │
            └──────────────────────────┘
```

Two npm workspaces:

- **`web/`** — React + Vite + TypeScript. A service registry drives navigation and routes. Talks to the server via REST + React Query.
- **`server/`** — Express proxy + Glue engine. A small factory points any AWS SDK v3 client at Floci. Each service is a thin route module. The Glue engine runs jobs/notebooks in Docker.

Adding a service is straightforward: write a route in `server/src/routes/`, add a page under `web/src/pages/`, and register it in `web/src/services/registry.ts`.

---

## Configuration

Everything is environment variables — see [`.env.example`](.env.example).

| Variable | Default | Purpose |
|----------|---------|---------|
| `FLOCI_ENDPOINT` | `http://localhost:4566` | Server-side URL to reach Floci |
| `PUBLIC_FLOCI_ENDPOINT` | = `FLOCI_ENDPOINT` | Browser-side URL (for presigned S3 links) |
| `AWS_REGION` | `us-east-1` | Default region |
| `PORT` | `4000` | Server port |
| `GLUE_WORK_DIR` | OS temp dir | Glue job/notebook temp storage |
| `GLUE_SPARK_IMAGE` | `spark:python3` | Spark image for jobs + kernels |
| `GLUE_PYTHON_IMAGE` | `python:3.11-slim` | Python image for jobs + kernels |

---

## Things to know

- **Glue needs Docker.** Jobs and notebooks spin up containers. Compose handles this. The first Spark run pulls the `spark:python3` image (~500MB) — give it a minute.
- **Compose shares `/tmp/mimir-glue` between the server container and your host.** This relies on Docker's default file-sharing setup. If you've locked it down, adjust `GLUE_WORK_DIR` in `docker-compose.yml`.
- **It's a sandbox, not production.** Mimir is for local iteration, not a drop-in AWS replacement. No promise of byte-for-byte parity.

---

## The fine print

**Mimir** is an independent, open-source project. It is **not** affiliated with, endorsed by, or sponsored by Amazon Web Services. "AWS" and AWS service names are trademarks of Amazon.com, Inc. and appear here only to describe what Mimir emulates.

The local cloud backend is **[Floci](https://floci.io)**, which is its own MIT-licensed project — check out its repo if you're curious how the emulation works.

---

## License

[MIT](LICENSE). Use it, fork it, build on it. No strings.

---

**See your cloud, before you ship your cloud.**
