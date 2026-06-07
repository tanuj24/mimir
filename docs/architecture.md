# Technical Architecture

This document captures implementation details for contributors who want to work on Mimir itself. The main README intentionally stays focused on running and using the product.

## Runtime Layout

Mimir v2 runs as one Docker image for end users, with three main pieces inside:

- **Web console**: React, Vite, TypeScript, Tailwind, TanStack Query, and React Router.
- **API bridge**: Node.js and Express. It proxies AWS-style operations to the local backend, exposes console-friendly REST endpoints, runs the Glue engine, and handles the EC2 terminal WebSocket bridge.
- **Local AWS backend**: `mimir-backend/`, a Java/Quarkus AWS-compatible emulator that listens on `:4566`.

The all-in-one image also includes nginx for serving the web build and proxying `/api`, plus Docker CLI access so Lambda, EC2, and Glue can start sibling containers through the mounted Docker socket.

## Repository Layout

```text
mimir/
  mimir-backend/         Java/Quarkus local AWS backend
  server/                Node/Express API bridge, Glue runtime, EC2 terminal
  web/                   React/Vite web console
  docker/allinone/       nginx config and image entrypoint
  Dockerfile.allinone    all-in-one image build
  docker-compose.yml     component-based development path
```

## Request Flow

```text
Browser
  -> nginx
  -> web console static assets
  -> /api requests
  -> server API bridge
  -> mimir-backend on :4566
```

Container-backed service flow:

```text
server API bridge
  -> Docker socket
  -> sibling runtime containers
     - Lambda containers
     - EC2 instance containers named mimir-ec2-<instance-id>
     - Glue job/session containers named mimir-glue-*
```

## Frontend

The web app lives in `web/`.

- `web/src/services/registry.ts` drives the sidebar, home service grid, and service availability.
- `web/src/App.tsx` owns top-level routing.
- `web/src/pages/<service>/` contains service-specific pages and API wrappers.
- Shared UI components live under `web/src/components/`.
- API helpers live in `web/src/lib/api.ts` and attach the selected region header to requests.

## Server

The API bridge lives in `server/`.

- `server/src/routes/` contains one route module per service.
- `server/src/routes/index.ts` mounts service routes under `/api`.
- `server/src/aws/clientFactory.ts` creates AWS SDK v3 clients pointed at the local backend.
- `server/src/lib/http.ts` contains request helpers such as region handling.
- `server/src/glue/engine.ts` runs Glue jobs and notebook sessions locally.
- `server/src/terminal.ts` bridges browser WebSocket sessions to `docker exec` for EC2 containers.
- `server/src/ec2/cleanup.ts` cleans up stale EC2 containers.

## Glue Runtime

Glue is hybrid:

- Data Catalog operations go through `mimir-backend`.
- Job and notebook execution is handled by the Node server using Docker.
- Official AWS Glue runtime images are selected by Glue version, for example:
  - Glue 4.0: `amazon/aws-glue-libs:glue_libs_4.0.0_image_01`
  - Glue 5.0: `public.ecr.aws/glue/aws-glue-libs:5`

Important runtime details:

- Glue containers reach the backend through `GLUE_AWS_ENDPOINT`, usually `http://host.docker.internal:4566`.
- Job and notebook work dirs live under `GLUE_WORK_DIR`, commonly `/tmp/mimir-glue`.
- The official Glue images require `python3` for Glue libraries.
- Some Glue catalog code paths require generated `glue-default.conf` and `glue-override.conf` files so `from_catalog` resolves against the local backend instead of AWS.

## EC2 Terminal

EC2 instances are backed by Docker containers named `mimir-ec2-<instance-id>`.

The terminal path is:

```text
browser
  -> WebSocket /api/ec2/instances/<id>/terminal
  -> server/src/terminal.ts
  -> node-pty
  -> docker exec -it mimir-ec2-<id> bash -i
```

The all-in-one nginx config must preserve WebSocket upgrade headers for that route.

## Adding A Console Service

1. Add or extend the backend route in `server/src/routes/<service>.ts`.
2. Mount the route from `server/src/routes/index.ts`.
3. Add the frontend API wrapper under `web/src/pages/<service>/`.
4. Add page components under `web/src/pages/<service>/`.
5. Register the service and route in `web/src/services/registry.ts` and `web/src/App.tsx`.

Prefer existing service pages and route modules as templates. Keep unsupported backend operations explicit in the UI instead of failing silently.

## Build Paths

Primary release path:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f Dockerfile.allinone \
  -t tanujsoni027/mimir-aws:latest \
  -t tanujsoni027/mimir-aws:v2 \
  --push .
```

Local development path:

```bash
docker compose up -d mimir-backend
npm install
cp .env.example .env
npm run dev
```

