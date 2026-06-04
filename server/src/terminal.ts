import type { Server } from "http";
import type { Duplex } from "stream";
import type { IncomingMessage } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { spawn as ptySpawn } from "node-pty";

/**
 * Browser terminal for EC2 instances.
 *
 * Floci backs each EC2 instance with a real Docker container named
 * `floci-ec2-<instance-id>`. We bridge a WebSocket to a PTY running
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

function startSession(ws: WebSocket, instanceId: string): void {
  const container = `floci-ec2-${instanceId}`;

  // node-pty gives the host side of the TTY; `docker exec -it` allocates the
  // matching TTY inside the container. Prefer bash, fall back to sh.
  const term = ptySpawn(
    "docker",
    ["exec", "-it", container, "sh", "-c", "exec bash 2>/dev/null || exec sh"],
    {
      name: "xterm-color",
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
