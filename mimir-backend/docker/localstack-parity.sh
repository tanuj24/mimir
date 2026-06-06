#!/bin/sh
# Maps LocalStack Community environment variables to their Mimir equivalents.
# Sourced by entrypoint.sh when LOCALSTACK_PARITY=true.
# Mimir vars always win: every mapping uses ${MIMIR_VAR:-<derived>} so an
# explicitly-set Mimir var is never overwritten.

# Storage mode — PERSISTENCE=1 / PERSIST_STATE=1 → persistent storage
if [ -n "${PERSISTENCE:-}" ] || [ -n "${PERSIST_STATE:-}" ]; then
    _ls_persist="${PERSISTENCE:-${PERSIST_STATE:-}}"
    if [ "${_ls_persist}" = "1" ] || [ "${_ls_persist}" = "true" ]; then
        export MIMIR_STORAGE_MODE="${MIMIR_STORAGE_MODE:-persistent}"
    fi
fi

# Bind port — EDGE_PORT → MIMIR_PORT
[ -n "${EDGE_PORT:-}" ] && export MIMIR_PORT="${MIMIR_PORT:-${EDGE_PORT}}"

# Hostname returned in response URLs — LOCALSTACK_HOST / LOCALSTACK_HOSTNAME → MIMIR_HOSTNAME
_ls_host="${LOCALSTACK_HOST:-${LOCALSTACK_HOSTNAME:-}}"
[ -n "${_ls_host}" ] && export MIMIR_HOSTNAME="${MIMIR_HOSTNAME:-${_ls_host}}"

# Bind address — GATEWAY_LISTEN → QUARKUS_HTTP_HOST
[ -n "${GATEWAY_LISTEN:-}" ] && export QUARKUS_HTTP_HOST="${QUARKUS_HTTP_HOST:-${GATEWAY_LISTEN}}"

# Log level — LS_LOG / DEBUG=1 → QUARKUS_LOG_LEVEL
if [ -n "${LS_LOG:-}" ]; then
    export QUARKUS_LOG_LEVEL="${QUARKUS_LOG_LEVEL:-${LS_LOG}}"
elif [ "${DEBUG:-}" = "1" ]; then
    export QUARKUS_LOG_LEVEL="${QUARKUS_LOG_LEVEL:-DEBUG}"
fi

# Lambda — LAMBDA_EXECUTOR is intentionally ignored; Mimir always runs Lambda in Docker containers.

# Lambda Docker network
[ -n "${LAMBDA_DOCKER_NETWORK:-}" ] && \
    export MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK="${MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK:-${LAMBDA_DOCKER_NETWORK}}"

# Lambda ephemeral containers
if [ "${LAMBDA_REMOVE_CONTAINERS:-}" = "1" ] || [ "${LAMBDA_REMOVE_CONTAINERS:-}" = "true" ]; then
    export MIMIR_SERVICES_LAMBDA_EPHEMERAL="${MIMIR_SERVICES_LAMBDA_EPHEMERAL:-true}"
fi

# LAMBDA_REMOTE_DOCKER — not fully supported.
# Mimir's hot-reload is per-function opt-in (S3Bucket=hot-reload), not a global bind-mount mode.
if [ -n "${LAMBDA_REMOTE_DOCKER:-}" ]; then
    echo "[mimir-parity] WARNING: LAMBDA_REMOTE_DOCKER is not fully supported by Mimir." >&2
    echo "[mimir-parity] Use S3Bucket=hot-reload per function instead. See https://mimir.local/docs/services/lambda" >&2
fi

# Docker host
[ -n "${DOCKER_HOST:-}" ] && export MIMIR_DOCKER_DOCKER_HOST="${MIMIR_DOCKER_DOCKER_HOST:-${DOCKER_HOST}}"

# Docker network — shared across all container-based services (Lambda, RDS, ElastiCache, MSK, OpenSearch, EKS).
# Per-service overrides (e.g. MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK) take precedence when set.
[ -n "${DOCKER_NETWORK:-}" ] && export MIMIR_SERVICES_DOCKER_NETWORK="${MIMIR_SERVICES_DOCKER_NETWORK:-${DOCKER_NETWORK}}"

# DNS suffixes — register LocalStack and Mimir hostname suffixes so that container-to-container
# hostname routing (Function URLs, presigned S3, SQS QueueUrl, etc.) works without manual config.
_parity_suffixes="localhost.localstack.cloud,localhost.mimir.local"
if [ -n "${MIMIR_DNS_EXTRA_SUFFIXES:-}" ]; then
    export MIMIR_DNS_EXTRA_SUFFIXES="${MIMIR_DNS_EXTRA_SUFFIXES},${_parity_suffixes}"
else
    export MIMIR_DNS_EXTRA_SUFFIXES="${_parity_suffixes}"
fi

# TLS — USE_SSL=1 → MIMIR_TLS_ENABLED=true
if [ "${USE_SSL:-0}" = "1" ]; then
    export MIMIR_TLS_ENABLED="${MIMIR_TLS_ENABLED:-true}"
fi

# TLS — CUSTOM_SSL_CERT_PATH → MIMIR_TLS_CERT_PATH + MIMIR_TLS_KEY_PATH
# LocalStack uses a single combined PEM (cert+key). Mimir accepts it in both fields.
if [ -n "${CUSTOM_SSL_CERT_PATH:-}" ]; then
    export MIMIR_TLS_CERT_PATH="${MIMIR_TLS_CERT_PATH:-${CUSTOM_SSL_CERT_PATH}}"
    export MIMIR_TLS_KEY_PATH="${MIMIR_TLS_KEY_PATH:-${CUSTOM_SSL_CERT_PATH}}"
fi

# SERVICES — intentionally ignored; Mimir starts all 41 services in ~24ms.
