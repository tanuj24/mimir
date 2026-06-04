import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CodeBlock({ value, language }: { value: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded p-1.5 text-ink-300 hover:bg-white/10 hover:text-white"
        title="Copy"
      >
        {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
      </button>
      <pre className="max-h-96 overflow-auto rounded-lg bg-squid-900 p-3 pr-10 font-mono text-xs leading-relaxed text-green-100">
        {language && <div className="mb-1 text-ink-300">{language}</div>}
        <code>{value}</code>
      </pre>
    </div>
  );
}
