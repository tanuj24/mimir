import { config } from "../config.js";

/**
 * Common config shape accepted by every AWS SDK v3 client constructor.
 * Every client is pointed at the Floci endpoint with dummy credentials.
 */
export interface FlociClientConfig {
  region: string;
  endpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  forcePathStyle?: boolean;
}

export interface ClientOptions {
  /** Per-request region override (e.g. from the UI region selector). */
  region?: string;
  /** S3 needs path-style addressing against a local endpoint. */
  forcePathStyle?: boolean;
  /** Override the Floci endpoint (e.g. the browser-facing one for presigning). */
  endpoint?: string;
}

/**
 * Generic factory: pass any AWS SDK v3 client class and get an instance
 * wired to Floci. Keeps every service route module a one-liner.
 *
 *   const s3 = makeClient(S3Client, { forcePathStyle: true });
 */
export function makeClient<T>(
  ClientCtor: new (cfg: FlociClientConfig) => T,
  opts: ClientOptions = {},
): T {
  return new ClientCtor({
    region: opts.region ?? config.region,
    endpoint: opts.endpoint ?? config.flociEndpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(opts.forcePathStyle ? { forcePathStyle: true } : {}),
  });
}
