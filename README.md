<div align="center">

<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 900px; margin: 30px 0;">
  <defs>
    <style>
      .cloud-ring { opacity: 0.6; transform-origin: center; }
      .ring-1 { animation: ringPulse 3s ease-in-out infinite; }
      .ring-2 { animation: ringPulse 3s ease-in-out 0.2s infinite; }
      .ring-3 { animation: ringPulse 3s ease-in-out 0.4s infinite; }
      .ring-4 { animation: ringPulse 3s ease-in-out 0.6s infinite; }
      @keyframes ringPulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.08); opacity: 0.8; } }
      .arrow-path { fill: none; stroke: #ff9500; stroke-width: 28; stroke-linecap: round; stroke-linejoin: round; }
      .arrow-1 { animation: flowUp 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
      .arrow-2 { animation: flowUp 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.4s infinite; }
      .arrow-3 { animation: flowUp 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.8s infinite; }
      .arrow-4 { animation: flowUp 2.5s cubic-bezier(0.4, 0, 0.2, 1) 1.2s infinite; }
      @keyframes flowUp { 0% { stroke-dashoffset: 300; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
      .terminal-icon { filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.6)); animation: iconGlow 2s ease-in-out infinite; }
      @keyframes iconGlow { 0%, 100% { filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.4)); } 50% { filter: drop-shadow(0 0 40px rgba(59, 130, 246, 0.8)); } }
      .dot { animation: dotFloat 3s ease-in-out infinite; }
      .dot-1 { animation-delay: 0s; }
      .dot-2 { animation-delay: 0.3s; }
      .dot-3 { animation-delay: 0.6s; }
      .dot-4 { animation-delay: 0.9s; }
      @keyframes dotFloat { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; } 50% { transform: translateY(-8px) scale(1.2); opacity: 0.8; } }
      .wordmark { opacity: 0; animation: fadeInScale 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      .tagline { opacity: 0; animation: fadeIn 1.5s ease-out 0.6s forwards; }
      @keyframes fadeInScale { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
      @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
    </style>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1b2d"/>
      <stop offset="100%" stop-color="#0a0f1f"/>
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#1f4a6d" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0a0f1f" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#3f82c4" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1600" height="900" fill="url(#bgGrad)"/>
  <rect width="1600" height="900" fill="url(#glowGrad)"/>
  <g opacity="0.05">
    <rect width="1600" height="900" fill="url(#grid)"/>
  </g>

  <g transform="translate(800, 300)">
    <circle class="cloud-ring ring-1" cx="0" cy="0" r="180" fill="none" stroke="#3f82c4" stroke-width="35"/>
    <circle class="cloud-ring ring-2" cx="0" cy="0" r="120" fill="none" stroke="#3f82c4" stroke-width="32"/>
    <circle class="cloud-ring ring-3" cx="0" cy="0" r="240" fill="none" stroke="#3f82c4" stroke-width="28" opacity="0.4"/>
    <circle class="cloud-ring ring-4" cx="0" cy="0" r="80" fill="none" stroke="#3f82c4" stroke-width="24"/>
    <path class="arrow-path arrow-1" d="M -200,-100 Q -150,-180 -80,-200 L -50,-200 L -80,-230 L -110,-200" stroke-dasharray="300" stroke-dashoffset="300"/>
    <path class="arrow-path arrow-2" d="M 200,-100 Q 150,-180 80,-200 L 50,-200 L 80,-230 L 110,-200" stroke-dasharray="300" stroke-dashoffset="300"/>
    <path class="arrow-path arrow-3" d="M -180,180 Q -120,220 -40,240 L 0,250 L -30,280 L -60,250" stroke-dasharray="300" stroke-dashoffset="300"/>
    <path class="arrow-path arrow-4" d="M 180,180 Q 120,220 40,240 L 0,250 L 30,280 L 60,250" stroke-dasharray="300" stroke-dashoffset="300"/>
    <g class="terminal-icon">
      <rect x="-60" y="-60" width="120" height="120" rx="20" fill="#3f82c4"/>
      <g transform="translate(-30, -15)">
        <polyline points="20,10 40,30 20,50" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <line x1="-10" y1="25" x2="30" y2="25" stroke="white" stroke-width="6" stroke-linecap="round"/>
    </g>
    <circle class="dot dot-1" cx="-280" cy="-120" r="8" fill="#ff9500"/>
    <circle class="dot dot-2" cx="280" cy="-120" r="8" fill="#ff9500"/>
    <circle class="dot dot-3" cx="-260" cy="220" r="8" fill="#ff9500"/>
    <circle class="dot dot-4" cx="260" cy="220" r="8" fill="#ff9500"/>
  </g>

  <text class="wordmark" x="800" y="680" font-family="'Inter', '-apple-system', sans-serif" font-size="140" font-weight="900" fill="white" text-anchor="middle" letter-spacing="-3">MIMIR</text>
  <text x="800" y="760" font-family="'Inter', '-apple-system', sans-serif" font-size="36" font-weight="300" fill="#9aafcd" text-anchor="middle" letter-spacing="2">Mimic & Run</text>
  <text class="tagline" x="800" y="830" font-family="'Inter', '-apple-system', sans-serif" font-size="32" font-weight="300" fill="#cbd5e1" text-anchor="middle" letter-spacing="0.5">See your cloud, before you ship your cloud.</text>

  <g opacity="0.15">
    <polygon points="1350,150 1358,170 1380,170 1363,183 1370,203 1350,190 1330,203 1337,183 1320,170 1342,170" fill="#ff9500"/>
    <polygon points="200,750 206,765 222,765 209,775 215,790 200,780 185,790 191,775 178,765 194,765" fill="#3f82c4"/>
  </g>
</svg>

---

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
