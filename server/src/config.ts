import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load .env from the repo root (one level up from server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

// The Mimir backend (local AWS emulator) endpoint. `FLOCI_ENDPOINT` is still
// honored as a fallback so existing v1-style .env files keep working.
const backendEndpoint =
  process.env.BACKEND_ENDPOINT ?? process.env.FLOCI_ENDPOINT ?? "http://localhost:4566";

export const config = {
  backendEndpoint,
  // Endpoint the user's BROWSER can reach (for presigned S3 URLs etc.). In
  // Docker Compose the server talks to the backend at http://mimir:4566, but
  // the browser must use a host-reachable URL like http://localhost:4566.
  publicEndpoint: process.env.PUBLIC_BACKEND_ENDPOINT ?? process.env.PUBLIC_FLOCI_ENDPOINT ?? backendEndpoint,
  region: process.env.AWS_REGION ?? "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "mimir",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "mimir",
  port: Number(process.env.PORT ?? 4000),
};

export type MimirConfig = typeof config;
