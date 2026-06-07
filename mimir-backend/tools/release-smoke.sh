#!/usr/bin/env bash
set -uo pipefail

ENDPOINT="${MIMIR_ENDPOINT:-http://127.0.0.1:6565}"
AWS_CLI="${AWS_CLI:-aws}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

export AWS_DEFAULT_REGION="$REGION"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_EC2_METADATA_DISABLED=true

TMPDIR="$(mktemp -d)"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

log_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS %-28s %s\n' "$1" "$2"
}

log_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL %-28s %s\n' "$1" "$2"
}

log_skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  printf 'SKIP %-28s %s\n' "$1" "$2"
}

run() {
  local service="$1"
  shift
  local output
  if output="$("$AWS_CLI" --endpoint-url="$ENDPOINT" "$@" 2>&1)"; then
    log_pass "$service" "$*"
  else
    log_fail "$service" "$output"
  fi
}

expect_error() {
  local service="$1"
  local expected="$2"
  shift 2
  local output
  if output="$("$AWS_CLI" --endpoint-url="$ENDPOINT" "$@" 2>&1)"; then
    log_pass "$service" "$*"
  elif printf '%s' "$output" | grep -q "$expected"; then
    log_pass "$service" "reachable; returned expected $expected"
  else
    log_fail "$service" "$output"
  fi
}

if ! command -v "$AWS_CLI" >/dev/null 2>&1; then
  log_fail "awscli" "AWS CLI command not found: $AWS_CLI"
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 10 "$ENDPOINT/_mimir/health" >"$TMPDIR/health.json"; then
    log_pass "health" "$ENDPOINT/_mimir/health"
  else
    log_fail "health" "cannot reach $ENDPOINT/_mimir/health"
  fi
else
  log_skip "health" "curl not installed"
fi

printf 'test' >"$TMPDIR/textract.bin"

run "s3" s3api list-buckets
run "sqs" sqs list-queues
run "sns" sns list-topics
run "dynamodb" dynamodb list-tables
run "lambda" lambda list-functions
run "iam" iam list-roles
run "sts" sts get-caller-identity
run "ssm" ssm describe-parameters
run "secretsmanager" secretsmanager list-secrets
run "kinesis" kinesis list-streams
run "kms" kms list-keys
run "cognito-idp" cognito-idp list-user-pools --max-results 10
run "states" stepfunctions list-state-machines
run "cloudformation" cloudformation list-stacks
run "acm" acm list-certificates
run "athena" athena list-work-groups
run "glue" glue get-databases
run "firehose" firehose list-delivery-streams
run "ses" ses list-identities
run "sesv2" sesv2 list-email-identities
run "ec2" ec2 describe-vpcs
run "ecs" ecs list-clusters
run "ecr" ecr describe-repositories
run "elbv2" elbv2 describe-load-balancers
run "autoscaling" autoscaling describe-auto-scaling-groups
run "backup" backup list-backup-vaults
run "route53" route53 list-hosted-zones
run "cloudfront" cloudfront list-distributions
run "appsync" appsync list-graphql-apis
run "codebuild" codebuild list-projects
run "codedeploy" deploy list-applications
run "config" configservice describe-configuration-recorders
run "pricing" pricing describe-services
run "transcribe" transcribe list-transcription-jobs
run "textract" textract list-adapters
run "ce" ce get-cost-and-usage --time-period Start=2026-06-01,End=2026-06-02 --granularity DAILY --metrics UnblendedCost
run "eks" eks list-clusters
run "pipes" pipes list-pipes
run "appconfig" appconfig list-applications
expect_error "appconfigdata" "ResourceNotFoundException" appconfigdata start-configuration-session --application-identifier x --environment-identifier y --configuration-profile-identifier z
run "bedrock-runtime" bedrock-runtime invoke-model --model-id test --body '{}' "$TMPDIR/bedrock.out"
run "opensearch" opensearch list-domain-names
run "rds" rds describe-db-instances
run "apigateway" apigateway get-rest-apis
run "apigatewayv2" apigatewayv2 get-apis
run "events" events list-event-buses
run "scheduler" scheduler list-schedule-groups
run "logs" logs describe-log-groups
run "monitoring" cloudwatch list-metrics
run "kafka" kafka list-clusters-v2
run "elasticache" elasticache describe-cache-clusters
run "neptune" neptune describe-db-clusters
run "transfer" transfer list-servers
run "cur" cur describe-report-definitions
run "bcm-data-exports" bcm-data-exports list-exports
run "tagging" resourcegroupstaggingapi get-resources

printf '\nSummary: %s passed, %s failed, %s skipped\n' "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT"

if [ "$FAIL_COUNT" -ne 0 ]; then
  exit 1
fi
