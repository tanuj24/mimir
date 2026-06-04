import { useState } from "react";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn-default" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={go}
            disabled={busy}
          >
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-ink-700">{message}</div>
    </Modal>
  );
}
