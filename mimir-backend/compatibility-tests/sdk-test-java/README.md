# sdk-test-java

Compatibility tests for [Mimir](https://github.com/mimir-local/mimir) using the **AWS SDK for Java v2 (2.31.8)**.

Runs 313 tests across 16 test classes against a live Mimir instance — no mocks.

## Services Covered

| Test class                       | Description                                              |
| -------------------------------- | -------------------------------------------------------- |
| `SsmTest`                        | Parameter Store — put, get, path, tags                   |
| `SqsTest`                        | Queues, send/receive/delete, DLQ, visibility             |
| `SnsTest`                        | Topics, subscriptions, publish, SQS delivery             |
| `S3Test`                         | Buckets, objects, tagging, copy, multipart, batch delete |
| `DynamoDbTest`                   | Tables, CRUD, batch, TTL, tags, streams                  |
| `DynamoDbScanConditionTests`     | Scan filter and condition expressions                    |
| `LambdaTest`                     | Create/invoke/update/delete functions                    |
| `IamTest`                        | Users, roles, policies, access keys                      |
| `StsTest`                        | GetCallerIdentity, AssumeRole, GetSessionToken           |
| `SecretsManagerTest`             | Create/get/put/list/delete secrets, versioning, tags     |
| `KmsTest`                        | Keys, aliases, encrypt/decrypt, data keys, sign/verify   |
| `CloudWatchTest`                 | PutMetricData, ListMetrics, GetMetricStatistics, alarms  |
| `CloudFormationVirtualHostTests` | Virtual host style S3 access via CloudFormation          |
| `ApigwSfnJsonataCrudlTests`      | API Gateway + Step Functions JSONata CRUDL integration   |
| `ApiGatewayV2WebSocketAndExtendedOpsTest` | API GW v2 WebSocket APIs, Update ops, Route/Integration Responses, Models, Tagging |
| `Ec2Tests`                       | EC2 instances, VPCs, security groups, subnets            |
| `EcsTests`                       | ECS clusters, task definitions, services                 |

## Adding a New Test

Create a standard JUnit 5 test class in `src/test/java/com/mimir/test/`. Tests run against a live Mimir instance using real AWS SDK clients.

## Requirements

- Java 17+
- Maven

## Running

```bash
# All tests
mvn test -q

# Specific test class
mvn test -Dtest=S3Test

# Via just (from compatibility-tests/)
just test-java
```

## Configuration

| Variable         | Default                 | Description             |
| ---------------- | ----------------------- | ----------------------- |
| `MIMIR_ENDPOINT` | `http://localhost:4566` | Mimir emulator endpoint |

AWS credentials are always `test` / `test` / `us-east-1`.

## Docker

```bash
docker build -t mimir-sdk-java .
docker run --rm --network host mimir-sdk-java

# Custom endpoint (macOS/Windows)
docker run --rm -e MIMIR_ENDPOINT=http://host.docker.internal:4566 mimir-sdk-java
```
