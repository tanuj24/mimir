#!/bin/sh
# Unit tests for localstack-parity.sh.
# Run directly: sh docker/test-localstack-parity.sh
# Exit 0 on success, non-zero on first failure.

set -eu

SCRIPT="$(dirname "$0")/localstack-parity.sh"
PASS=0
FAIL=0

# Run the parity script in a subshell with a given environment and print the
# value of a single variable. Arguments: VAR_NAME [ENV_KEY=VALUE ...]
_run() {
    var="$1"; shift
    env -i "$@" sh -c ". '${SCRIPT}'; printf '%s' \"\${${var}:-}\""
}

# Assert that _run produces an expected value.
assert_eq() {
    desc="$1"; expected="$2"; actual="$3"
    if [ "${actual}" = "${expected}" ]; then
        printf '[PASS] %s\n' "${desc}"
        PASS=$((PASS + 1))
    else
        printf '[FAIL] %s\n  expected: %s\n  actual:   %s\n' "${desc}" "${expected}" "${actual}"
        FAIL=$((FAIL + 1))
    fi
}

# --- PERSISTENCE ---
assert_eq "PERSISTENCE=1 sets MIMIR_STORAGE_MODE=persistent" \
    "persistent" \
    "$(_run MIMIR_STORAGE_MODE PERSISTENCE=1)"

assert_eq "PERSISTENCE=true sets MIMIR_STORAGE_MODE=persistent" \
    "persistent" \
    "$(_run MIMIR_STORAGE_MODE PERSISTENCE=true)"

assert_eq "PERSIST_STATE=1 sets MIMIR_STORAGE_MODE=persistent" \
    "persistent" \
    "$(_run MIMIR_STORAGE_MODE PERSIST_STATE=1)"

assert_eq "MIMIR_STORAGE_MODE wins over PERSISTENCE" \
    "hybrid" \
    "$(_run MIMIR_STORAGE_MODE PERSISTENCE=1 MIMIR_STORAGE_MODE=hybrid)"

# --- EDGE_PORT ---
assert_eq "EDGE_PORT sets MIMIR_PORT" \
    "4567" \
    "$(_run MIMIR_PORT EDGE_PORT=4567)"

assert_eq "MIMIR_PORT wins over EDGE_PORT" \
    "4568" \
    "$(_run MIMIR_PORT EDGE_PORT=4567 MIMIR_PORT=4568)"

# --- LOCALSTACK_HOST / LOCALSTACK_HOSTNAME ---
assert_eq "LOCALSTACK_HOST sets MIMIR_HOSTNAME" \
    "myhost" \
    "$(_run MIMIR_HOSTNAME LOCALSTACK_HOST=myhost)"

assert_eq "LOCALSTACK_HOSTNAME sets MIMIR_HOSTNAME when LOCALSTACK_HOST unset" \
    "myhost2" \
    "$(_run MIMIR_HOSTNAME LOCALSTACK_HOSTNAME=myhost2)"

assert_eq "LOCALSTACK_HOST takes priority over LOCALSTACK_HOSTNAME" \
    "primary" \
    "$(_run MIMIR_HOSTNAME LOCALSTACK_HOST=primary LOCALSTACK_HOSTNAME=secondary)"

assert_eq "MIMIR_HOSTNAME wins over LOCALSTACK_HOST" \
    "explicit" \
    "$(_run MIMIR_HOSTNAME LOCALSTACK_HOST=myhost MIMIR_HOSTNAME=explicit)"

# --- GATEWAY_LISTEN ---
assert_eq "GATEWAY_LISTEN sets QUARKUS_HTTP_HOST" \
    "0.0.0.0" \
    "$(_run QUARKUS_HTTP_HOST GATEWAY_LISTEN=0.0.0.0)"

# --- LOG LEVEL ---
assert_eq "LS_LOG sets QUARKUS_LOG_LEVEL" \
    "WARN" \
    "$(_run QUARKUS_LOG_LEVEL LS_LOG=WARN)"

