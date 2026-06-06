# Migrate from LocalStack

Mimir is a drop-in replacement for LocalStack Community. The wire protocol, port, credentials, and SDK configuration are identical, so most migrations require only an image swap. This page documents every change and provides a compatibility mode for projects that need a gentler transition.

## Compatibility mode

LocalStack environment variable translation is **on by default**. Mimir automatically maps LocalStack variables to their Mimir equivalents at startup, so you can keep your existing environment variables unchanged:

```yaml title="docker-compose.yml"
services:
  mimir:
    image: mimir/mimir:latest
    ports:
      - "4566:4566"
    environment:
      # These LocalStack vars are automatically translated — no extra config needed:
      PERSISTENCE: "1"                      # → MIMIR_STORAGE_MODE=persistent
      LOCALSTACK_HOST: mimir                # → MIMIR_HOSTNAME=mimir
      LAMBDA_DOCKER_NETWORK: mynet          # → MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK=mynet
      LAMBDA_REMOVE_CONTAINERS: "1"         # → MIMIR_SERVICES_LAMBDA_EPHEMERAL=true
      DEBUG: "1"                            # → QUARKUS_LOG_LEVEL=DEBUG
```

Explicitly set Mimir variables always win — the translation only fills in values that haven't been set. To disable the translation entirely, set `LOCALSTACK_PARITY=false`.

## Step-by-step migration

### 1 — Change the image

Pick the variant that matches your needs:

```yaml title="docker-compose.yml"
# Before
image: localstack/localstack

# After — no init scripts, or init scripts that don't call aws / boto3
image: mimir/mimir:latest

# After — init scripts that use aws CLI or boto3 (AWS CLI + Python 3 + boto3 pre-installed)
image: mimir/mimir:latest-compat
```

To pin a specific release, replace `latest` / `latest-compat` with a version tag:

```yaml
image: mimir/mimir:1.5.11
image: mimir/mimir:1.5.11-compat
```

The port (`4566`), credentials (`test` / `test`), and AWS SDK configuration are unchanged.

### 2 — Map environment variables

| LocalStack variable | Mimir equivalent | Notes |
|---|---|---|
| `LOCALSTACK_HOST` | `MIMIR_HOSTNAME` | Hostname embedded in response URLs |
| `LOCALSTACK_HOSTNAME` | `MIMIR_HOSTNAME` | Alias — same effect |
| `PERSISTENCE=1` | `MIMIR_STORAGE_MODE=persistent` | Enable disk persistence |
| `PERSIST_STATE=1` | `MIMIR_STORAGE_MODE=persistent` | Alias for `PERSISTENCE` — same effect |
| `EDGE_PORT` | `MIMIR_PORT` | Bind port override |
| `GATEWAY_LISTEN` | `QUARKUS_HTTP_HOST` | Bind address override |
| `LS_LOG` / `DEBUG=1` | `QUARKUS_LOG_LEVEL` | Log verbosity |
| `DOCKER_HOST` | `MIMIR_DOCKER_DOCKER_HOST` | Docker daemon socket path or TCP address |
| `LAMBDA_DOCKER_NETWORK` | `MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK` | Network for Lambda containers |
| `DOCKER_NETWORK` | `MIMIR_SERVICES_DOCKER_NETWORK` | Network for all spawned containers |
| `LAMBDA_REMOVE_CONTAINERS=1` | `MIMIR_SERVICES_LAMBDA_EPHEMERAL=true` | Remove Lambda containers after invocation |
| `USE_SSL=1` | `MIMIR_TLS_ENABLED=true` | Enable TLS/HTTPS — see [TLS / HTTPS](../configuration/tls.md) |
| `CUSTOM_SSL_CERT_PATH` | `MIMIR_TLS_CERT_PATH` + `MIMIR_TLS_KEY_PATH` | LocalStack accepts a single combined PEM; Mimir accepts it in both fields |
| `SERVICES` | _(not needed)_ | Mimir starts all 41 services instantly; no selection required |
| `LAMBDA_EXECUTOR` | _(not needed)_ | Mimir always runs Lambda in Docker containers |
| `LAMBDA_REMOTE_DOCKER` | _(not supported)_ | Use per-function `S3Bucket=hot-reload` instead — see [Lambda](../services/lambda.md) |

### 3 — Init scripts (no change required)

LocalStack init scripts mounted under `/etc/localstack/init/` run unchanged in Mimir:

```yaml title="docker-compose.yml"
volumes:
  - ./init/ready.d:/etc/localstack/init/ready.d:ro  # works as-is
```

Mimir reads both `/etc/localstack/init/` (compat) and `/etc/mimir/init/` (native). When the same filename exists in both, the Mimir copy takes priority.

To use native Mimir paths going forward:

```yaml title="docker-compose.yml"
volumes:
  - ./init/ready.d:/etc/mimir/init/ready.d:ro
```

See [Initialization Hooks](../configuration/initialization-hooks.md) for the full four-phase lifecycle (`boot`, `start`, `ready`, `stop`) and script type details (`.sh`, `.py`).

### 4 — Init script tooling (compat image)

If your init scripts call `aws` or `boto3`, switch from `localstack/localstack` to `mimir/mimir:latest-compat`:

```yaml title="docker-compose.yml"
# Before
image: localstack/localstack

# After (includes Python 3, AWS CLI, boto3 — pre-configured for localhost:4566)
image: mimir/mimir:latest-compat
```

The compat image pre-configures the AWS CLI to talk to `http://localhost:4566` — no `--endpoint-url` flag is needed in scripts:

