import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CALENDAR_SENDER_GROUPS, clampMeetingLength } from "../inboxUi.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const DATE_ONLY_PRESETS = [0, 480, 960, 1440, 2880];
const TIMED_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440];

const REMINDER_FIELDS = [
  { field: "deadlineReminderDateOnlyMinutes", presets: DATE_ONLY_PRESETS, prefix: "dateOnly" },
  { field: "deadlineReminderTimedMinutes", presets: TIMED_PRESETS, prefix: "timed" },
  { field: "meetingReminderMinutes", presets: TIMED_PRESETS, prefix: "timed" },
];

/** A stored value outside the presets still has to show as itself, never as a neighbour. */
function ReminderSelect({ field, presets, prefix, value, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const minutes = Math.round(Number(value) || 0);
  const options = presets.includes(minutes) ? presets : [...presets, minutes];

  return (
    <label className="ia-field">
      <span>{t(`inboxAssistant:settings.calendar.${field}`)}</span>
      <select
        className="ia-select"
        value={String(minutes)}
        disabled={saving}
        onChange={(event) => onSave({ calendar: { [field]: Number(event.target.value) } })}
      >
        {options.map((option) => (
          <option key={option} value={String(option)}>
            {presets.includes(option)
              ? t(`inboxAssistant:settings.calendar.reminders.${prefix}.${option}`)
              : t("inboxAssistant:settings.calendar.reminders.custom", { n: option })}
          </option>
        ))}
      </select>
    </label>
  );
}

function CalendarSection({ settings, calendar, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [length, setLength] = useState(String(settings.calendar.meetingLengthMinutes));
  const [knownLength, setKnownLength] = useState(settings.calendar.meetingLengthMinutes);
  const senders = settings.calendar.autoAddSenders || {};
  const autoAdd = settings.calendar.autoAdd === true;

  if (settings.calendar.meetingLengthMinutes !== knownLength) {
    setKnownLength(settings.calendar.meetingLengthMinutes);
    setLength(String(settings.calendar.meetingLengthMinutes));
  }

  const commitLength = () => {
    const minutes = clampMeetingLength(length);
    setLength(String(minutes));
    if (minutes !== settings.calendar.meetingLengthMinutes) {
      onSave({ calendar: { meetingLengthMinutes: minutes } });
    }
  };

  return (
    <fieldset className="ia-settings-group" disabled={saving}>
      <legend>{t("inboxAssistant:settings.calendar.title")}</legend>

      {!calendar.connected && (
        <p className="ia-hint">{t("inboxAssistant:settings.calendar.notConnected")}</p>
      )}
      {calendar.connected && calendar.accountEmail && (
        <p className="ia-hint">
          {t("inboxAssistant:settings.calendar.account", { email: calendar.accountEmail })}
        </p>
      )}

      <label className="ia-check">
        <input
          type="checkbox"
          checked={settings.calendar.syncOn !== false}
          disabled={saving || !calendar.connected}
          onChange={(event) => onSave({ calendar: { syncOn: event.target.checked } })}
        />
        <span>
          {t("inboxAssistant:settings.calendar.syncOn")}
          <small className="ia-hint">
            {t(calendar.connected
              ? "inboxAssistant:settings.calendar.syncHint"
              : "inboxAssistant:settings.calendar.syncOffHow")}
          </small>
        </span>
      </label>

      <label className="ia-check">
        <input
          type="checkbox"
          checked={autoAdd}
          disabled={saving || !calendar.connected || settings.calendar.syncOn === false}
          onChange={(event) => onSave({ calendar: { autoAdd: event.target.checked } })}
        />
        <span>
          {t("inboxAssistant:settings.calendar.autoAdd")}
          <small className="ia-hint">{t("inboxAssistant:settings.calendar.autoAddHint")}</small>
        </span>
      </label>

      <div className="ia-check-group" aria-label={t("inboxAssistant:settings.calendar.autoAddFrom")}>
        <span className="ia-check-group-title">
          {t("inboxAssistant:settings.calendar.autoAddFrom")}
        </span>
        {CALENDAR_SENDER_GROUPS.map((group) => (
          <label className="ia-check" key={group}>
            <input
              type="checkbox"
              checked={senders[group] !== false}
              disabled={saving || !autoAdd}
              onChange={(event) => onSave({
                calendar: { autoAddSenders: { [group]: event.target.checked } },
              })}
            />
            <span>{t(`inboxAssistant:settings.calendar.senders.${group}`)}</span>
          </label>
        ))}
        {!autoAdd && (
          <small className="ia-hint">{t("inboxAssistant:settings.calendar.sendersLocked")}</small>
        )}
      </div>

      <label className="ia-field">
        <span>{t("inboxAssistant:settings.calendar.meetingLengthMinutes")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={15}
          max={240}
          step="5"
          value={length}
          disabled={saving}
          onChange={(event) => setLength(event.target.value)}
          onBlur={commitLength}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitLength();
            event.currentTarget.blur();
          }}
          aria-describedby="ia-meeting-length-hint"
        />
        <small id="ia-meeting-length-hint" className="ia-hint">
          {t("inboxAssistant:settings.calendar.meetingLengthHint")}
        </small>
      </label>

      {REMINDER_FIELDS.map((entry) => (
        <ReminderSelect
          key={entry.field}
          field={entry.field}
          prefix={entry.prefix}
          presets={entry.presets}
          value={settings.calendar[entry.field]}
          saving={saving}
          onSave={onSave}
        />
      ))}

      <label className="ia-check">
        <input
          type="checkbox"
          checked={settings.calendar.overlapEmail !== false}
          disabled={saving}
          onChange={(event) => onSave({ calendar: { overlapEmail: event.target.checked } })}
        />
        <span>
          {t("inboxAssistant:settings.calendar.overlapEmail")}
          <small className="ia-hint">{t("inboxAssistant:settings.calendar.overlapEmailHint")}</small>
        </span>
      </label>
    </fieldset>
  );
}

export default function SettingsPanel({ settings, calendar, saving, onClose, onSave, onDelete }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [signature, setSignature] = useState(settings.signature || "");
  const [nudge, setNudge] = useState(String(settings.nudgeAfterDays ?? 2));
  const [knownSignature, setKnownSignature] = useState(settings.signature || "");
  const [knownNudge, setKnownNudge] = useState(settings.nudgeAfterDays ?? 2);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removeEvents, setRemoveEvents] = useState(false);

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
    const removed = await onDelete(removeEvents);
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

      {calendar && (
        <CalendarSection
          settings={settings}
          calendar={calendar}
          saving={saving}
          onSave={onSave}
        />
      )}

      {calendar?.platformEnabled && (
        <p className="ia-hint ia-settings-note">
          {t("inboxAssistant:settings.calendar.disconnectHow")}
        </p>
      )}

      <div className="ia-danger">
        <div>
          <h3>{t("inboxAssistant:settings.deleteTitle")}</h3>
          <p>{t("inboxAssistant:settings.deleteBody")}</p>
          {calendar?.connected && (
            <label className="ia-check">
              <input
                type="checkbox"
                checked={removeEvents}
                disabled={saving || deleting}
                onChange={(event) => setRemoveEvents(event.target.checked)}
              />
              <span>
                {t("inboxAssistant:settings.deleteCalendarEvents")}
                <small className="ia-hint">
                  {t("inboxAssistant:settings.deleteCalendarEventsHint")}
                </small>
              </span>
            </label>
          )}
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
          {removeEvents && (
            <p className="ia-state-notice is-error">
              {t("inboxAssistant:settings.deleteConfirmCalendar")}
            </p>
          )}
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