assert_eq "DEBUG=1 sets QUARKUS_LOG_LEVEL=DEBUG" \
    "DEBUG" \
    "$(_run QUARKUS_LOG_LEVEL DEBUG=1)"

assert_eq "LS_LOG takes priority over DEBUG=1" \
    "TRACE" \
    "$(_run QUARKUS_LOG_LEVEL LS_LOG=TRACE DEBUG=1)"

assert_eq "QUARKUS_LOG_LEVEL wins over LS_LOG" \
    "INFO" \
    "$(_run QUARKUS_LOG_LEVEL LS_LOG=DEBUG QUARKUS_LOG_LEVEL=INFO)"

# --- LAMBDA ---
assert_eq "LAMBDA_DOCKER_NETWORK sets MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK" \
    "mynet" \
    "$(_run MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK LAMBDA_DOCKER_NETWORK=mynet)"

assert_eq "MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK wins over LAMBDA_DOCKER_NETWORK" \
    "mimir-net" \
    "$(_run MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK LAMBDA_DOCKER_NETWORK=mynet MIMIR_SERVICES_LAMBDA_DOCKER_NETWORK=mimir-net)"

assert_eq "LAMBDA_REMOVE_CONTAINERS=1 sets MIMIR_SERVICES_LAMBDA_EPHEMERAL=true" \
    "true" \
    "$(_run MIMIR_SERVICES_LAMBDA_EPHEMERAL LAMBDA_REMOVE_CONTAINERS=1)"

assert_eq "LAMBDA_REMOVE_CONTAINERS=true sets MIMIR_SERVICES_LAMBDA_EPHEMERAL=true" \
    "true" \
    "$(_run MIMIR_SERVICES_LAMBDA_EPHEMERAL LAMBDA_REMOVE_CONTAINERS=true)"

assert_eq "MIMIR_SERVICES_LAMBDA_EPHEMERAL wins over LAMBDA_REMOVE_CONTAINERS" \
    "false" \
    "$(_run MIMIR_SERVICES_LAMBDA_EPHEMERAL LAMBDA_REMOVE_CONTAINERS=1 MIMIR_SERVICES_LAMBDA_EPHEMERAL=false)"

# --- DOCKER HOST / NETWORK ---
assert_eq "DOCKER_HOST sets MIMIR_DOCKER_DOCKER_HOST" \
    "unix:///var/run/docker.sock" \
    "$(_run MIMIR_DOCKER_DOCKER_HOST DOCKER_HOST=unix:///var/run/docker.sock)"

assert_eq "DOCKER_NETWORK sets MIMIR_SERVICES_DOCKER_NETWORK" \
    "shared" \
    "$(_run MIMIR_SERVICES_DOCKER_NETWORK DOCKER_NETWORK=shared)"

assert_eq "MIMIR_SERVICES_DOCKER_NETWORK wins over DOCKER_NETWORK" \
    "override" \
    "$(_run MIMIR_SERVICES_DOCKER_NETWORK DOCKER_NETWORK=shared MIMIR_SERVICES_DOCKER_NETWORK=override)"

# --- DNS SUFFIXES ---
assert_eq "DNS suffixes set when MIMIR_DNS_EXTRA_SUFFIXES unset" \
    "localhost.localstack.cloud,localhost.mimir.local" \
    "$(_run MIMIR_DNS_EXTRA_SUFFIXES)"

assert_eq "DNS suffixes appended to existing MIMIR_DNS_EXTRA_SUFFIXES" \
    "custom.internal,localhost.localstack.cloud,localhost.mimir.local" \
    "$(_run MIMIR_DNS_EXTRA_SUFFIXES MIMIR_DNS_EXTRA_SUFFIXES=custom.internal)"

# --- Summary ---
printf '\nResults: %d passed, %d failed\n' "${PASS}" "${FAIL}"
[ "${FAIL}" -eq 0 ]
