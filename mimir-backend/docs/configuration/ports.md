# Ports Reference

## Port Overview

| Port / Range | Protocol | Purpose | docker-compose mapping required? |
|---|---|---|---|
| `4566` | HTTP | All AWS API calls (every service) | Yes |
| `5100–5199` | HTTP | ECR Registry sidecar — bound directly by the `registry:2` container | **No** (see note) |
| `6379–6399` | TCP | ElastiCache Redis proxy (inside Mimir) | Yes |
| `6500–6599` | HTTPS | EKS k3s API server — bound directly by each k3s container | **No** |
| `7001–7099` | TCP | RDS proxy (inside Mimir) | Yes |
| `9200–9299` | HTTP | Lambda Runtime API (internal, Docker-network only) | **No** |
| `9400–9499` | HTTP | OpenSearch data-plane — bound directly by each OpenSearch container | **No** |

## Why some ports don't need docker-compose mapping

There are two distinct patterns Mimir uses to expose container ports:

### Proxy-in-Mimir (ElastiCache, RDS)

Mimir runs a **TCP proxy process inside its own container**. The proxy listens on the host port and forwards traffic to the backend container.

```
host:6379  →  [docker-compose ports mapping]  →  Mimir container:6379  →  Redis container:6379
```

Because the listener is inside the Mimir container, `ports:` in `docker-compose.yml` is required to make it reachable from the host.

### Direct container binding (ECR, EKS, OpenSearch)

Mimir tells the Docker daemon to start a sidecar/service container and bind its port **directly on the host**. Mimir itself communicates with the container via the shared Docker network (container name + internal port). The host port is bound by Docker, not by Mimir.

```
host:9400  ←──  opensearch container:9200  (Docker binds 9400 directly on the host)
                        ↑
       Mimir reaches it via Docker network: mimir-opensearch-{name}:9200
```

No `docker-compose.yml` `ports:` mapping is needed — the port is already on the host.

## Port 4566 — AWS API

Every AWS SDK and CLI call goes to port `4566`. This includes all management-plane operations: creating queues, putting items, invoking Lambdas, etc.

```bash
aws s3 ls --endpoint-url http://localhost:4566
aws sqs list-queues --endpoint-url http://localhost:4566
aws lambda list-functions --endpoint-url http://localhost:4566
```

## Ports 6379–6399 — ElastiCache

When you create an ElastiCache replication group, Mimir starts a Valkey/Redis Docker container and creates a TCP proxy on the next available port in the `6379–6399` range. The proxy runs inside the Mimir container, so this range must be mapped in `docker-compose.yml`.

```bash
# Create a replication group
aws elasticache create-replication-group \
  --replication-group-id my-redis \
  --replication-group-description "dev cache" \
  --endpoint-url http://localhost:4566

# Connect directly on the proxied port (returned in DescribeReplicationGroups Endpoint.Port)
redis-cli -h localhost -p 6379
```

!!! note
    Configure the range with `MIMIR_SERVICES_ELASTICACHE_PROXY_BASE_PORT` and `MIMIR_SERVICES_ELASTICACHE_PROXY_MAX_PORT`.

## Ports 6500–6599 — EKS (real mode)

When you create an EKS cluster in real mode, Mimir asks the Docker daemon to start a k3s container and bind its API server port (6443) to the next available host port in `6500–6599`. The port is bound directly on the host by Docker — no `docker-compose.yml` mapping is needed.

The `endpoint` field returned by `DescribeCluster` points to `https://localhost:<hostPort>` when running outside a container, or `https://mimir-eks-<name>:6443` when Mimir is running inside Docker.

```bash
aws eks create-cluster \
  --name my-cluster \
  --role-arn arn:aws:iam::000000000000:role/eks-role \
  --resources-vpc-config subnetIds=[],securityGroupIds=[] \
  --endpoint-url http://localhost:4566

# DescribeCluster returns the API server address, e.g. https://localhost:6500
```

