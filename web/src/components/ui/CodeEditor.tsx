import { useRef } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void; // called on Cmd/Ctrl+Enter
  language?: string;
  readOnly?: boolean;
  minHeight?: number;
  className?: string;
}

export function CodeEditor({
  value,
  onChange,
  onSubmit,
  language = "python",
  readOnly = false,
  minHeight = 320,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const onMount: OnMount = (editor, monaco) => {
    // Python-friendly defaults
    editor.updateOptions({
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: false,
      renderWhitespace: "boundary",
      wordWrap: "off",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      automaticLayout: true,
      readOnly,
      theme: "vs-dark",
    });
    // Suppress Cmd/Ctrl+S browser save dialog inside the editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {});
    // Cmd/Ctrl+Enter → onSubmit (run cell in notebooks, etc.)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onSubmitRef.current?.());
  };

  return (
    <div ref={containerRef} className={`overflow-hidden rounded ${className}`} style={{ minHeight }}>
      <MonacoEditor
        height={minHeight}
        language={language}
        value={value}
        theme="vs-dark"
        onChange={(v) => onChange?.(v ?? "")}
        onMount={onMount}
        options={{
          tabSize: 4,
          insertSpaces: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: "on",
          readOnly,
          automaticLayout: true,
          wordWrap: "off",
        }}
      />
    </div>
  );
}