```sh
#!/bin/sh
aws sqs create-queue --queue-name orders    # no --endpoint-url needed
aws s3 mb s3://assets
```

### 5 — Health and status endpoints

Mimir serves the LocalStack-compatible status endpoint at both paths:

```
GET /_localstack/init   # LocalStack compat path — still works
GET /_mimir/init        # native path
```

If you wait on `/_localstack/init` or `/_localstack/health` in CI or scripts, no change is needed.

### 6 — Inspection endpoints

| Endpoint | Notes |
|---|---|
| `GET /_aws/ses` | Captured emails — identical |
| `GET /_aws/ses?id=<id>` | Single message — identical |
| `DELETE /_aws/ses` | Clear mailbox — identical |
| `GET /_aws/sqs/messages?QueueUrl=<url>` | Non-destructive queue peek — identical |
| `DELETE /_aws/sqs/messages?QueueUrl=<url>` | Purge queue — identical |

### 7 — Testcontainers

=== "Java"

    Replace the `@LocalStackContainer` module with the Mimir module:

    ```xml title="pom.xml"
    <!-- Before -->
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>localstack</artifactId>
      <scope>test</scope>
    </dependency>

    <!-- After -->
    <dependency>
      <groupId>io.github.mimir-local</groupId>
      <artifactId>mimir-testcontainers</artifactId>
      <version>LATEST</version>
      <scope>test</scope>
    </dependency>
    ```

    See the [Java Testcontainers guide](../testcontainers/java.md) for full setup.

=== "Python"

    See the [Python Testcontainers guide](../testcontainers/python.md).

=== "Node.js"

    See the [Node.js Testcontainers guide](../testcontainers/nodejs.md).

=== "Go"

    See the [Go Testcontainers guide](../testcontainers/go.md).

## Complete before / after example

```yaml title="docker-compose.yml (before — LocalStack)"
services:
  localstack:
    image: localstack/localstack
    ports:
      - "4566:4566"
    environment:
      LOCALSTACK_HOST: localstack
      PERSISTENCE: "1"
      LAMBDA_DOCKER_NETWORK: myapp_default
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/var/lib/localstack
      - ./init/ready.d:/etc/localstack/init/ready.d:ro
```

```yaml title="docker-compose.yml (after — Mimir, minimal change)"
services:
  mimir:
    image: mimir/mimir:latest-compat  # (1)
    ports:
      - "4566:4566"
    environment:
      LOCALSTACK_HOST: mimir          # translated automatically — no rename needed
      PERSISTENCE: "1"
      LAMBDA_DOCKER_NETWORK: myapp_default
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data              # (2)
      - ./init/ready.d:/etc/localstack/init/ready.d:ro  # compat path — unchanged
```

1. Switch to `latest-compat` if your init scripts use `aws` or `boto3`.
2. LocalStack stores data in `/var/lib/localstack`; Mimir uses `/app/data`.

## S3 virtual-hosted style DNS

If you use LocalStack's public wildcard DNS (`*.s3.localhost.localstack.cloud`) for S3 virtual-hosted style addressing, Mimir supports it without any change:

```java
// This LocalStack endpoint works unchanged with Mimir
S3Client s3 = S3Client.builder()
    .endpointOverride(URI.create("http://s3.localhost.localstack.cloud:4566"))
    .build();
// SDK sends to: my-bucket.s3.localhost.localstack.cloud:4566 → Mimir
```

Mimir also registers its own wildcard DNS domains for virtual-hosted style:

| Domain | Usage |
|---|---|
| `*.s3.localhost.mimir.local` | S3 virtual-hosted style (`bucket.s3.localhost.mimir.local`) |
| `*.localhost.mimir.local` | Direct subdomain style (`bucket.localhost.mimir.local`) |

DNS resolution works differently depending on where the client runs:

**From the host machine** — both `*.localhost.localstack.cloud` and `*.localhost.mimir.local` are registered in public DNS and resolve to `127.0.0.1`. Requests reach Mimir via the Docker port binding (`4566:4566`) with no extra configuration.

**From inside a Docker container** — `127.0.0.1` is the container's own loopback, not Mimir. Mimir's embedded DNS server handles this: it resolves `*.localhost.mimir.local` and `*.localhost.localstack.cloud` (and `*.localhost.localstack.cloud` subdomains) to Mimir's container IP on the Docker network. Spawned containers (Lambda, RDS, ElastiCache) are automatically configured to use Mimir as their DNS resolver, so virtual-hosted S3 URLs work inside them without any extra setup.

See [S3 → Virtual-Hosted Style](../services/s3.md#virtual-hosted-style) for full details and SDK examples.

## What stays the same

- Port `4566`
- All AWS SDK and CLI calls — no code changes
- Dummy credentials (`test` / `test`)
- Init scripts under `/etc/localstack/init/` (compat paths)
- `/_localstack/init` and `/_localstack/health` endpoints
- `/_aws/ses` and `/_aws/sqs/messages` inspection endpoints
- Docker socket mount for Lambda, RDS, and ElastiCache

## Known differences

| Area | LocalStack | Mimir |
|---|---|---|
| Lambda executor | Configurable (`LAMBDA_EXECUTOR`) | Always Docker containers |
| `LAMBDA_REMOTE_DOCKER` | Supported | Not supported — use per-function `S3Bucket=hot-reload` instead |
| Service selection | `SERVICES=sqs,s3,...` | All 41 services start automatically; no selection |
| Data directory | `/var/lib/localstack` | `/app/data` |
| Log variable | `LS_LOG` / `DEBUG` | `QUARKUS_LOG_LEVEL` |
