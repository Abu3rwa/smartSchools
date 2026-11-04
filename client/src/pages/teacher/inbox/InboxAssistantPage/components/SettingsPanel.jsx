import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog.jsx";

export default function SettingsPanel({ settings, saving, onClose, onSave, onDelete }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [signature, setSignature] = useState(settings.signature || "");
  const [nudge, setNudge] = useState(String(settings.nudgeAfterDays ?? 2));
  const [knownSignature, setKnownSignature] = useState(settings.signature || "");
  const [knownNudge, setKnownNudge] = useState(settings.nudgeAfterDays ?? 2);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if ((settings.signature || "") !== knownSignature) {
    setKnownSignature(settings.signature || "");
    setSignature(settings.signature || "");
  }

  if ((settings.nudgeAfterDays ?? 2) !== knownNudge) {
    setKnownNudge(settings.nudgeAfterDays ?? 2);
    setNudge(String(settings.nudgeAfterDays ?? 2));
  }

  const commitSignature = () => {
    const value = signature.trim();
    if (value !== (settings.signature || "")) onSave({ signature: value });
  };

  const commitNudge = () => {
    const days = Math.min(Math.max(Math.round(Number(nudge) || 2), 1), 14);
    setNudge(String(days));
    if (days !== settings.nudgeAfterDays) onSave({ nudgeAfterDays: days });
  };

  const removeEverything = async () => {
    setDeleting(true);
    const removed = await onDelete();
    setDeleting(false);
    if (removed) setConfirming(false);
  };

  return (
    <section className="ia-panel ia-settings" aria-labelledby="ia-settings-title">
      <div className="ia-settings-head">
        <h2 id="ia-settings-title">{t("inboxAssistant:settings.title")}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          aria-label={t("inboxAssistant:settings.close")}
        >
          {t("inboxAssistant:settings.close")}
        </button>
      </div>

      <label className="ia-field">
        <span>{t("inboxAssistant:settings.signature")}</span>
        <textarea
          rows={3}
          maxLength={500}
          value={signature}
          disabled={saving}
          onChange={(event) => setSignature(event.target.value)}
          onBlur={commitSignature}
          aria-describedby="ia-signature-hint"
        />
        <small id="ia-signature-hint" className="ia-hint">
          {t("inboxAssistant:settings.signatureHint")}
        </small>
      </label>

      <label className="ia-check">
        <input
          type="checkbox"
          checked={Boolean(settings.includeCcByDefault)}
          disabled={saving}
          onChange={(event) => onSave({ includeCcByDefault: event.target.checked })}
        />
        <span>
          {t("inboxAssistant:settings.includeCc")}
          <small className="ia-hint">{t("inboxAssistant:settings.includeCcHint")}</small>
        </span>
      </label>

      <label className="ia-field">
        <span>{t("inboxAssistant:settings.nudgeAfterDays")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={14}
          step="1"
          value={nudge}
          disabled={saving}
          onChange={(event) => setNudge(event.target.value)}
          onBlur={commitNudge}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitNudge();
            event.currentTarget.blur();
          }}
          aria-describedby="ia-nudge-hint"
        />
        <small id="ia-nudge-hint" className="ia-hint">
          {t("inboxAssistant:settings.nudgeHint")}
        </small>
      </label>

      <div className="ia-danger">
        <div>
          <h3>{t("inboxAssistant:settings.deleteTitle")}</h3>
          <p>{t("inboxAssistant:settings.deleteBody")}</p>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={saving}
          onClick={() => setConfirming(true)}
        >
          {t("inboxAssistant:settings.delete")}
        </button>
      </div>

      {confirming && (
        <ConfirmDialog titleId="ia-delete-title" onClose={() => !deleting && setConfirming(false)}>
          <h2 id="ia-delete-title">{t("inboxAssistant:settings.deleteConfirmTitle")}</h2>
          <p>{t("inboxAssistant:settings.deleteConfirmBody")}</p>
          <div className="ia-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              {t("inboxAssistant:settings.deleteCancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleting}
              onClick={removeEverything}
            >
              {t(deleting ? "inboxAssistant:settings.deleting" : "inboxAssistant:settings.deleteConfirm")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
