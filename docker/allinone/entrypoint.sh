#!/bin/bash
# All-in-one entrypoint: run the Mimir backend (Quarkus), the proxy server
# (Node), and the console (nginx) together in one container.
set -u

mkdir -p /run/nginx /app/data /tmp/mimir-glue

pids=()
term() {
  echo "[mimir] shutting down…"
  kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap term TERM INT

# 1) Backend (local AWS cloud) on :4566
echo "[mimir] starting backend…"
( cd /app/backend && exec java --enable-native-access=ALL-UNNAMED -jar quarkus-app/quarkus-run.jar ) &
pids+=($!)

# Wait for the backend edge to come up before starting the proxy.
echo "[mimir] waiting for backend health…"
for _ in $(seq 1 90); do
  if wget -q --spider http://127.0.0.1:4566/_mimir/health 2>/dev/null; then
    echo "[mimir] backend ready."
    break
  fi
  sleep 1
done

# 2) Proxy server + Glue engine on :4000
echo "[mimir] starting server…"
( cd /app/server && exec node dist/index.js ) &
pids+=($!)

# 3) Console (nginx) on :80
echo "[mimir] starting web console…"
nginx -g 'daemon off;' &
pids+=($!)

echo "[mimir] up — open http://localhost:8080"

# If any of the three exits, tear the whole container down so Docker restarts it.
wait -n
echo "[mimir] a service exited; stopping container."
term
