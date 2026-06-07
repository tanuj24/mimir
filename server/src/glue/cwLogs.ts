/**
 * CloudWatch Logs integration for Glue jobs and notebooks.
 *
 * On startup: provisions the standard Glue log groups (same names AWS uses).
 * During job execution: streams stdout/stderr to the correct group+stream in
 * real time, flushing every few seconds exactly like the AWS Glue service does.
 */

import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { makeClient } from "../aws/clientFactory.js";
import { config } from "../config.js";

// Standard log groups AWS pre-creates for Glue — we match them exactly.
export const GLUE_LOG_GROUPS = [
  "/aws-glue/jobs/output",
  "/aws-glue/jobs/error",
  "/aws-glue/python-jobs/output",
  "/aws-glue/python-jobs/error",
  "/aws-glue/sessions/logs",
];

function logsClient(): CloudWatchLogsClient {
  return makeClient(CloudWatchLogsClient, { region: config.region });
}

/** Create all standard Glue log groups. Called once at server startup. Idempotent. */
export async function provisionGlueLogGroups(): Promise<void> {
  const cl = logsClient();
  await Promise.all(
    GLUE_LOG_GROUPS.map((name) =>
      cl
        .send(new CreateLogGroupCommand({ logGroupName: name }))
        .catch((e: unknown) => {
          if ((e as { name?: string }).name !== "ResourceAlreadyExistsException")
            console.warn(`[mimir] log group ${name}:`, (e as Error).message);
        }),
    ),
  );
}

/** Create a single log group idempotently (e.g. /aws/lambda/<fn>). */
export async function ensureLogGroup(name: string): Promise<void> {
  await logsClient()
    .send(new CreateLogGroupCommand({ logGroupName: name }))
    .catch((e: unknown) => {
      if ((e as { name?: string }).name !== "ResourceAlreadyExistsException")
        console.warn(`[mimir] log group ${name}:`, (e as Error).message);
    });
}

interface LogEvent {
  timestamp: number;
  message: string;
}

// Internal: create stream, batch & push events — fire and forget friendly.
async function flushToStream(
  cl: CloudWatchLogsClient,
  group: string,
  stream: string,
  events: LogEvent[],
  streamEnsured: { done: boolean },
): Promise<void> {
  if (!events.length) return;
  if (!streamEnsured.done) {
    await cl
      .send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: stream }))
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "ResourceAlreadyExistsException")
          throw e;
      });
    streamEnsured.done = true;
  }
  // PutLogEvents limit: 10 000 events / 1 MiB per call.
  const CHUNK = 5_000;
  for (let i = 0; i < events.length; i += CHUNK) {
    await cl.send(
      new PutLogEventsCommand({
        logGroupName: group,
        logStreamName: stream,
        logEvents: events.slice(i, i + CHUNK),
      }),
    );
  }
}

/**
 * Real-time CloudWatch logger for a single Glue job run.
 * Mirrors AWS behavior: stdout → /aws-glue/jobs/output (or python-jobs),
 * stderr → /aws-glue/jobs/error.  Stream name: <job-name>/<run-id>.
 */
export class GlueJobLogger {
  private readonly cl = logsClient();
  private readonly outGroup: string;
  private readonly errGroup: string;
  private readonly stream: string;

  private outBuf: LogEvent[] = [];
  private errBuf: LogEvent[] = [];
  private outEnsured = { done: false };
  private errEnsured = { done: false };

  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(jobName: string, runId: string, jobType: string) {
    const isPython = jobType === "pythonshell";
    this.outGroup = isPython ? "/aws-glue/python-jobs/output" : "/aws-glue/jobs/output";
    this.errGroup = isPython ? "/aws-glue/python-jobs/error" : "/aws-glue/jobs/error";
    this.stream = `${jobName}/${runId}`;
    // Flush every 5 seconds while the job is running — same cadence as AWS.
    this.timer = setInterval(() => this.flush(), 5_000).unref();
  }

  appendOutput(text: string): void {
    this.pushLines(this.outBuf, text);
  }

  appendError(text: string): void {
    this.pushLines(this.errBuf, text);
  }

  /** Final flush — call when the job container exits. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  private pushLines(buf: LogEvent[], text: string): void {
    const ts = Date.now();
    text.split("\n").forEach((line, i) => {
      if (line) buf.push({ timestamp: ts + i, message: line });
    });
  }

  private async flush(): Promise<void> {
    const [out, err] = [this.outBuf.splice(0), this.errBuf.splice(0)];
    await Promise.all([
      flushToStream(this.cl, this.outGroup, this.stream, out, this.outEnsured).catch(() => {}),
      flushToStream(this.cl, this.errGroup, this.stream, err, this.errEnsured).catch(() => {}),
    ]);
  }
}

/**
 * Publish a notebook statement's output to /aws-glue/sessions/logs.
 * Stream name: <session-id>  (one stream per session, appended per statement).
 */
export async function publishSessionLog(
  sessionId: string,
  output: string,
  timestamp: number,
): Promise<void> {
  if (!output.trim()) return;
  const cl = logsClient();
  const group = "/aws-glue/sessions/logs";
  const stream = sessionId;
  const events = output
    .split("\n")
    .filter((l) => l)
    .map((message, i) => ({ timestamp: timestamp + i, message }));

  await flushToStream(cl, group, stream, events, { done: false }).catch(() => {});
}
