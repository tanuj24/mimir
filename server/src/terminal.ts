import type { Server } from "http";
import type { Duplex } from "stream";
import type { IncomingMessage } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { spawn as ptySpawn } from "node-pty";

/**
 * Browser terminal for EC2 instances.
 *
 * the Mimir backend backs each EC2 instance with a real Docker container named
 * `mimir-ec2-<instance-id>`. We bridge a WebSocket to a PTY running
 * `docker exec -it <container> <shell>`, so the console gets a genuine
 * interactive shell — Mimir's take on EC2 Instance Connect.
 *
 * Client → server messages are JSON: { type: "input", data } | { type: "resize", cols, rows }.
 * Server → client messages are raw PTY output written straight into xterm.
 */

const TERMINAL_PATH = /^\/api\/ec2\/instances\/([^/?]+)\/terminal(?:\?.*)?$/;

interface ClientMessage {
  type: "input" | "resize";
  data?: string;
  cols?: number;
  rows?: number;
}

export function attachTerminal(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const match = (req.url ?? "").match(TERMINAL_PATH);
    if (!match) {
      // Not a path we handle — let it close rather than hang.
      socket.destroy();
      return;
    }
    const instanceId = decodeURIComponent(match[1]);
    wss.handleUpgrade(req, socket, head, (ws) => startSession(ws, instanceId));
  });
}

// Colored bash prompt: user@host:cwd$ — all injected via docker exec -e so
// bash -i starts immediately without a wrapper script (which suppressed the
// initial prompt in testing).
const PS1 = "\\[\\e[1;32m\\]\\u@\\h\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ ";

function startSession(ws: WebSocket, instanceId: string): void {
  const container = `mimir-ec2-${instanceId}`;

  // Pass env vars directly into docker exec so bash -i starts cleanly with a
  // visible prompt. The container's own .bashrc is still sourced (color aliases
  // etc.), and our PS1 overrides whatever PS1 it sets.
  const term = ptySpawn(
    "docker",
    [
      "exec", "-it",
      "-e", "TERM=xterm-256color",
      "-e", `PS1=${PS1}`,
      container,
      "bash", "-i",
    ],
    {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      env: process.env as Record<string, string>,
    },
  );

  const onData = term.onData((chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });

  const onExit = term.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n\x1b[90m[session ended${exitCode ? ` (exit ${exitCode})` : ""}]\x1b[0m\r\n`);
      ws.close();
    }
  });

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "input" && typeof msg.data === "string") {
      term.write(msg.data);
    } else if (msg.type === "resize" && msg.cols && msg.rows) {
      try {
        term.resize(msg.cols, msg.rows);
      } catch {
        /* resize can race with exit; ignore */
      }
    }
  });

  ws.on("close", () => {
    onData.dispose();
    onExit.dispose();
    try {
      term.kill();
    } catch {
      /* already gone */
    }
  });
}
