import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load .env from the repo root (one level up from server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const flociEndpoint = process.env.FLOCI_ENDPOINT ?? "http://localhost:4566";

export const config = {
  flociEndpoint,
  // Endpoint the user's BROWSER can reach (for presigned S3 URLs etc.). In
  // Docker Compose the server talks to floci at http://floci:4566, but the
  // browser must use a host-reachable URL like http://localhost:4566.
  publicEndpoint: process.env.PUBLIC_FLOCI_ENDPOINT ?? flociEndpoint,
  region: process.env.AWS_REGION ?? "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "floci",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "floci",
  port: Number(process.env.PORT ?? 4000),
};

export type FlociConfig = typeof config;
