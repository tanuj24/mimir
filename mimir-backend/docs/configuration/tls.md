# TLS / HTTPS

Mimir supports optional TLS, enabling `https://` for all REST/JSON/Query endpoints and `wss://` for WebSocket connections. Both HTTP and HTTPS are served simultaneously (LocalStack parity).

## Quick Start

```bash
docker run -e MIMIR_TLS_ENABLED=true -p 4566:4566 mimir/mimir:latest
```

Then point your SDK at `https://localhost:4566`. Since the certificate is self-signed, disable TLS verification in your client:

```bash
# AWS CLI
aws --endpoint-url https://localhost:4566 --no-verify-ssl sts get-caller-identity

# Node.js
NODE_TLS_REJECT_UNAUTHORIZED=0 node app.js

# Python (boto3)
import boto3
client = boto3.client('sts', endpoint_url='https://localhost:4566', verify=False)
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MIMIR_TLS_ENABLED` | `false` | Enable TLS/HTTPS on the server |
| `MIMIR_TLS_CERT_PATH` | *(unset)* | Path to PEM certificate file |
| `MIMIR_TLS_KEY_PATH` | *(unset)* | Path to PEM private key file |
| `MIMIR_TLS_SELF_SIGNED` | `true` | Auto-generate a self-signed certificate when no cert/key paths provided |

## Self-Signed Certificate

When `MIMIR_TLS_ENABLED=true` and no custom certificate is provided, Mimir auto-generates a self-signed certificate at startup. The certificate:

- Is persisted to `{persistent-path}/tls/` and reused across restarts
- Includes `localhost`, `127.0.0.1`, `0.0.0.0`, `*.localhost`, `localhost.mimir.local`, and `*.localhost.mimir.local` as Subject Alternative Names (SANs)
- Automatically includes custom hostnames from `MIMIR_HOSTNAME` and `MIMIR_BASE_URL` in the SANs
- Is regenerated when hostname configuration changes between restarts

### Custom Hostname Support

If you set `MIMIR_HOSTNAME` or use a custom host in `MIMIR_BASE_URL`, the self-signed certificate automatically includes those hostnames in its SANs. This is essential for Docker Compose setups where containers reference Mimir by service name:

```yaml
services:
  mimir:
    image: mimir/mimir:latest
    environment:
      MIMIR_TLS_ENABLED: "true"
      MIMIR_HOSTNAME: mimir
    ports:
      - "4566:4566"

  app:
    environment:
      AWS_ENDPOINT_URL: "https://mimir:4566"
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
```

The generated certificate will include `mimir` in its SANs, so TLS validation succeeds when `app` connects to `https://mimir:4566`.

## User-Provided Certificates

To use your own certificate (e.g., from a corporate CA or mkcert):

```bash
docker run \
  -e MIMIR_TLS_ENABLED=true \
  -e MIMIR_TLS_CERT_PATH=/certs/server.crt \
  -e MIMIR_TLS_KEY_PATH=/certs/server.key \
  -v ./certs:/certs:ro \
  -p 4566:4566 \
  mimir/mimir:latest
```

When custom certificate paths are provided, `MIMIR_TLS_SELF_SIGNED` is ignored and no self-signed certificate is generated.

## WebSocket (wss://)

When TLS is enabled, WebSocket connections automatically use `wss://`:

```
wss://localhost:4566/ws/{apiId}/{stage}
```

No additional configuration is needed — Vert.x handles TLS at the transport layer transparently.

## SDK Configuration Examples

### AWS SDK for JavaScript v3

```typescript
import { STSClient } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'node:https';

const client = new STSClient({
  endpoint: 'https://localhost:4566',
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  requestHandler: new NodeHttpHandler({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  }),
});
```

Or set the environment variable globally:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx vitest run
```

### AWS SDK for Java v2

```java
SdkHttpClient httpClient = ApacheHttpClient.builder()
    .tlsTrustManagersProvider(() -> {
        TrustManager[] trustAll = new TrustManager[]{
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                public void checkServerTrusted(X509Certificate[] certs, String authType) {}
            }
        };
        return trustAll;
    })
    .build();

StsClient sts = StsClient.builder()
    .endpointOverride(URI.create("https://localhost:4566"))
    .httpClient(httpClient)
    .build();
```

### Python (boto3)

```python
import boto3

client = boto3.client(
    'sts',
    endpoint_url='https://localhost:4566',
    verify=False,  # Disable TLS verification for self-signed cert
    region_name='us-east-1',
    aws_access_key_id='test',
    aws_secret_access_key='test',
)
```

## When Do I Need to Disable TLS Verification?

| Certificate type | Verification disabled? | Why |
|-----------------|----------------------|-----|
| Mimir self-signed (default) | **Yes** — `NODE_TLS_REJECT_UNAUTHORIZED=0`, `verify=False`, etc. | The self-signed CA is not in your system's trust store |
| `mkcert` with local CA installed | **No** | `mkcert -install` adds its root CA to the OS trust store |
| Corporate/internal CA already trusted | **No** | Your OS or JVM already trusts the issuing CA |
| Public CA (Let's Encrypt, etc.) | **No** | Trusted by default in all runtimes |

In short: you only need to disable verification when the certificate's issuer is **not** in the client's trust chain. If you provide your own certificate via `MIMIR_TLS_CERT_PATH` and its CA is already trusted by your system, no extra client configuration is needed.

## Troubleshooting

**Certificate errors after changing `MIMIR_HOSTNAME`.**
Mimir detects hostname configuration changes and regenerates the certificate automatically. If you still see errors, delete the `{persistent-path}/tls/` directory and restart.

**`DEPTH_ZERO_SELF_SIGNED_CERT` in Node.js.**
This only happens with self-signed certificates. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` or configure a custom HTTPS agent that skips verification. If you use `mkcert` and ran `mkcert -install`, this error should not occur.

**Java `SSLHandshakeException: PKIX path building failed`.**
For self-signed certificates: configure a trust-all TrustManager as shown above, or import the certificate into your JVM's truststore with `keytool -importcert`. For user-provided certificates from a trusted CA, this should not occur.

**Certificate doesn't include my custom hostname.**
Ensure `MIMIR_HOSTNAME` or `MIMIR_BASE_URL` is set *before* Mimir starts. The certificate is generated during startup. Check the logs for `TLS: detected custom hostnames: [...]`.
