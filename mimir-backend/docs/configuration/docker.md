# Docker Configuration

Mimir spawns real Docker containers for services that need them: Lambda, RDS, ElastiCache, OpenSearch, MSK, and ECS. All of these share the same Docker client configuration, controlled under `mimir.docker`.

## Docker Daemon Socket

By default Mimir connects to the local Docker daemon via the Unix socket. Override it with `docker-host` when needed (e.g. a remote Docker host or a non-standard socket path):

```yaml
mimir:
  docker:
    docker-host: unix:///var/run/docker.sock
```

Environment variable: `MIMIR_DOCKER_DOCKER_HOST`

When running Mimir inside Docker Compose, mount the host socket:

```yaml
services:
  mimir:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Private Registry Authentication

Any service that pulls a container image from a private registry (Lambda image functions, custom OpenSearch images, private Postgres images, etc.) needs Docker credentials. Two approaches are supported and can be combined.

### Mount the host Docker config

Reuses existing `docker login` sessions and credential helpers from the host machine. Mount the host `~/.docker` directory and point Mimir at it:

```yaml
services:
  mimir:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ~/.docker:/root/.docker:ro
    environment:
      MIMIR_DOCKER_DOCKER_CONFIG_PATH: /root/.docker
```

Or in `application.yml`:

```yaml
mimir:
  docker:
    docker-config-path: /root/.docker
```

This works with any credential helper configured on the host (`docker-credential-desktop`, `ecr-credential-helper`, etc.) as long as the helper binary is also available inside the Mimir container.

### Explicit per-registry credentials

For CI environments or air-gapped setups where mounting the host filesystem is not practical:

```yaml
services:
  mimir:
    environment:
      MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__SERVER: myregistry.example.com
      MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__USERNAME: myuser
      MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__PASSWORD: mypassword
      # Add more registries by incrementing the index:
      # MIMIR_DOCKER_REGISTRY_CREDENTIALS_1__SERVER: other.registry.io
      # MIMIR_DOCKER_REGISTRY_CREDENTIALS_1__USERNAME: ...
      # MIMIR_DOCKER_REGISTRY_CREDENTIALS_1__PASSWORD: ...
```

Or in `application.yml`:

```yaml
mimir:
  docker:
    registry-credentials:
      - server: myregistry.example.com
        username: myuser
        password: mypassword
      - server: other.registry.io
        username: otheruser
        password: otherpassword
```

The `server` field must match the registry hostname exactly as it appears in the image URI (e.g. `myregistry.example.com` for `myregistry.example.com/repo:tag`). Docker Hub images (e.g. `ubuntu:22.04`) have an empty hostname and are not matched by any explicit credential entry — use the Docker config mount approach for Docker Hub authentication.

### Precedence

Explicit credentials take precedence for registries they cover. For everything else, Mimir falls back to the Docker config file (if `docker-config-path` is set) and then to an anonymous pull.

## Container Log Settings

Configure log rotation for all containers spawned by Mimir:

```yaml
mimir:
  docker:
    log-max-size: "10m"   # Max size per log file before rotation (Docker json-file format)
    log-max-file: "3"     # Number of rotated log files to retain per container
```

## Docker Network

Containers spawned by Mimir (Lambda, RDS, ElastiCache, OpenSearch, MSK, ECS) need to be on the same Docker network to communicate with each other and with Mimir itself.

When Mimir itself runs inside Docker and no network is configured, it automatically detects the current container's Docker network and uses it for spawned containers. You only need to set this manually when you want to force a specific network.

Set the shared network at the top level:

```yaml
mimir:
  services:
    docker-network: my-project_default
```

Environment variable: `MIMIR_SERVICES_DOCKER_NETWORK`

Individual services can override the network with their own `docker-network` setting (e.g. `mimir.services.lambda.docker-network`).

!!! tip
    In Docker Compose, the default network name is `<project-name>_default`. If your compose file is in a directory named `myapp`, the network is `myapp_default`.

## Full Reference

| Environment variable | Default | Description |
|---|---|---|
| `MIMIR_DOCKER_DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker daemon socket |
| `MIMIR_DOCKER_DOCKER_CONFIG_PATH` | _(unset)_ | Path to directory containing Docker's `config.json` |
| `MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__SERVER` | _(unset)_ | Registry hostname for credential entry 0 |
| `MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__USERNAME` | _(unset)_ | Username for credential entry 0 |
| `MIMIR_DOCKER_REGISTRY_CREDENTIALS_0__PASSWORD` | _(unset)_ | Password for credential entry 0 |
| `MIMIR_DOCKER_LOG_MAX_SIZE` | `10m` | Max container log file size before rotation |
| `MIMIR_DOCKER_LOG_MAX_FILE` | `3` | Number of rotated log files to retain |
| `MIMIR_SERVICES_DOCKER_NETWORK` | _(unset)_ | Shared Docker network for all container-based services |
