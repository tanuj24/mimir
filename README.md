<p align="center">
  <img src="brand/hero-banner1.png" alt="Mimir - Mimic & Run" width="700" />
</p>

<p align="center">
  <strong>See your cloud, before you ship your cloud.</strong><br />
  A local AWS sandbox for building and testing cloud infrastructure locally — no AWS account, no bill, no internet required.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-0d94d9.svg" alt="License: MIT"></a>
  ·
  <a href="#"><img src="https://img.shields.io/badge/local%20AWS%20cloud-bundled-ec7211" alt="Bundled local AWS cloud"></a>
</p>

---

## The idea

Build and test your cloud locally — **mimic** AWS services, **run** them on your machine, see how everything *actually* behaves before it's real.

No AWS account. No bill. No internet required. Just a sandbox you can break, reset, and learn from.

---

## What's new in Mimir v2

Mimir v2 is a complete local AWS environment, not just a console that expects another backend to be running.

- **Bundled AWS-compatible backend** — the local AWS edge is included and served on port `4566`.
- **Single Docker image** — local cloud backend, API bridge, and web console ship together as `tanujsoni027/mimir-aws`.
- **54 backend services** — the backend starts a broad AWS API surface, while the console exposes the most useful workflows first.
- **Container-backed runtimes** — Lambda, EC2, and Glue run local containers instead of UI-only mocks.
- **Browser EC2 terminal** — connect to running local EC2 instances from the console.
- **Real Glue execution** — Glue jobs and notebooks can run Glue-style Python/Spark code locally, including AWS Glue libraries when using the Glue runtime images.

---

## Mimir v1 vs v2

| Area | Mimir v1 | Mimir v2 |
|------|----------|----------|
| Run experience | Multi-service setup | One Docker image |
| Backend | Expected a separate local AWS backend service | Bundled AWS-compatible backend |
| Setup | Multi-step local setup | Run one `docker run` command |
| Distribution | Source-first workflow | Published multi-arch image |
| Runtime services | Console plus API bridge | Console, API bridge, backend, and container runtime support in one package |
| Glue | Local execution with separate runtime wiring | Real local Glue runtime path included in the packaged experience |
| EC2 terminal | Earlier browser terminal support | Packaged terminal bridge for local EC2 containers |

The v1 README is kept for reference in [docs/v1-readme.md](docs/v1-readme.md).

---

## Performance profile

| Dimension | Floci standalone | Mimir v1 | Mimir v2 |
|-----------|------------------|----------|----------|
| Best case | Raw local AWS API emulation | Console-driven local AWS workflows | Packaged local AWS sandbox |
| Startup path | Fastest: backend only | Slower: multiple services must start | One container starts the full product |
| Runtime overhead | Lowest: direct AWS API endpoint | Adds console/API bridge overhead | Adds console/API bridge overhead, but removes external backend setup |
| Resource footprint | Smallest | Higher than standalone backend | Highest baseline, because everything is bundled |
| First useful action | Start backend, then connect tools | Bring up backend, API bridge, and console | Run one image and open the console |
| Glue runtime | Backend catalog only | Local job runtime wired beside the backend | Local Glue runtime included in the packaged experience |
| EC2/Lambda containers | Backend-managed where supported | Managed through separate runtime pieces | Packaged container-backed workflow |

In short: **Floci standalone is the leanest backend**, **Mimir v1 adds a console around a multi-service setup**, and **Mimir v2 optimizes for the fastest end-to-end product experience** by bundling the full local cloud into one image.

---

## What you get

**15+ AWS services** with real, working UIs:

| Storage | Databases | Compute | Containers | Messaging | Analytics | Security | Observability |
|---------|-----------|---------|-----------|-----------|-----------|----------|----------------|
| **S3** | **DynamoDB** | **Lambda** | **ECS** | **SQS** | **Glue** | **KMS** | **CloudWatch Logs** |
| Buckets, objects, upload, presigned URLs | Tables, items, scans | Invoke, logs, versions | Task defs, services | Send, receive, purge | Jobs, notebooks, catalog | Encrypt, decrypt | Log groups, streams |
| | | **EC2** | **ECR** | **SNS** | **MSK/Kafka** | **Secrets Manager** | **CloudWatch Metrics** |
| | | Instances, security groups, VPCs | Repositories, images | Topics, subscriptions, publish | Brokers, topics | Secrets CRUD | Metrics, dashboards |

If the backend doesn't support an operation, Mimir tells you plainly — no cryptic errors, no silent failures.

---

## AWS Glue: real local runtime

Glue gets special treatment because it's more than just table-browsing. The Mimir backend handles the **Data Catalog** (databases, tables, schemas). Mimir handles the *execution*:

