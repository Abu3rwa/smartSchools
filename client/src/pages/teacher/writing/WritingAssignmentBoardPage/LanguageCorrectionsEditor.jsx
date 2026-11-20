import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_CORRECTION_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_PER_SECTION,
  MECHANICS_CATEGORIES,
  occurrenceChoices,
  resolveCorrectionSpan,
  validateCorrection,
} from "../../../../utils/writingMechanics.js";

const BLANK_ROW = {
  category: "grammar",
  original: "",
  correction: "",
  explanation: "",
  anchor: null,
  deletion: false,
};

const sliceOf = (text, anchor) =>
  anchor && Number.isInteger(anchor.start) && Number.isInteger(anchor.end)
    ? text.slice(anchor.start, anchor.end)
    : "";

/**
 * Structured language-correction rows for one assessed part. The orignal words
 * come from a selection in the submitted paragraph; a repeated snippet needs an
 * explicit occurrence, so no row is ever anchored by a guess.
 */
export default function LanguageCorrectionsEditor({
  rows = [],
  sectionText = "",
  disabled = false,
  onChange,
}) {
  const { t } = useTranslation(["writing"]);
  const [active, setActive] = useState(null);
  const passageRef = useRef(null);
  const text = String(sectionText || "").trim();

  const update = (index, patch) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const validity = useMemo(
    () =>
      rows.map((row) => {
        if (!row.original) return "snippet";
        if (!row.category) {
          return row.deletion || row.correction ? "" : "correction";
        }
        // A blank correction is only a deletion when the teacher said so.
        if (!row.deletion && !row.correction) return "correction";
        const result = validateCorrection(
          text,
          {
            category: row.category,
            original: row.original,
            correction: row.deletion ? "" : row.correction,
            explanation: row.explanation,
            anchor: row.anchor,
          },
          { requireExplanation: true },
        );
        if (result.ok) return "";
        return result.code === "WRITING_MECHANICS_INVALID" ? "explanation" : "anchor";
      }),
    [rows, text],
  );

  const capture = () => {
    if (disabled || active === null || !rows[active]) return;
    const node = passageRef.current;
    const selection = window.getSelection();
    if (!node || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.commonAncestorContainer)) return;
    const raw = range.toString();
    const trimmed = raw.trim();
    if (!trimmed) return;
    const before = document.createRange();
    before.selectNodeContents(node);
    before.setEnd(range.startContainer, range.startOffset);
    const lead = raw.length - raw.trimStart().length;
    const start = before.toString().length + lead;
    update(active, {
      original: trimmed,
      anchor: { start, end: start + trimmed.length },
    });
    selection.removeAllRanges();
    setActive(null);
  };

  const addRow = () => {
    if (rows.length >= MAX_PER_SECTION) return;
    onChange([...rows, { ...BLANK_ROW }]);
    setActive(rows.length);
  };

  return (
    <div className="wa-lang">
      <div className="wa-lang-head">
        <span className="wa-field-label">
          {t("writing:languageCorrections.title")}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={addRow}
          disabled={disabled || rows.length >= MAX_PER_SECTION}
        >
          {t("writing:languageCorrections.teacher.add")}
        </button>
      </div>
      {rows.length >= MAX_PER_SECTION && (
        <p className="wa-hint">
          {t("writing:languageCorrections.teacher.limit")}
        </p>
      )}

      {rows.length > 0 && (
        <details className="wa-lang-passage-wrap">
          <summary>{t("writing:languageCorrections.teacher.selectWords")}</summary>
          <p
            ref={passageRef}
            className="wa-lang-passage"
            dir="auto"
            onMouseUp={capture}
            onKeyUp={capture}
          >
            {text}
          </p>
          <p className="wa-hint">
            {active === null
              ? t("writing:languageCorrections.teacher.selectOccurrence")
              : t("writing:languageCorrections.teacher.selectionActive", {
                  n: active + 1,
                })}
          </p>
        </details>
      )}

      {rows.map((row, index) => {
        const problem = validity[index];
        const snippet = sliceOf(text, row.anchor);
        const choices =
          row.category && row.original && !row.anchor && !disabled
            ? occurrenceChoices(text, row.original)
            : [];
        return (
          <div className="wa-lang-row" key={`lang-${index}`}>
            <div className="wa-lang-row-head">
              <select
                className="wa-lang-category"
                value={row.category || ""}
                disabled={disabled}
                aria-label={t("writing:languageCorrections.teacher.category")}
                onChange={(event) => {
                  const category = event.target.value;
                  const patch = { category };
                  if (category) {
                    const resolved = row.original
                      ? resolveCorrectionSpan(text, row.original)
                      : { ok: false };
                    if (!row.anchor && resolved.ok) {
                      patch.anchor = { start: resolved.start, end: resolved.end };
                    }
                  } else {
                    patch.anchor = null;
                    patch.explanation = "";
                  }
                  update(index, patch);
                }}
              >
                <option value="">
                  {t("writing:languageCorrections.category.legacy")}
                </option>
                {MECHANICS_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {t(`writing:languageCorrections.category.${category}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm wa-lang-remove"
                disabled={disabled}
                aria-label={t("writing:languageCorrections.teacher.remove", {
                  n: index + 1,
                })}
                onClick={() => onChange(rows.filter((_row, at) => at !== index))}
              >
                {t("writing:languageCorrections.teacher.remove", {
                  n: index + 1,
                })}
              </button>
            </div>

            <p className="wa-lang-source" dir="auto">
              {snippet ? (
                <>
                  {text.slice(Math.max(0, row.anchor.start - 24), row.anchor.start)}
                  <mark className="wa-lang-span">{snippet}</mark>
                  {text.slice(row.anchor.end, row.anchor.end + 24)}
                </>
              ) : (
                <span className="wa-hint">
                  {t("writing:languageCorrections.teacher.requiredSnippet")}
                </span>
              )}
            </p>
            {row.original && row.anchor && snippet !== row.original && (
              <p className="wa-lang-problem">
                {t("writing:languageCorrections.teacher.invalidAnchor")}
              </p>
            )}

            {choices.length > 0 && (
              <div className="wa-lang-choices">
                <p className="wa-hint">
                  {t("writing:languageCorrections.teacher.occurrences", {
                    n: choices.length,
                  })}
                </p>
                {choices.map((choice) => (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm wa-lang-choice"
                    key={`${choice.start}:${choice.end}`}
                    disabled={disabled}
                    onClick={() =>
                      update(index, {
                        anchor: { start: choice.start, end: choice.end },
                      })
                    }
                  >
                    …{choice.before}
                    <mark className="wa-lang-span">{row.original}</mark>
                    {choice.after}…
                  </button>
                ))}
              </div>
            )}

            <label className="wa-field">
              <span>{t("writing:languageCorrections.correction")}</span>
              <input
                type="text"
                value={row.deletion ? "" : row.correction}
                readOnly={disabled || row.deletion}
                maxLength={MAX_CORRECTION_CHARS}
                dir="auto"
                onChange={(event) =>
                  update(index, { correction: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className={`btn btn-ghost btn-sm wa-lang-delete${row.deletion ? " is-on" : ""}`}
              aria-pressed={row.deletion}
              disabled={disabled}
              onClick={() =>
                update(index, { deletion: !row.deletion, correction: "" })
              }
            >
              {t("writing:languageCorrections.teacher.deleteSelection")}
            </button>

            {row.category && (
              <label className="wa-field">
                <span>{t("writing:languageCorrections.explanation")}</span>
                <textarea
                  rows={2}
                  value={row.explanation}
                  readOnly={disabled}
                  maxLength={MAX_EXPLANATION_CHARS}
                  onChange={(event) =>
                    update(index, { explanation: event.target.value })
                  }
                />
                <em className="wa-hint">
                  {row.explanation.length}/{MAX_EXPLANATION_CHARS}
                </em>
              </label>
            )}

            {problem === "explanation" && (
              <p className="wa-lang-problem">
                {t("writing:languageCorrections.teacher.requiredReason")}
              </p>
            )}
            {problem === "correction" && (
              <p className="wa-lang-problem">
                {t("writing:languageCorrections.teacher.requiredCorrection")}
              </p>
            )}
            {problem === "snippet" && (
              <p className="wa-lang-problem">
                {t("writing:languageCorrections.teacher.requiredSnippet")}
              </p>
            )}
            {problem === "anchor" && !row.anchor && choices.length === 0 && (
              <p className="wa-lang-problem">
                {t("writing:languageCorrections.teacher.invalidAnchor")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
