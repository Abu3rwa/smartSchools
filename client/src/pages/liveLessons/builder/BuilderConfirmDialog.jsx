import BuilderDialog from "./BuilderDialog.jsx";

/** One confirmation shell for every destructive action in the builder. */
export default function BuilderConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  return (
    <BuilderDialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="llb-btn llb-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`llb-btn ${danger ? "llb-btn-danger" : "llb-btn-primary"}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="llb-dialog-copy">{body}</p>
    </BuilderDialog>
  );
}
