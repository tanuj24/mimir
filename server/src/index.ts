import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./lib/http.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb", type: "application/json" }));

// Health + environment info for the UI's connection indicator.
app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(config.flociEndpoint, { method: "GET" });
    res.json({
      ok: true,
      flociEndpoint: config.flociEndpoint,
      flociReachable: r.ok || r.status < 500,
      region: config.region,
    });
  } catch {
    res.json({
      ok: true,
      flociEndpoint: config.flociEndpoint,
      flociReachable: false,
      region: config.region,
    });
  }
});

app.use("/api", apiRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[mimir] proxy listening on http://localhost:${config.port}  ->  floci ${config.flociEndpoint}`,
  );
});
