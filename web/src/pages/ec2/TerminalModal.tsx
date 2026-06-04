import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";
import type { Instance } from "./ec2Api";

/**
 * Browser terminal for an EC2 instance. Opens a WebSocket to the Mimir server,
 * which bridges it to `docker exec` on the instance's backing container.
 */
export function TerminalModal({ instance, onClose }: { instance: Instance | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!instance || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: "#0a0f1f", foreground: "#e6edf3", cursor: "#4dd9ff" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        /* element not measurable yet */
      }
    };
    // Let the modal lay out before the first fit.
    const fitTimer = window.setTimeout(safeFit, 50);

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/ec2/instances/${encodeURIComponent(
      instance.id,
    )}/terminal`;
    const ws = new WebSocket(url);

    term.writeln("\x1b[90mConnecting to " + instance.id + "…\x1b[0m");

    ws.onopen = () => {
      safeFit();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      term.focus();
    };
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : "");
    ws.onerror = () => term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
    ws.onclose = () => term.writeln("\r\n\x1b[90m[disconnected]\x1b[0m");

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      safeFit();
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.clearTimeout(fitTimer);
      resizeObserver.disconnect();
      onData.dispose();
      ws.close();
      term.dispose();
    };
  }, [instance]);

  if (!instance) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex h-[70vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-[#0a0f1f] shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-white">
            <span className="font-medium">Terminal</span>
            <span className="font-mono text-xs text-ink-300">
              {instance.name ? `${instance.name} · ` : ""}
              {instance.id}
            </span>
          </div>
          <button className="rounded p-1 text-ink-300 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={containerRef} className="min-h-0 flex-1 p-2" />
      </div>
    </div>
  );
}
