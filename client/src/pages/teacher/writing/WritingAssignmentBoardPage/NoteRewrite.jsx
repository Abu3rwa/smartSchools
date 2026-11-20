import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../services/writingService.js";

const MODES = ["shorter", "specific", "simpler"];

/**
 * F1: rewrite one note without touching the rest of the assessment. The server
 * returns a single sentence, and only that line of the editor changes.
 */
export default function NoteRewrite({
  assessmentId,
  sectionKey,
  sectionIndex,
  field,
  notes = [],
  disabled = false,
  onReplace,
}) {
  const { t } = useTranslation(["writing"]);
  const [noteIndex, setNoteIndex] = useState(0);
  const [busy, setBusy] = useState("");
  const safeIndex = Math.min(noteIndex, Math.max(notes.length - 1, 0));
  const current = notes[safeIndex] ?? "";

  const rewrite = async (mode) => {
    if (!current.trim()) {
      toast.error(t("writing:teacher.review.noteEmpty"));
      return;
    }
    setBusy(mode);
    try {
      const result = await writingService.regenerateNote(assessmentId, {
        mode,
        field,
        key: sectionKey,
        index: sectionIndex,
        text: current,
      });
      onReplace(safeIndex, result.note);
      toast.success(
        result?.usage?.totalTokens
          ? t("writing:teacher.review.noteRewrittenTokens", {
              n: result.usage.totalTokens,
            })
          : t("writing:teacher.review.noteRewritten"),
      );
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.review.noteRewriteFailed"),
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="wa-note-rewrite">
      <span className="wa-hint">
        {t("writing:teacher.review.rewriteLabel")}
      </span>
      {notes.length > 1 && (
        <select
          value={safeIndex}
          aria-label={t("writing:teacher.review.rewriteWhich")}
          onChange={(event) => setNoteIndex(Number(event.target.value))}
        >
          {notes.map((note, index) => (
            <option key={index} value={index}>
              {t("writing:teacher.review.noteNumber", { n: index + 1 })}
            </option>
          ))}
        </select>
      )}
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || Boolean(busy)}
          onClick={() => rewrite(mode)}
        >
          {busy === mode
            ? t("writing:teacher.review.rewriting")
            : t(`writing:teacher.review.rewrite.${mode}`)}
        </button>
      ))}
    </div>
  );
}