- **ETL jobs** in PySpark or plain Python, with full run history and logs
- **Notebooks** — interactive sessions with a live, stateful kernel you drive cell by cell
- **Job configuration** like the real AWS console: Glue version, worker count, timeouts, job parameters, and libraries
- **Libraries from S3** — point a job at `s3://my-bucket/helpers.py` and it gets pulled and imported at run time
- **AWS Glue libraries** — run against Glue runtime images so imports like `awsglue`, `GlueContext`, `DynamicFrame`, and `Job` work locally

These aren't mock jobs. They actually execute. They just run on Docker containers on your machine instead of a Glue fleet.

---

## Examples

These walkthroughs show real local workflows you can run against Mimir:

- [Run a Glue Spark job with Parquet on S3](docs/examples/glue-spark-parquet-s3.md): read Parquet from local S3, write transformed Parquet back to S3, and register a Glue Catalog table.
- [Use the EC2 browser terminal](docs/examples/ec2-browser-terminal.md): launch a local EC2 instance and connect to its shell from the console.
- [Run Lambda locally](docs/examples/lambda-local-runtime.md): create a function, invoke it, and inspect logs without an AWS account.

---

## Get started in 30 seconds

The entire tool — backend, server, and console — ships as a **single multi-arch
image** ([`tanujsoni027/mimir-aws`](https://hub.docker.com/r/tanujsoni027/mimir-aws),
amd64 + arm64). No clone, no build, no environment setup.

Prerequisites:

- Docker Desktop or Docker Engine
- Docker socket access at `/var/run/docker.sock`

Run:

```bash
docker run -d --name mimir \
  -p 8080:80 -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/mimir-glue:/tmp/mimir-glue \
  tanujsoni027/mimir-aws:latest
```

Open:

- **Console:** http://localhost:8080
- **AWS edge endpoint:** http://localhost:4566

Defaults:

- Access key: `mimir`
- Secret key: `mimir`
- Region: `us-east-1`

The Docker socket lets the container-backed services (Lambda, EC2, Glue) spin up sibling containers; the `/tmp/mimir-glue` mount is only needed for Glue.

Point your AWS CLI or SDKs at the local backend:

```bash
aws --endpoint-url http://localhost:4566 s3 mb s3://hello
aws --endpoint-url http://localhost:4566 s3 ls
```

Stop and remove the container:

```bash
docker rm -f mimir
```

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│ Your browser                                                │
│   ↓ http://localhost:8080                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Mimir Web Console                                      │ │
│ │   Services sidebar, region picker, resource tables     │ │
│ │   API requests stay inside the local Mimir runtime     │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
                ┌──────────────────────┐
                │ Mimir API Bridge     │
                │                      │
                │ • S3, DynamoDB, etc  │ → backend :4566
                │ • Glue execution     │ → Docker daemon
                │ • EC2 terminal bridge│ → docker exec
                └──────────────────────┘
                           │
                           ↓
            ┌──────────────────────────┐
            │ Local AWS-compatible     │
            │ backend                  │
            │ :4566                    │
            │                          │
            │ Real emulation of:       │
            │ • S3, DynamoDB, SQS, etc │
            └──────────────────────────┘
```

The Docker image starts everything together: the console, the local API bridge, and the AWS-compatible backend. For implementation details, see [Technical Architecture](docs/architecture.md).

---

## Things to know

- **Docker socket access is required for full functionality.** Lambda, EC2, and Glue use sibling containers. The console can still load without it, but those runtimes cannot start.
- **Glue needs Docker images.** Jobs and notebooks spin up containers. The first Glue/Spark run may pull a large runtime image — give it a minute.
- **Glue shares `/tmp/mimir-glue` between Mimir and job containers.** Docker Desktop allows this by default on macOS and Linux Docker hosts.
- **EC2 instances are local containers.** They are named `mimir-ec2-<instance-id>`. If a stale instance container holds a port, remove it with `docker rm -f mimir-ec2-<id>`.
- **It's a sandbox, not production.** Mimir is for local iteration, not a drop-in AWS replacement. No promise of byte-for-byte parity.

---

## The fine print

**Mimir** is an independent, open-source project. It is **not** affiliated with, endorsed by, or sponsored by Amazon Web Services. "AWS" and AWS service names are trademarks of Amazon.com, Inc. and appear here only to describe what Mimir emulates.

The local cloud backend is bundled in this repo, so the whole tool ships and runs as a single project.

---

## License

[MIT](LICENSE). Use it, fork it, build on it. No strings.

---

## Support

Building and maintaining Mimir takes time. If it's helping you test cloud infrastructure locally, consider [supporting the project on Open Collective](https://opencollective.com/tanuj). Your support helps keep development going. ☕

---

**See your cloud, before you ship your cloud.**
