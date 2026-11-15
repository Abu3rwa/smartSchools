import { useId, useRef } from 'react';
import useFocusTrap from '../../hooks/useFocusTrap';

/**
 * Shared confirmation / small dialog with the focus trap, Escape handling and
 * dialog semantics the existing writing dialogs already use. Callers pass
 * translated copy so the same component works in EN and AR.
 */
const ConfirmDialog = ({
  open,
  title,
  message = null,
  children = null,
  confirmLabel,
  cancelLabel,
  busyLabel = null,
  closeLabel,
  onConfirm,
  onCancel,
  busy = false,
  confirmDisabled = false,
  tone = 'primary'
}) => {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();

  useFocusTrap({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: busy ? undefined : onCancel
  });

  if (!open) return null;

  const handleOverlayMouseDown = (event) => {
    if (busy) return;
    if (event.target === event.currentTarget) onCancel?.();
  };

  return (
    <div className="gp-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        ref={dialogRef}
        className="gp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="gp-dialog-head">
          <h2 id={titleId} className="gp-dialog-title">{title}</h2>
          <button
            type="button"
            className="gp-dialog-close"
            onClick={onCancel}
            disabled={busy}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
        <div className="gp-dialog-body">
          {message ? <p>{message}</p> : null}
          {children}
        </div>
        <div className="gp-dialog-foot">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
