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

// Startup script run inside the instance. Gives a real bash experience:
// proper TERM (so readline/arrows/history/tab-completion/Ctrl-L work), a
// colored prompt, and the usual color aliases. Falls back to sh if bash is
// somehow missing. The rcfile is written fresh on each connect (cheap).
const SHELL_INIT = [
  "cat > /tmp/.mimirrc <<'RC'",
  "export TERM=xterm-256color",
  "export PS1='\\[\\e[1;32m\\]\\u@\\h\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ '",
  "alias ls='ls --color=auto'",
  "alias ll='ls -alF --color=auto'",
  "alias la='ls -A --color=auto'",
  "alias grep='grep --color=auto'",
  "RC",
  "exec bash --rcfile /tmp/.mimirrc -i 2>/dev/null || exec sh -i",
].join("\n");

function startSession(ws: WebSocket, instanceId: string): void {
  const container = `floci-ec2-${instanceId}`;

  // node-pty gives the host side of the TTY; `docker exec -it` allocates the
  // matching TTY inside the container. `-e TERM` is set before bash starts so
  // readline picks up a real terminal (the container otherwise defaults to
  // TERM=dumb, which disables line editing entirely).
  const term = ptySpawn(
    "docker",
    ["exec", "-it", "-e", "TERM=xterm-256color", container, "sh", "-c", SHELL_INIT],
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
