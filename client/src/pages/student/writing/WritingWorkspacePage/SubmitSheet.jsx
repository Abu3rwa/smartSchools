import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { countLabel } from "../../../../utils/countText.js";
import useFocusTrap from "../../../../hooks/useFocusTrap.js";

/**
 * Submit is irreversible for the student: the text becomes a numbered draft the
 * teacher assesses. The sheet says exactly that, plus what still falls short.
 */
export default function SubmitSheet({ assignment, draftNumber, onClose, onConfirm, readiness, busy }) {
  const { t } = useTranslation(["writing"]);
  const min = Number(assignment?.minWords) || 0;
  const max = Number(assignment?.maxWords) || 0;
  const sheetRef = useRef(null);
  const confirmRef = useRef(null);
  const close = () => {
    if (!busy) onClose();
  };
  useFocusTrap({
    active: true,
    containerRef: sheetRef,
    initialFocusRef: confirmRef,
    onEscape: close,
  });

  const problems = [];
  for (const item of readiness.missingRequired) {
    problems.push(t("writing:student.problemMissing", { label: item.label }));
  }
  for (const item of readiness.shortSections) {
    problems.push(item.empty
      ? t("writing:student.problemEmpty", { label: item.label })
      : t("writing:student.problemShort", {
        label: item.label,
        words: countLabel(t, "writing:student.wordCount", item.words),
        n: countLabel(t, "writing:student.wordCount", item.minWords),
      }));
  }
  for (const item of readiness.belowMinCount) {
    problems.push(t("writing:student.problemNeedMore", { label: item.label, n: item.needed }));
  }
  if (readiness.belowRange) problems.push(t("writing:student.problemBelow", { n: min }));
  if (readiness.aboveRange) problems.push(t("writing:student.problemAbove", { n: max }));

  return (
    <div
      className="ws-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("writing:student.submitTitle")}
      onClick={close}
    >
      <div className="ws-sheet" ref={sheetRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <h2>{t("writing:student.submitTitle", { n: draftNumber + 1 })}</h2>
        <p className="ws-sheet-lead">{t("writing:student.submitLock")}</p>

        <p className="ws-sheet-count">
          {countLabel(t, "writing:student.wordCount", readiness.totalWords)}
          {(min > 0 || max > 0) && (
            <> · {t("writing:student.needs", { min: min || 0, max: max || t("writing:student.noLimit") })}</>
          )}
        </p>

        {problems.length > 0 ? (
          <ul className="ws-sheet-problems">
            {problems.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}
          </ul>
        ) : (
          <p className="ws-sheet-ready">{t("writing:student.everythingLooksGood")}</p>
        )}

        <div className="ws-sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t("writing:student.keepWriting")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy || problems.length > 0}
          >
            {busy ? t("writing:student.submitting") : t("writing:student.confirmSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
