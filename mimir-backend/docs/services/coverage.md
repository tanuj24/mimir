# Service Coverage and Release Gates

Mimir does not claim that every AWS operation is implemented. Release quality is
tracked at three levels:

| Level | Meaning |
| --- | --- |
| Service health | The service is enabled and reports `running` from `/_mimir/health`. |
| Route smoke | At least one AWS CLI or SDK operation reaches the service and returns an AWS-shaped response. |
| Workflow parity | Common create/read/update/delete or event workflows are covered by integration or compatibility tests. |

The release smoke gate is intentionally fast and read-oriented. It checks that
every enabled service alias is reachable before publishing an image:

```bash
MIMIR_ENDPOINT=http://127.0.0.1:6565 tools/release-smoke.sh
```

The script requires the AWS CLI and uses the standard local credentials:

```bash
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1
```

## Smoke Operations

| Service alias | Smoke operation |
| --- | --- |
| `acm` | `acm list-certificates` |
| `apigateway` | `apigateway get-rest-apis` |
| `apigatewayv2` | `apigatewayv2 get-apis` |
| `appconfig` | `appconfig list-applications` |
| `appconfigdata` | `appconfigdata start-configuration-session` with placeholder ids; expects `ResourceNotFoundException` |
| `appsync` | `appsync list-graphql-apis` |
| `athena` | `athena list-work-groups` |
| `autoscaling` | `autoscaling describe-auto-scaling-groups` |
| `backup` | `backup list-backup-vaults` |
| `bcm-data-exports` | `bcm-data-exports list-exports` |
| `bedrock-runtime` | `bedrock-runtime invoke-model` |
| `ce` | `ce get-cost-and-usage` |
| `cloudformation` | `cloudformation list-stacks` |
| `cloudfront` | `cloudfront list-distributions` |
| `cloudwatch logs` | `logs describe-log-groups` |
| `cloudwatch metrics` | `cloudwatch list-metrics` |
| `codebuild` | `codebuild list-projects` |
| `codedeploy` | `deploy list-applications` |
| `cognito-idp` | `cognito-idp list-user-pools` |
| `config` | `configservice describe-configuration-recorders` |
| `cur` | `cur describe-report-definitions` |
| `dynamodb` | `dynamodb list-tables` |
| `ec2` | `ec2 describe-vpcs` |
| `ecr` | `ecr describe-repositories` |
| `ecs` | `ecs list-clusters` |
| `eks` | `eks list-clusters` |
| `elasticache` | `elasticache describe-cache-clusters` |
| `elbv2` | `elbv2 describe-load-balancers` |
| `eventbridge` | `events list-event-buses` |
| `firehose` | `firehose list-delivery-streams` |
| `glue` | `glue get-databases` |
| `iam` | `iam list-roles` |
| `kinesis` | `kinesis list-streams` |
| `kms` | `kms list-keys` |
| `lambda` | `lambda list-functions` |
| `msk` | `kafka list-clusters-v2` |
| `neptune` | `neptune describe-db-clusters` |
| `opensearch` | `opensearch list-domain-names` |
| `pipes` | `pipes list-pipes` |
| `pricing` | `pricing describe-services` |
| `rds` | `rds describe-db-instances` |
| `resourcegroupstaggingapi` | `resourcegroupstaggingapi get-resources` |
| `route53` | `route53 list-hosted-zones` |
| `s3` | `s3api list-buckets` |
| `scheduler` | `scheduler list-schedule-groups` |
| `secretsmanager` | `secretsmanager list-secrets` |
| `ses` | `ses list-identities` |
| `sesv2` | `sesv2 list-email-identities` |
| `sns` | `sns list-topics` |
| `sqs` | `sqs list-queues` |
| `ssm` | `ssm describe-parameters` |
| `states` | `stepfunctions list-state-machines` |
| `sts` | `sts get-caller-identity` |
| `textract` | `textract list-adapters` |
| `transcribe` | `transcribe list-transcription-jobs` |
| `transfer` | `transfer list-servers` |

## Release Standard

A release should not be advertised as improving coverage unless:

- `tools/release-smoke.sh` passes against the published image.
- New operations include unit or integration tests.
- Service docs describe important unsupported or stubbed behavior.
- Compatibility tests cover the common SDK or IaC workflow when behavior crosses services.

