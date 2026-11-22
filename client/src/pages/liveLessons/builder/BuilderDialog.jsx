import { useEffect, useId, useRef } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";

/**
 * Shared modal shell. The builder's dialogs all sit on the same dark surface,
 * so focus handling and the close affordance live here instead of being copied.
 */
const BuilderDialog = ({
  title,
  subtitle = "",
  wide = false,
  onClose,
  footer = null,
  children,
}) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  const headingId = useId();
  const closeRef = useRef(null);
  const surfaceRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = surfaceRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="llb-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={surfaceRef}
        className={wide ? "llb-dialog is-wide" : "llb-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <div className="llb-dialog-head">
          <div>
            <h2 id={headingId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="llb-icon-button"
            onClick={onClose}
            aria-label={t("dialogs.close")}
          >
            <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
          </button>
        </div>
        <div className="llb-dialog-body">{children}</div>
        {footer && <div className="llb-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
};

export default BuilderDialog;
