# Mimir — Local AWS Cloud Emulator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub: v2 branch](https://img.shields.io/badge/GitHub-v2%20branch-blue)](https://github.com/tanuj24/mimir)

**Run 20+ AWS services locally. Serverless development, testing, and learning — completely free, no internet required.**

## What's Inside

Three production-ready images for a complete local AWS cloud:

| Image | Purpose | Size |
|-------|---------|------|
| `tanujsoni027/mimir-aws:backend` | AWS service emulator (Quarkus) | ~515 MB |
| `tanujsoni027/mimir-aws:server` | API proxy + Glue execution engine | ~299 MB |
| `tanujsoni027/mimir-aws:web` | AWS-style console UI | ~62 MB |

## Get Started in 30 seconds

```bash
git clone https://github.com/tanuj24/mimir.git
cd mimir
docker compose up -d
# Open http://localhost:8080
```

That's it. No config, no keys, no internet needed.

## What You Get

### Real Runtimes
- **Lambda**: Runs on actual Firecracker runtime — your code executes unchanged
- **Glue**: Uses official AWS Glue runtime images — real `awsglue`, `boto3`, Spark

### 20+ AWS Services
**Storage & Database:**
- S3, DynamoDB, RDS, ElastiCache, OpenSearch

**Compute:**
- Lambda, EC2, ECS, EKS, ECR

**Application Integration:**
- SQS, SNS, API Gateway, EventBridge, Kinesis, Step Functions

**Analytics:**
- Glue (jobs + notebooks + catalog), Athena

**Management:**
- CloudWatch Logs/Metrics, IAM, Secrets Manager, Systems Manager, CloudFormation

**+ More:** KMS, Cognito, Cost Explorer, and many others

### Interactive Console
- Click services, view resources, create/update/delete without CLI
- Live logs and metrics
- Function code editor and test runner
- Notebook cells (stateful Glue sessions)

### AWS-Compatible
```bash
# Use your existing AWS CLI/SDK — point to localhost:4566
aws --endpoint-url http://localhost:4566 s3 mb s3://my-bucket
aws --endpoint-url http://localhost:4566 s3 ls

# Works with boto3, AWS SDK for Node.js, etc.
```

## Use Cases

✓ **Local Development** — Build Lambda, Glue, DynamoDB apps without AWS account  
✓ **Testing & CI/CD** — Run integration tests for free, instantly  
✓ **Learning AWS** — Explore services hands-on in a safe sandbox  
✓ **Offline Work** — Code on planes, trains, anywhere without internet  
✓ **Cost Savings** — Unlimited free usage; no AWS bills  
✓ **Prototyping** — Validate cloud architecture before deployment  

## Compared to Alternatives

### vs LocalStack
- ✓ Real Lambda runtime (Firecracker), not mocked
- ✓ Real Glue runtime + console; LocalStack doesn't support Glue
- ✓ Built-in console UI; LocalStack requires paid version
- ✓ Single bundled repo; LocalStack is separate

### vs AWS SAM
- ✓ Runs actual code; SAM is a framework
- ✓ Full AWS console; SAM is CLI-only
- ✓ 20+ services; SAM focuses on Lambda

### vs Docker + manual setup
- ✓ Zero config; Docker requires orchestration
- ✓ Console + APIs; Docker is headless
- ✓ AWS-compatible; Docker is generic

## Multi-Arch Support

All images are built for **both** `amd64` (Intel/AMD) and `arm64` (Apple Silicon, ARM servers):
- Pull once, runs on Mac, Linux, Windows (via WSL2), cloud VMs
- No emulation overhead on Apple Silicon

## Quick Examples

### Create & invoke a Lambda function
```bash
# Via console: http://localhost:8080 → Lambda → Create function
# Or via AWS CLI:
aws --endpoint-url http://localhost:4566 lambda create-function \
  --function-name hello \
  --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/service-role/default \
  --handler index.handler \
  --zip-file fileb://function.zip

aws --endpoint-url http://localhost:4566 lambda invoke \
  --function-name hello \
  --payload '{"name":"world"}' \
  output.json
```

### Run a Glue job locally
```bash
# Create a Glue job in the console with your PySpark script
# Or write a script that runs against the Glue Catalog
import boto3
glue = boto3.client('glue', endpoint_url='http://localhost:4566')
glue.start_job_run(JobName='my-etl-job')
```

### Test DynamoDB code
```bash
# Create a table via console or AWS CLI
aws --endpoint-url http://localhost:4566 dynamodb create-table \
  --table-name users \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Your Python/Node.js app points to http://localhost:4566
```

## Development vs Production

### For Users (Pull Prebuilt Images)
```bash
docker compose up -d
# Pulls tanujsoni027/mimir-aws:* from Docker Hub — instant start
```

### For Contributors (Build from Source)
```bash
docker compose up -d --build
# Rebuilds from mimir-backend/, server/, web/ sources
```

## How It Works

**mimir-backend** (Quarkus):
- Emulates AWS APIs (S3, Lambda, DynamoDB, etc.)
- Runs real AWS services as Docker containers (Lambda on Firecracker, RDS on PostgreSQL, etc.)
- Exposes port 4566 (AWS edge endpoint)

**mimir-server** (Node.js Express):
- Proxies requests to the backend
- Runs Glue jobs + interactive notebooks locally in Docker
- Streams live logs, metrics

**mimir-web** (React + Vite):
- Interactive console UI (no CLIs needed)
- Code editor, test runner, resource browser
- Works in any modern browser

All three communicate over Docker's internal network; port 4566 is the only exposed entry point.

## Supported Architectures

- `linux/amd64` — Intel, AMD, most cloud servers
- `linux/arm64` — Apple Silicon (M1/M2/M3), Raspberry Pi, ARM VMs

```bash
docker run --platform linux/amd64 tanujsoni027/mimir-aws:backend  # Force amd64
docker run --platform linux/arm64 tanujsoni027/mimir-aws:backend  # Force arm64
```

## FAQ

**Q: Is this production-ready?**  
A: Mimir is for **development and testing**. It emulates AWS APIs but doesn't scale like AWS. Use it to iterate locally, test before pushing to AWS.

**Q: Can I use my existing AWS code?**  
A: Yes! Point your AWS SDK to `http://localhost:4566` and use the same code. Most code runs unchanged (except features Mimir doesn't emulate yet).

**Q: Does it require internet?**  
A: No. Once images are pulled, everything runs locally.

**Q: How much disk space?**  
A: ~1 GB for images + runtime data. Data persists in Docker volumes between runs.

**Q: Can I run this in CI/CD?**  
A: Yes. Pull the images in your CI, start with `docker compose up -d`, run tests, tear down. Perfect for integration tests.

**Q: What if a service isn't in the console?**  
A: The backend emulates 50+ services; the console UI covers the most popular ones. CLI/SDK access works for all.

## Links

- **GitHub**: https://github.com/tanuj24/mimir
- **GitHub Docs**: https://github.com/tanuj24/mimir#readme
- **Issue Tracker**: https://github.com/tanuj24/mimir/issues
- **Discussions**: https://github.com/tanuj24/mimir/discussions

## License

[MIT License](https://github.com/tanuj24/mimir/blob/main/LICENSE) — free to use, modify, distribute.

---

**Latest:** v2 — Real runtimes, bundled backend, prebuilt multi-arch images. [See changes](https://github.com/tanuj24/mimir/releases/tag/v2.0.0).
