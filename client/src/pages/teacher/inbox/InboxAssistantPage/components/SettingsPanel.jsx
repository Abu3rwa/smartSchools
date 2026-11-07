import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineChevronDown } from "react-icons/hi";
import { CALENDAR_SENDER_GROUPS, clampMeetingLength } from "../inboxUi.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const DATE_ONLY_PRESETS = [0, 480, 960, 1440, 2880];
const TIMED_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440];

const REMINDER_FIELDS = [
  {
    field: "deadlineReminderDateOnlyMinutes",
    presets: DATE_ONLY_PRESETS,
    prefix: "dateOnly",
  },
  {
    field: "deadlineReminderTimedMinutes",
    presets: TIMED_PRESETS,
    prefix: "timed",
  },
  { field: "meetingReminderMinutes", presets: TIMED_PRESETS, prefix: "timed" },
];

/** A stored value outside the presets still has to show as itself, never as a neighbour. */
function ReminderSelect({ field, presets, prefix, value, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const minutes = Math.round(Number(value) || 0);
  const options = presets.includes(minutes) ? presets : [...presets, minutes];

  return (
    <label className="ia-field ia-field--select">
      <span>{t(`inboxAssistant:settings.calendar.${field}`)}</span>
      <div className="ia-select-wrapper">
        <select
          className="ia-select"
          value={String(minutes)}
          disabled={saving}
          onChange={(event) =>
            onSave({ calendar: { [field]: Number(event.target.value) } })
          }
        >
          {options.map((option) => (
            <option key={option} value={String(option)}>
              {presets.includes(option)
                ? t(
                    `inboxAssistant:settings.calendar.reminders.${prefix}.${option}`,
                  )
                : t("inboxAssistant:settings.calendar.reminders.custom", {
                    n: option,
                  })}
            </option>
          ))}
        </select>
        <span className="ia-select-icon" aria-hidden="true">
          ▼
        </span>
      </div>
    </label>
  );
}

/** Collapsible section wrapper for better organization */
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  saving,
  className = "",
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <fieldset
      className={`ia-settings-group ia-collapsible ${className}`}
      disabled={saving}
    >
      <legend className="ia-collapsible-legend">
        <button
          type="button"
          className="ia-collapsible-toggle"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={`collapse-${title.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <span className="ia-collapsible-icon" aria-hidden="true">
            <HiOutlineChevronDown
              size={16}
              className={isOpen ? "ia-collapsible-icon--open" : ""}
            />
          </span>
          <span>{t(`inboxAssistant:settings.${title}`)}</span>
        </button>
      </legend>
      <div
        id={`collapse-${title.replace(/\s+/g, "-").toLowerCase()}`}
        className="ia-collapsible-content"
        hidden={!isOpen}
        style={{
          display: isOpen ? "block" : "none",
          overflow: "hidden",
        }}
      >
        <div className="ia-collapsible-inner">{children}</div>
      </div>
    </fieldset>
  );
}

const AUTO_SCAN_INTERVALS = [15, 30, 60, 120, 240, 480, 720, 1440];

function formatInterval(minutes, t) {
  if (minutes < 60)
    return t("inboxAssistant:settings.autoScan.intervalMinutes", {
      count: minutes,
    });
  if (minutes === 60) return t("inboxAssistant:settings.autoScan.intervalHour");
  return t("inboxAssistant:settings.autoScan.intervalHours", {
    count: Math.round(minutes / 60),
  });
}

function AutoScanSection({ settings, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const enabled = settings.autoScanEnabled === true;
  const interval = settings.autoScanIntervalMinutes || 60;

  return (
    <CollapsibleSection
      title="autoScan.title"
      defaultOpen={true}
      saving={saving}
    >
      <p className="ia-hint">{t("inboxAssistant:settings.autoScan.intro")}</p>

      <label className="ia-check ia-check--primary">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(event) =>
            onSave({ autoScanEnabled: event.target.checked })
          }
        />
        <span className="ia-check-label">
          <strong>{t("inboxAssistant:settings.autoScan.enabled")}</strong>
          <small className="ia-hint">
            {t("inboxAssistant:settings.autoScan.enabledHint")}
          </small>
        </span>
      </label>

      <label
        className="ia-field ia-field--select"
        style={{
          opacity: enabled ? 1 : 0.5,
          pointerEvents: enabled ? "auto" : "none",
        }}
      >
        <span>{t("inboxAssistant:settings.autoScan.interval")}</span>
        <div className="ia-select-wrapper">
          <select
            className="ia-select"
            value={String(interval)}
            disabled={saving || !enabled}
            onChange={(event) =>
              onSave({ autoScanIntervalMinutes: Number(event.target.value) })
            }
          >
            {AUTO_SCAN_INTERVALS.map((option) => (
              <option key={option} value={String(option)}>
                {formatInterval(option, t)}
              </option>
            ))}
          </select>
          <span className="ia-select-icon" aria-hidden="true">
            ▼
          </span>
        </div>
        <small className="ia-hint">
          {t("inboxAssistant:settings.autoScan.intervalHint")}
        </small>
      </label>
    </CollapsibleSection>
  );
}

function CalendarSection({ settings, calendar, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [length, setLength] = useState(
    String(settings.calendar.meetingLengthMinutes),
  );
  const [knownLength, setKnownLength] = useState(
    settings.calendar.meetingLengthMinutes,
  );
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
    <CollapsibleSection
      title="calendar.title"
      defaultOpen={calendar?.connected}
      saving={saving}
    >
      {!calendar.connected && (
        <div className="ia-status-banner ia-status-banner--warning">
          <span className="ia-status-icon" aria-hidden="true">
            ⚠
          </span>
          <span>{t("inboxAssistant:settings.calendar.notConnected")}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => onSave({ calendar: { connect: true } })}
          >
            {t("inboxAssistant:settings.calendar.connect")}
          </button>
        </div>
      )}
      {calendar.connected && calendar.accountEmail && (
        <div className="ia-status-banner ia-status-banner--success">
          <span className="ia-status-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            {t("inboxAssistant:settings.calendar.account", {
              email: calendar.accountEmail,
            })}
          </span>
        </div>
      )}

      <div className="ia-settings-grid">
        <label className="ia-check ia-check--primary">
          <input
            type="checkbox"
            checked={settings.calendar.syncOn !== false}
            disabled={saving || !calendar.connected}
            onChange={(event) =>
              onSave({ calendar: { syncOn: event.target.checked } })
            }
          />
          <span className="ia-check-label">
            <strong>{t("inboxAssistant:settings.calendar.syncOn")}</strong>
            <small className="ia-hint">
              {t(
                calendar.connected
                  ? "inboxAssistant:settings.calendar.syncHint"
                  : "inboxAssistant:settings.calendar.syncOffHow",
              )}
            </small>
          </span>
        </label>

        <label
          className="ia-check ia-check--primary"
          style={{
            opacity:
              calendar.connected && settings.calendar.syncOn !== false
                ? 1
                : 0.5,
            pointerEvents:
              calendar.connected && settings.calendar.syncOn !== false
                ? "auto"
                : "none",
          }}
        >
          <input
            type="checkbox"
            checked={autoAdd}
            disabled={
              saving ||
              !calendar.connected ||
              settings.calendar.syncOn === false
            }
            onChange={(event) =>
              onSave({ calendar: { autoAdd: event.target.checked } })
            }
          />
          <span className="ia-check-label">
            <strong>{t("inboxAssistant:settings.calendar.autoAdd")}</strong>
            <small className="ia-hint">
              {t("inboxAssistant:settings.calendar.autoAddHint")}
            </small>
          </span>
        </label>
      </div>

      <div
        className="ia-check-group ia-check-group--grid"
        aria-label={t("inboxAssistant:settings.calendar.autoAddFrom")}
      >
        <span className="ia-check-group-title">
          {t("inboxAssistant:settings.calendar.autoAddFrom")}
        </span>
        {CALENDAR_SENDER_GROUPS.map((group) => (
          <label className="ia-check" key={group}>
            <input
              type="checkbox"
              checked={senders[group] !== false}
              disabled={
                saving ||
                !autoAdd ||
                !calendar.connected ||
                settings.calendar.syncOn === false
              }
              onChange={(event) =>
                onSave({
                  calendar: {
                    autoAddSenders: { [group]: event.target.checked },
                  },
                })
              }
            />
            <span>
              {t(`inboxAssistant:settings.calendar.senders.${group}`)}
            </span>
          </label>
        ))}
        {!autoAdd && (
          <small className="ia-hint">
            {t("inboxAssistant:settings.calendar.sendersLocked")}
          </small>
        )}
      </div>

      <label className="ia-field ia-field--number">
        <span>
          {t("inboxAssistant:settings.calendar.meetingLengthMinutes")}
        </span>
        <div className="ia-number-input">
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
          <span className="ia-number-suffix">min</span>
        </div>
        <small id="ia-meeting-length-hint" className="ia-hint">
          {t("inboxAssistant:settings.calendar.meetingLengthHint")}
        </small>
      </label>

      <div className="ia-settings-subsection">
        <h4 className="ia-subsection-title">
          {t("inboxAssistant:settings.calendar.reminders")}
        </h4>
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
      </div>

      <label className="ia-check ia-check--primary">
        <input
          type="checkbox"
          checked={settings.calendar.overlapEmail !== false}
          disabled={saving}
          onChange={(event) =>
            onSave({ calendar: { overlapEmail: event.target.checked } })
          }
        />
        <span className="ia-check-label">
          <strong>{t("inboxAssistant:settings.calendar.overlapEmail")}</strong>
          <small className="ia-hint">
            {t("inboxAssistant:settings.calendar.overlapEmailHint")}
          </small>
        </span>
      </label>
    </CollapsibleSection>
  );
}

const CHECK_TIME_PRESETS = [
  { time: "07:00", key: "morning" },
  { time: "18:00", key: "evening" },
  { time: "00:00", key: "midnight" },
];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function NewsletterSection({ settings, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const cfg = settings.newsletterAutoReply || {};
  const times = cfg.checkTimes || [];
  const [hours, setHours] = useState(String(cfg.hoursBeforeDeadline ?? 3));
  const [knownHours, setKnownHours] = useState(cfg.hoursBeforeDeadline ?? 3);
  const [customTime, setCustomTime] = useState("");
  const [timeError, setTimeError] = useState(false);

  if ((cfg.hoursBeforeDeadline ?? 3) !== knownHours) {
    setKnownHours(cfg.hoursBeforeDeadline ?? 3);
    setHours(String(cfg.hoursBeforeDeadline ?? 3));
  }

  const commitHours = () => {
    const value = Math.min(Math.max(Math.round(Number(hours) || 0), 0), 24);
    setHours(String(value));
    if (value !== cfg.hoursBeforeDeadline) {
      onSave({ newsletterAutoReply: { hoursBeforeDeadline: value } });
    }
  };

  const addTime = () => {
    if (!TIME_PATTERN.test(customTime) || times.includes(customTime)) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    setCustomTime("");
    onSave({
      newsletterAutoReply: { checkTimes: [...times, customTime].sort() },
    });
  };

  const removeTime = (time) => {
    if (times.length <= 1) return;
    onSave({
      newsletterAutoReply: {
        checkTimes: times.filter((entry) => entry !== time),
      },
    });
  };

  const presetKey = (time) =>
    CHECK_TIME_PRESETS.find((preset) => preset.time === time)?.key;

  return (
    <CollapsibleSection
      title="newsletterAutoReply.title"
      defaultOpen={cfg.enabled === true}
      saving={saving}
      className="ia-section--featured"
    >
      <div className="ia-section-header">
        <p className="ia-hint">
          {t("inboxAssistant:settings.newsletterAutoReply.intro")}
        </p>
        {cfg.sendAvailable !== true && (
          <div className="ia-status-banner ia-status-banner--info">
            <span className="ia-status-icon" aria-hidden="true">
              ℹ
            </span>
            <span>
              {t("inboxAssistant:settings.newsletterAutoReply.rolloutNotice")}
            </span>
          </div>
        )}
      </div>

      <div className="ia-settings-grid">
        <label className="ia-check ia-check--primary ia-check--required">
          <input
            type="checkbox"
            checked={cfg.confirmedRisk === true}
            disabled={saving}
            onChange={(event) =>
              onSave({
                newsletterAutoReply: { confirmedRisk: event.target.checked },
              })
            }
          />
          <span className="ia-check-label">
            <strong>
              {t("inboxAssistant:settings.newsletterAutoReply.risk")}
            </strong>
            <small className="ia-hint ia-hint--warning">
              {t("inboxAssistant:settings.newsletterAutoReply.riskDetail")}
            </small>
          </span>
        </label>

        <label
          className="ia-check ia-check--primary"
          style={{
            opacity: cfg.confirmedRisk === true ? 1 : 0.5,
            pointerEvents: cfg.confirmedRisk === true ? "auto" : "none",
          }}
        >
          <input
            type="checkbox"
            checked={cfg.enabled === true}
            disabled={saving || cfg.confirmedRisk !== true}
            onChange={(event) =>
              onSave({
                newsletterAutoReply: event.target.checked
                  ? { enabled: true, confirmedRisk: true }
                  : { enabled: false },
              })
            }
          />
          <span className="ia-check-label">
            <strong>
              {t("inboxAssistant:settings.newsletterAutoReply.enabled")}
            </strong>
            {cfg.confirmedRisk !== true && (
              <small className="ia-hint ia-hint--locked">
                {t("inboxAssistant:settings.newsletterAutoReply.enabledLocked")}
              </small>
            )}
          </span>
        </label>
      </div>

      <div
        className="ia-radio-group"
        aria-label={t(
          "inboxAssistant:settings.newsletterAutoReply.deliveryMode",
        )}
      >
        <span className="ia-radio-group-title">
          {t("inboxAssistant:settings.newsletterAutoReply.deliveryMode")}
        </span>
        <label className="ia-radio">
          <input
            type="radio"
            name="ia-newsletter-delivery"
            checked={(cfg.deliveryMode || "draft_only") === "draft_only"}
            disabled={saving}
            onChange={() =>
              onSave({ newsletterAutoReply: { deliveryMode: "draft_only" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.newsletterAutoReply.deliveryDraft")}
            </strong>
            <small className="ia-hint">
              {t(
                "inboxAssistant:settings.newsletterAutoReply.deliveryDraftHint",
              )}
            </small>
          </span>
        </label>
        <label
          className="ia-radio"
          style={{
            opacity: cfg.sendAvailable === true ? 1 : 0.5,
            pointerEvents: cfg.sendAvailable === true ? "auto" : "none",
          }}
        >
          <input
            type="radio"
            name="ia-newsletter-delivery"
            checked={cfg.deliveryMode === "send"}
            disabled={saving || cfg.sendAvailable !== true}
            onChange={() =>
              onSave({ newsletterAutoReply: { deliveryMode: "send" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.newsletterAutoReply.deliverySend")}
            </strong>
            {cfg.sendAvailable !== true && (
              <small className="ia-hint ia-hint--locked">
                {t(
                  "inboxAssistant:settings.newsletterAutoReply.deliverySendLocked",
                )}
              </small>
            )}
          </span>
        </label>
      </div>

      <label className="ia-field ia-field--number">
        <span>
          {t("inboxAssistant:settings.newsletterAutoReply.hoursBeforeDeadline")}
        </span>
        <div className="ia-number-input">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={24}
            step="1"
            value={hours}
            disabled={saving}
            onChange={(event) => setHours(event.target.value)}
            onBlur={commitHours}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitHours();
              event.currentTarget.blur();
            }}
            aria-describedby="ia-newsletter-hours-hint"
          />
          <span className="ia-number-suffix">hrs</span>
        </div>
        <small id="ia-newsletter-hours-hint" className="ia-hint">
          {t("inboxAssistant:settings.newsletterAutoReply.hoursHint")}
        </small>
      </label>

      <div className="ia-field ia-field--timechips">
        <span>
          {t("inboxAssistant:settings.newsletterAutoReply.checkTimes")}
        </span>
        <div className="ia-time-chips">
          {times.map((time) => (
            <span key={time} className="ia-time-chip">
              {presetKey(time)
                ? t(
                    `inboxAssistant:settings.newsletterAutoReply.presets.${presetKey(time)}`,
                  )
                : time}
              <button
                type="button"
                disabled={saving || times.length <= 1}
                aria-label={t(
                  "inboxAssistant:settings.newsletterAutoReply.removeTime",
                  { time },
                )}
                title={
                  times.length <= 1
                    ? t("inboxAssistant:settings.newsletterAutoReply.lastTime")
                    : t(
                        "inboxAssistant:settings.newsletterAutoReply.removeTime",
                        { time },
                      )
                }
                onClick={() => removeTime(time)}
                className="ia-time-chip-remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="ia-time-add">
          <input
            type="time"
            value={customTime}
            disabled={saving}
            aria-label={t(
              "inboxAssistant:settings.newsletterAutoReply.addTimeLabel",
            )}
            onChange={(event) => {
              setCustomTime(event.target.value);
              setTimeError(false);
            }}
            className="ia-time-input"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving || !customTime}
            onClick={addTime}
          >
            {t("inboxAssistant:settings.newsletterAutoReply.addTime")}
          </button>
        </div>
        {timeError && (
          <small className="ia-hint ia-time-error">
            {t("inboxAssistant:settings.newsletterAutoReply.invalidTime")}
          </small>
        )}
        <small className="ia-hint">
          {t("inboxAssistant:settings.newsletterAutoReply.checkTimesHint")}
        </small>
      </div>
    </CollapsibleSection>
  );
}

function HomeworkSection({ settings, saving, onSave }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const cfg = settings.homeworkAutoReply || {};
  const [days, setDays] = useState(String(cfg.daysAhead ?? 7));
  const [knownDays, setKnownDays] = useState(cfg.daysAhead ?? 7);

  if ((cfg.daysAhead ?? 7) !== knownDays) {
    setKnownDays(cfg.daysAhead ?? 7);
    setDays(String(cfg.daysAhead ?? 7));
  }

  const commitDays = () => {
    const value = Math.min(Math.max(Math.round(Number(days) || 7), 1), 14);
    setDays(String(value));
    if (value !== cfg.daysAhead) {
      onSave({ homeworkAutoReply: { daysAhead: value } });
    }
  };

  return (
    <CollapsibleSection
      title="homeworkAutoReply.title"
      defaultOpen={cfg.enabled === true}
      saving={saving}
      className="ia-section--featured"
    >
      <div className="ia-section-header">
        <p className="ia-hint">
          {t("inboxAssistant:settings.homeworkAutoReply.intro")}
        </p>
        {cfg.sendAvailable !== true && (
          <div className="ia-status-banner ia-status-banner--info">
            <span className="ia-status-icon" aria-hidden="true">
              ℹ
            </span>
            <span>
              {t("inboxAssistant:settings.homeworkAutoReply.rolloutNotice")}
            </span>
          </div>
        )}
      </div>

      <div className="ia-settings-grid">
        <label className="ia-check ia-check--primary ia-check--required">
          <input
            type="checkbox"
            checked={cfg.confirmedRisk === true}
            disabled={saving}
            onChange={(event) =>
              onSave({
                homeworkAutoReply: { confirmedRisk: event.target.checked },
              })
            }
          />
          <span className="ia-check-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.risk")}
            </strong>
            <small className="ia-hint ia-hint--warning">
              {t("inboxAssistant:settings.homeworkAutoReply.riskDetail")}
            </small>
          </span>
        </label>

        <label
          className="ia-check ia-check--primary"
          style={{
            opacity: cfg.confirmedRisk === true ? 1 : 0.5,
            pointerEvents: cfg.confirmedRisk === true ? "auto" : "none",
          }}
        >
          <input
            type="checkbox"
            checked={cfg.enabled === true}
            disabled={saving || cfg.confirmedRisk !== true}
            onChange={(event) =>
              onSave({
                homeworkAutoReply: event.target.checked
                  ? { enabled: true, confirmedRisk: true }
                  : { enabled: false },
              })
            }
          />
          <span className="ia-check-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.enabled")}
            </strong>
            {cfg.confirmedRisk !== true && (
              <small className="ia-hint ia-hint--locked">
                {t("inboxAssistant:settings.homeworkAutoReply.enabledLocked")}
              </small>
            )}
          </span>
        </label>
      </div>

      <div
        className="ia-radio-group"
        aria-label={t("inboxAssistant:settings.homeworkAutoReply.deliveryMode")}
      >
        <span className="ia-radio-group-title">
          {t("inboxAssistant:settings.homeworkAutoReply.deliveryMode")}
        </span>
        <label className="ia-radio">
          <input
            type="radio"
            name="ia-homework-delivery"
            checked={(cfg.deliveryMode || "draft_only") === "draft_only"}
            disabled={saving}
            onChange={() =>
              onSave({ homeworkAutoReply: { deliveryMode: "draft_only" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.deliveryDraft")}
            </strong>
            <small className="ia-hint">
              {t("inboxAssistant:settings.homeworkAutoReply.deliveryDraftHint")}
            </small>
          </span>
        </label>
        <label
          className="ia-radio"
          style={{
            opacity: cfg.sendAvailable === true ? 1 : 0.5,
            pointerEvents: cfg.sendAvailable === true ? "auto" : "none",
          }}
        >
          <input
            type="radio"
            name="ia-homework-delivery"
            checked={cfg.deliveryMode === "send"}
            disabled={saving || cfg.sendAvailable !== true}
            onChange={() =>
              onSave({ homeworkAutoReply: { deliveryMode: "send" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.deliverySend")}
            </strong>
            {cfg.sendAvailable !== true && (
              <small className="ia-hint ia-hint--locked">
                {t(
                  "inboxAssistant:settings.homeworkAutoReply.deliverySendLocked",
                )}
              </small>
            )}
          </span>
        </label>
      </div>

      <div
        className="ia-radio-group"
        aria-label={t("inboxAssistant:settings.homeworkAutoReply.scope")}
      >
        <span className="ia-radio-group-title">
          {t("inboxAssistant:settings.homeworkAutoReply.scope")}
        </span>
        <label className="ia-radio">
          <input
            type="radio"
            name="ia-homework-scope"
            checked={(cfg.scope || "own_subject") === "own_subject"}
            disabled={saving}
            onChange={() =>
              onSave({ homeworkAutoReply: { scope: "own_subject" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.scopeOwn")}
            </strong>
            <small className="ia-hint">
              {t("inboxAssistant:settings.homeworkAutoReply.scopeOwnHint")}
            </small>
          </span>
        </label>
        <label className="ia-radio">
          <input
            type="radio"
            name="ia-homework-scope"
            checked={cfg.scope === "whole_class"}
            disabled={saving}
            onChange={() =>
              onSave({ homeworkAutoReply: { scope: "whole_class" } })
            }
          />
          <span className="ia-radio-label">
            <strong>
              {t("inboxAssistant:settings.homeworkAutoReply.scopeWhole")}
            </strong>
            <small className="ia-hint">
              {t("inboxAssistant:settings.homeworkAutoReply.scopeWholeHint")}
            </small>
          </span>
        </label>
      </div>

      <label className="ia-field ia-field--number">
        <span>{t("inboxAssistant:settings.homeworkAutoReply.daysAhead")}</span>
        <div className="ia-number-input">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            step="1"
            value={days}
            disabled={saving}
            onChange={(event) => setDays(event.target.value)}
            onBlur={commitDays}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitDays();
              event.currentTarget.blur();
            }}
            aria-describedby="ia-homework-days-hint"
          />
          <span className="ia-number-suffix">days</span>
        </div>
        <small id="ia-homework-days-hint" className="ia-hint">
          {t("inboxAssistant:settings.homeworkAutoReply.daysHint")}
        </small>
      </label>
    </CollapsibleSection>
  );
}

export default function SettingsPanel({
  settings,
  calendar,
  saving,
  onClose,
  onSave,
  onDelete,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [signature, setSignature] = useState(settings.signature || "");
  const [nudge, setNudge] = useState(String(settings.nudgeAfterDays ?? 2));
  const [knownSignature, setKnownSignature] = useState(
    settings.signature || "",
  );
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
    <section
      className="ia-panel ia-settings"
      aria-labelledby="ia-settings-title"
    >
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

      <div className="ia-settings-body">
        <CollapsibleSection title="general" defaultOpen={true} saving={saving}>
          <label className="ia-field ia-field--textarea">
            <span>{t("inboxAssistant:settings.signature")}</span>
            <textarea
              rows={3}
              maxLength={500}
              value={signature}
              disabled={saving}
              onChange={(event) => setSignature(event.target.value)}
              onBlur={commitSignature}
              aria-describedby="ia-signature-hint"
              placeholder={t("inboxAssistant:settings.signaturePlaceholder")}
            />
            <small id="ia-signature-hint" className="ia-hint">
              {t("inboxAssistant:settings.signatureHint")}
            </small>
          </label>

          <div className="ia-settings-grid">
            <label className="ia-check ia-check--primary">
              <input
                type="checkbox"
                checked={Boolean(settings.includeCcByDefault)}
                disabled={saving}
                onChange={(event) =>
                  onSave({ includeCcByDefault: event.target.checked })
                }
              />
              <span className="ia-check-label">
                <strong>{t("inboxAssistant:settings.includeCc")}</strong>
                <small className="ia-hint">
                  {t("inboxAssistant:settings.includeCcHint")}
                </small>
              </span>
            </label>

            <label className="ia-field ia-field--number">
              <span>{t("inboxAssistant:settings.nudgeAfterDays")}</span>
              <div className="ia-number-input">
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
                <span className="ia-number-suffix">days</span>
              </div>
              <small id="ia-nudge-hint" className="ia-hint">
                {t("inboxAssistant:settings.nudgeHint")}
              </small>
            </label>
          </div>
        </CollapsibleSection>

        <AutoScanSection settings={settings} saving={saving} onSave={onSave} />

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

        <NewsletterSection
          settings={settings}
          saving={saving}
          onSave={onSave}
        />

        <HomeworkSection settings={settings} saving={saving} onSave={onSave} />

        <div
          className="ia-danger ia-collapsible"
          style={{
            borderTop: "1px solid var(--border-color)",
            marginTop: "var(--spacing-lg)",
            paddingTop: "var(--spacing-lg)",
          }}
        >
          <div className="ia-collapsible-legend" style={{ cursor: "pointer" }}>
            <span className="ia-collapsible-icon" aria-hidden="true">
              ▼
            </span>
            <span className="ia-danger-title">
              {t("inboxAssistant:settings.deleteTitle")}
            </span>
          </div>
          <div className="ia-collapsible-content">
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
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={saving}
              onClick={() => setConfirming(true)}
            >
              {t("inboxAssistant:settings.delete")}
            </button>
          </div>
        </div>

        {confirming && (
          <ConfirmDialog
            titleId="ia-delete-title"
            onClose={() => !deleting && setConfirming(false)}
          >
            <h2 id="ia-delete-title">
              {t("inboxAssistant:settings.deleteConfirmTitle")}
            </h2>
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
                {t(
                  deleting
                    ? "inboxAssistant:settings.deleting"
                    : "inboxAssistant:settings.deleteConfirm",
                )}
              </button>
            </div>
          </ConfirmDialog>
        )}
      </div>
    </section>
  );
}
