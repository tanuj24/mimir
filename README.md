<div align="center">

# Mimir

**See your cloud, before you ship your cloud.**

A local, AWS-style console for poking at cloud services on your own machine — no AWS account, no bill, no internet required. It runs on top of [Floci](https://floci.io).

[![License: MIT](https://img.shields.io/badge/license-MIT-ec7211.svg)](LICENSE) &nbsp;·&nbsp; Powered by [Floci](https://floci.io)

</div>

---

## The idea

If you've ever wanted to try something on AWS — drop a file in a bucket, fire a Lambda, scan a DynamoDB table, run a Glue job — but didn't want to create real resources, juggle credentials, or watch the meter run, that's what Mimir is for.

It gives you the familiar AWS console experience (left-hand service nav, region picker, resource tables, the works) but everything points at a cloud running on your laptop. The backend is [Floci](https://floci.io), a fast little AWS emulator. Mimir is the friendly face on top of it.

Think of it as a sandbox you can break, reset, and walk away from — so you can see how your cloud behaves before any of it is real.

## What's in the box

Fifteen services with real, clickable UIs:

| Area | Services |
| --- | --- |
| Storage | **S3** — browse buckets and objects, upload, download, delete |
| Database | **DynamoDB** — tables, items, scans, a JSON item editor |
| Compute | **Lambda** (invoke + logs), **EC2** (instances, security groups, VPCs, AMIs) |
| Containers | **ECS**, **ECR**, **EKS** |
| Messaging | **SQS** (send/receive/purge), **SNS** (topics, subscriptions, publish) |
| Analytics | **Glue** (jobs, notebooks, Data Catalog), **MSK / Kafka** |
| Security | **KMS**, **Secrets Manager**, **SSM Parameter Store** |
| Observability | **CloudWatch Logs**, **CloudWatch Metrics** |

What's actually available depends on the Floci version you're running. When Floci doesn't support an operation, Mimir tells you plainly instead of throwing a cryptic error.

### A note on Glue

Glue gets special treatment because it's more than CRUD. Floci handles the **Data Catalog** (databases, tables, schemas), but it doesn't run jobs or notebooks — so Mimir does that part itself, locally, in Docker:

- **ETL jobs** in PySpark (via `spark-submit`) or plain Python, with run history and full logs.
- **Notebooks** — interactive sessions with a real, stateful kernel you drive cell by cell.
- The **Job details** you'd expect from the real console: Glue version, worker type and count, timeouts, job parameters, and library paths (`--extra-py-files`, `--extra-jars`, referenced files, extra pip modules). Point a library at an `s3://` URI and Mimir pulls it straight from your Floci bucket at run time.

It's not pretending — these jobs genuinely execute. They just run on your machine instead of a Glue fleet.

## Getting started

The fastest way is Docker Compose. You'll need Docker (Desktop or Engine) with the Compose plugin.

```bash
git clone https://github.com/tanuj24/mimir.git
cd mimir
docker compose up -d
```

Give it a moment to pull Floci and build the two Mimir images, then open **http://localhost:8080**.

That single command brings up everything: Floci (the backend), the Mimir API server, and the web console. Floci is left listening on `localhost:4566`, so your existing AWS CLI and SDKs can talk to the exact same backend:

```bash
aws --endpoint-url http://localhost:4566 s3 mb s3://hello
aws --endpoint-url http://localhost:4566 s3 ls
```

Create something from the CLI, then hit refresh in Mimir — it'll be there.

When you're done:

```bash
docker compose down      # stop everything, keep your data
docker compose down -v   # stop and wipe Floci's state
```

## Running it for development

If you want to hack on Mimir itself, run the pieces with hot reload. You'll need Floci up first — either `docker compose up -d floci`, or the [Floci CLI](https://floci.io) (`floci start`).

```bash
npm install
cp .env.example .env
npm run dev
```

The server comes up on `:4000`, the web app on `:5173`. Open **http://localhost:5173**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Server + web, both with hot reload |
| `npm run dev:server` / `npm run dev:web` | Just one side |
| `npm run build` | Type-check and build both for production |

## How it fits together

```
Browser  →  web (nginx, serves the app, proxies /api)
                 →  server (Express + AWS SDK v3)  →  Floci :4566
                          └─ Glue engine  →  Docker (Spark / Python containers)
```

Two workspaces:

- **`web/`** — React, Vite, TypeScript, Tailwind, TanStack Query. A single service registry drives the nav, the home page, and the routes.
- **`server/`** — a thin Express proxy. A small factory points any AWS SDK v3 client at Floci, which keeps each service down to a short route file. It also holds the local Glue execution engine.

Adding a service is deliberately boring: write a route module in `server/src/routes/`, add a page under `web/src/pages/`, and register it in `web/src/services/registry.ts`. That's the whole recipe.

## Configuration

Everything is driven by environment variables — see [`.env.example`](.env.example). The ones you're most likely to touch:

| Variable | Default | What it's for |
| --- | --- | --- |
| `FLOCI_ENDPOINT` | `http://localhost:4566` | Where the server finds Floci |
| `PUBLIC_FLOCI_ENDPOINT` | same as above | The endpoint your browser uses (matters for presigned S3 links) |
| `AWS_REGION` | `us-east-1` | Default region |
| `PORT` | `4000` | The Mimir server port |
| `GLUE_WORK_DIR` | OS temp dir | Where Glue jobs and notebooks do their work |
| `GLUE_SPARK_IMAGE` | `spark:python3` | Image used for Spark jobs and kernels |
| `GLUE_PYTHON_IMAGE` | `python:3.11-slim` | Image used for Python jobs and kernels |

## Good to know

- **Glue needs Docker.** Jobs and notebooks spin up containers, so the Docker socket has to be reachable. Compose wires this up for you. The first Spark run pulls the `spark:python3` image, so give it a minute.
- **The Compose Glue setup shares `/tmp/mimir-glue` between the server container and the host.** That relies on Docker being allowed to share `/tmp` — true on a default Docker Desktop install. If you've locked down file sharing, point `GLUE_WORK_DIR` (and the matching bind mount in `docker-compose.yml`) at a path you do share.
- **Mimir is for local development and testing.** It's a sandbox, not a stand-in for production AWS, and it doesn't promise byte-for-byte parity with the real services.

## A bit of housekeeping

Mimir is an independent, open-source project. It isn't affiliated with, endorsed by, or sponsored by Amazon Web Services. "AWS" and the service names used throughout are trademarks of Amazon.com, Inc. or its affiliates, and they appear here only to describe what Mimir talks to.

The local cloud backend is [Floci](https://floci.io), which is its own MIT-licensed project — have a look at its license and docs if you're curious about what's happening under the hood.

## License

[MIT](LICENSE). Use it, fork it, build on it.
