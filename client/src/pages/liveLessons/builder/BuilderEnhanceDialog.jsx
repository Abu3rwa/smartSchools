import { useState } from "react";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces.js";
import { BUILDER_LIMITS, costCredits, formatNumber } from "./liveLessonBuilderForm.js";
import BuilderDialog from "./BuilderDialog.jsx";

const PRESETS = ["simpler", "visual", "shorter", "example"];

/**
 * The enhance dialog only collects a direction. The server owns the price and
 * the regeneration limit, so this component just refuses to submit nothing.
 */
export default function BuilderEnhanceDialog({
  item,
  costCents,
  maxRegens,
  initialPreset = "",
  busy = false,
  onClose,
  onSave,
}) {
  const { t, locale } = useFeatureNamespaces("liveLessonBuilder");
  const [presets, setPresets] = useState(initialPreset ? [initialPreset] : []);
  const [instruction, setInstruction] = useState("");
  const [keepText, setKeepText] = useState(false);
  const [error, setError] = useState("");

  const used = Number(item?.regenCount) || 0;
  const atLimit = maxRegens > 0 && used >= maxRegens;

  const togglePreset = (preset) => {
    setError("");
    setPresets((current) =>
      current.includes(preset)
        ? current.filter((entry) => entry !== preset)
        : [...current, preset],
    );
  };

  const submit = () => {
    const text = instruction.trim();
    if (!text && !presets.length) {
      setError(t("dialogs.enhance.needInput"));
      return;
    }
    onSave({ instruction: text, presets, keepText });
  };

  return (
    <BuilderDialog
      title={t("dialogs.enhance.title")}
      subtitle={item?.outline?.title || ""}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="llb-btn llb-btn-secondary" onClick={onClose}>
            {t("dialogs.enhance.cancel")}
          </button>
          <button
            type="button"
            className="llb-btn llb-btn-primary"
            disabled={atLimit || busy}
            onClick={submit}
          >
            {busy ? t("dialogs.enhance.submitting") : t("dialogs.enhance.submit")}
          </button>
        </>
      }
    >
      <p className="llb-dialog-copy">{t("dialogs.enhance.copy")}</p>
      {atLimit ? (
        <div className="llb-inline-error" role="alert">
          {t("dialogs.enhance.limit", { max: formatNumber(maxRegens, locale) })}
        </div>
      ) : (
        <>
          <label className="llb-field">
            <span className="llb-field-label">{t("dialogs.enhance.instruction")}</span>
            <textarea
              className="llb-textarea"
              rows={3}
              maxLength={BUILDER_LIMITS.regenInstructionMax}
              value={instruction}
              placeholder={t("dialogs.enhance.instructionPlaceholder")}
              onChange={(event) => {
                setError("");
                setInstruction(event.target.value);
              }}
            />
          </label>

          <div className="llb-field">
            <span className="llb-field-label">{t("dialogs.enhance.presets")}</span>
            <div className="llb-preset-chips">
              {PRESETS.map((preset) => {
                const selected = presets.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    className={selected ? "llb-preset-chip is-selected" : "llb-preset-chip"}
                    aria-pressed={selected}
                    onClick={() => togglePreset(preset)}
                  >
                    <span className="llb-preset-mark" aria-hidden="true">
                      {selected ? "\u2713" : ""}
                    </span>
                    {t(
                      `dialogs.enhance.preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}`,
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="llb-check">
            <input
              type="checkbox"
              checked={keepText}
              onChange={(event) => setKeepText(event.target.checked)}
            />
            <span>{t("dialogs.enhance.keepText")}</span>
          </label>

          {error && (
            <div className="llb-inline-error" role="alert">
              {error}
            </div>
          )}

          {Number.isFinite(Number(costCents)) && Number(costCents) > 0 && (
            <p className="llb-dialog-cost">
              {t("dialogs.enhance.cost", {
                credits: formatNumber(costCredits(costCents), locale),
              })}
            </p>
          )}
        </>
      )}
    </BuilderDialog>
  );
}
