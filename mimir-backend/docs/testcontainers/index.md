# Testcontainers

Mimir has first-class Testcontainers modules for every major SDK language. Each module starts a real Mimir container before your tests run and tears it down after — no running daemon, no shared state, no port conflicts.

## Available modules

| Language | Package | Version | Registry | Source |
|---|---|---|---|---|
| Java | `io.mimir:testcontainers-mimir` | `1.4.0` | [Maven Central](https://mvnrepository.com/artifact/io.mimir/testcontainers-mimir) | [GitHub](https://github.com/mimir-io/testcontainers-mimir) |
| Node.js | `@mimir/testcontainers` | `0.1.0` | [npm](https://www.npmjs.com/package/@mimir/testcontainers) | [GitHub](https://github.com/mimir-io/testcontainers-mimir-node) |
| Python | `testcontainers-mimir` | `0.1.1` | [PyPI](https://pypi.org/project/testcontainers-mimir/) | [GitHub](https://github.com/mimir-io/testcontainers-mimir-python) |
| Go | — | 🚧 In progress | — | [GitHub](https://github.com/mimir-io/testcontainers-mimir-go) |

## How it works

Every module exposes a `MimirContainer` class that wraps the official `mimir/mimir:latest` Docker image. When the container starts it waits for port 4566 to be ready, then exposes:

| Method | Returns |
|---|---|
| `getEndpoint()` | `http://localhost:<mapped-port>` |
| `getRegion()` | `us-east-1` (default) |
| `getAccessKey()` | `test` |
| `getSecretKey()` | `test` |

You pass these values directly into any AWS SDK client — no manual configuration, no environment variables.

## Language guides

- [Java](java.md) — JUnit 5, Spring Boot `@ServiceConnection`
- [Node.js / TypeScript](nodejs.md) — Jest, Vitest
- [Python](python.md) — pytest
- [Go](go.md) — in progress