!!! note
    Configure the range with `MIMIR_SERVICES_EKS_API_SERVER_BASE_PORT` and `MIMIR_SERVICES_EKS_API_SERVER_MAX_PORT`.

## Ports 7001–7099 — RDS

When you create an RDS DB instance, Mimir starts a PostgreSQL or MySQL Docker container and creates a TCP proxy on the next available port in the `7001–7099` range. The proxy runs inside the Mimir container, so this range must be mapped in `docker-compose.yml`.

```bash
aws rds create-db-instance \
  --db-instance-identifier mydb \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password secret \
  --endpoint-url http://localhost:4566

# Connect using the proxied port (returned in DescribeDBInstances Endpoint.Port)
psql -h localhost -p 7001 -U admin
```

!!! note
    Configure the range with `MIMIR_SERVICES_RDS_PROXY_BASE_PORT` and `MIMIR_SERVICES_RDS_PROXY_MAX_PORT`.

## Ports 9200–9299 — Lambda Runtime API (internal)

Mimir binds a Runtime API port in `9200–9299` for each warm Lambda container to poll. These ports are consumed by containers on the shared Docker network only — they are never accessed from the host and must **not** be mapped in `docker-compose.yml`.

Configure the range with `MIMIR_SERVICES_LAMBDA_RUNTIME_API_BASE_PORT` and `MIMIR_SERVICES_LAMBDA_RUNTIME_API_MAX_PORT`.

## Ports 9400–9499 — OpenSearch (real mode)

When you create an OpenSearch domain in real mode, Mimir asks the Docker daemon to start an `opensearchproject/opensearch` container and bind its REST port (9200) to the next available host port in `9400–9499`. The port is bound directly on the host by Docker — no `docker-compose.yml` mapping is needed.

The `endpoint` field returned by `DescribeDomain` points to `http://localhost:<hostPort>` when running outside a container, or `http://mimir-opensearch-<name>:9200` when Mimir is running inside Docker.

```bash
aws opensearch create-domain \
  --domain-name my-search \
  --engine-version OpenSearch_2.11 \
  --endpoint-url http://localhost:4566

# DescribeDomain returns the data-plane address, e.g. http://localhost:9400
curl http://localhost:9400/_cluster/health
```

!!! note
    Configure the range with `MIMIR_SERVICES_OPENSEARCH_PROXY_BASE_PORT` and `MIMIR_SERVICES_OPENSEARCH_PROXY_MAX_PORT`.

## Ports 5100–5199 — ECR Registry

ECR is backed by a separate `registry:2` sidecar container (`mimir-ecr-registry`) that Mimir starts on the first ECR API call. That container binds its port directly on the host — **do not** add `5100-5199` to the mimir service's `ports` in Docker Compose. Doing so pre-allocates those ports on the Mimir container and prevents the sidecar from binding them.

```
host:5100  ←──  mimir-ecr-registry (registry:2 container, started by Mimir)
```

`docker login localhost:5100` works because the sidecar has a direct host port binding.

!!! warning "Do not expose ECR port range on the mimir service"
    Adding `- "5100-5199:5100-5199"` to the mimir service ports will conflict with the ECR sidecar and break `docker push` / `docker pull`.

## Exposing Ports in Docker Compose

Only the proxy-based services (ElastiCache and RDS) need port mappings in `docker-compose.yml`. Direct-binding services (ECR, EKS, OpenSearch) bind their ports on the host automatically via Docker:

```yaml
services:
  mimir:
    image: mimir/mimir:latest
    ports:
      - "4566:4566"           # All AWS API calls
      - "6379-6399:6379-6399" # ElastiCache / Redis proxy (proxy in Mimir)
      - "7001-7099:7001-7099" # RDS proxy (proxy in Mimir)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

EKS (6500–6599) and OpenSearch (9400–9499) ports are bound directly on the host by Docker and are accessible without any `ports:` entry. ECR (5100–5199) must not be added.

If your application runs inside the same Docker Compose network, it can reach Mimir directly on container port `4566` — the host port mapping is only needed for tools running on the host (CLI, IDE plugins, etc.).
