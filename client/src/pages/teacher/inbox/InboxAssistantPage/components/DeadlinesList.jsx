import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlinePlus,
} from "react-icons/hi2";
import {
  deadlineDateKey,
  dueAtFromLocalInput,
  formatDeadlineDate,
  localDateInputValue,
  localDateTimeInputValue,
  reminderFromOption,
  reminderOptionFor,
} from "../inboxUi.js";

const REMIND_OPTIONS = ["none", "oneDay", "twoHours", "custom"];

function EditDateForm({ deadline, saving, onSave, onCancel }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [value, setValue] = useState(
    deadline.dueDateOnly
      ? localDateInputValue(deadline.dueAt)
      : localDateTimeInputValue(deadline.dueAt),
  );

  const save = () => {
    const parsed = new Date(value);
    const dueAt = deadline.dueDateOnly
      ? dueAtFromLocalInput({ date: value })
      : (Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString());
    if (!dueAt) return;
    onSave({ dueAt, dueDateOnly: deadline.dueDateOnly });
  };

  return (
    <div className="ia-deadline-edit">
      <input
        type={deadline.dueDateOnly ? "date" : "datetime-local"}
        className="input"
        aria-label={t("inboxAssistant:deadlines.dateLabel")}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="button" className="btn btn-primary btn-sm" disabled={saving || !value} onClick={save}>
        {t("inboxAssistant:deadlines.save")}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onCancel}>
        {t("inboxAssistant:deadlines.cancel")}
      </button>
    </div>
  );
}

function ProposedRow({ deadline, language, index = 0, saving, onConfirm, onDismiss, onUpdateDue }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [editing, setEditing] = useState(false);

  return (
    <li className="ia-deadline is-proposed" style={{ "--ia-i": index }}>
      <div className="ia-deadline-main">
        <strong className="ia-deadline-title">{deadline.title}</strong>
        <span className="ia-deadline-date">
          <HiOutlineClock size={14} aria-hidden="true" />
          {formatDeadlineDate(deadline.dueAt, { language, dueDateOnly: deadline.dueDateOnly })}
        </span>
        {deadline.quote && <blockquote className="ia-deadline-quote">{deadline.quote}</blockquote>}
        {editing && (
          <EditDateForm
            deadline={deadline}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={async (patch) => {
              const saved = await onUpdateDue(deadline.id, patch);
              if (saved) setEditing(false);
            }}
          />
        )}
      </div>
      <div className="ia-deadline-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onConfirm(deadline.id)}
        >
          <HiOutlineCheck size={15} aria-hidden="true" />
          {t("inboxAssistant:deadlines.confirm")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={saving}
          onClick={() => setEditing((current) => !current)}
        >
          {t("inboxAssistant:deadlines.editDate")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={saving}
          onClick={() => onDismiss(deadline.id)}
        >
          {t("inboxAssistant:deadlines.notDeadline")}
        </button>
      </div>
    </li>
  );
}

function ConfirmedRow({ deadline, language, index = 0, saving, onDone, onRemind }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const initialOption = reminderOptionFor(deadline);
  const [option, setOption] = useState(initialOption);
  const [customValue, setCustomValue] = useState(
    localDateTimeInputValue(deadline.remindAt || deadline.dueAt),
  );
  const chipKey = deadlineDateKey(deadline.dueAt);
  const chipClass = chipKey === "deadlines.overdue"
    ? "is-overdue"
    : (chipKey === "deadlines.today" ? "is-today" : "is-tomorrow");

  const changeOption = (next) => {
    setOption(next);
    if (next === "custom") return;
    onRemind(deadline.id, reminderFromOption(next, deadline));
  };

  const saveCustom = () => {
    const date = new Date(customValue);
    if (Number.isNaN(date.getTime())) return;
    onRemind(deadline.id, date.toISOString());
  };

  return (
    <li
      className={`ia-deadline is-confirmed ${chipKey ? chipClass : ""}`}
      style={{ "--ia-i": index }}
    >
      <div className="ia-deadline-main">
        <strong className="ia-deadline-title">{deadline.title}</strong>
        <span className="ia-deadline-date">
          <HiOutlineClock size={14} aria-hidden="true" />
          {formatDeadlineDate(deadline.dueAt, { language, dueDateOnly: deadline.dueDateOnly })}
        </span>
        {chipKey && <span className={`ia-chip ia-deadline-chip ${chipClass}`}>{t(`inboxAssistant:${chipKey}`)}</span>}
      </div>
      <div className="ia-deadline-actions">
        <label className="ia-remind">
          <span>{t("inboxAssistant:deadlines.remindLabel")}</span>
          <select
            className="input"
            value={option}
            disabled={saving}
            onChange={(event) => changeOption(event.target.value)}
          >
            {REMIND_OPTIONS.map((key) => (
              <option key={key} value={key}>{t(`inboxAssistant:deadlines.remind.${key}`)}</option>
            ))}
          </select>
        </label>
        {option === "custom" && (
          <span className="ia-remind-custom">
            <input
              type="datetime-local"
              className="input"
              aria-label={t("inboxAssistant:deadlines.remindAt")}
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={saveCustom}>
              {t("inboxAssistant:deadlines.save")}
            </button>
          </span>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onDone(deadline.id)}
        >
          <HiOutlineCheck size={15} aria-hidden="true" />
          {t("inboxAssistant:deadlines.done")}
        </button>
      </div>
    </li>
  );
}

function AddDeadlineForm({ creating, onAdd }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const dueAt = dueAtFromLocalInput({ date, time });
    if (!title.trim() || !dueAt) return;
    const created = await onAdd({ title: title.trim(), dueAt, dueDateOnly: !time });
    if (created) {
      setTitle("");
      setDate("");
      setTime("");
    }
  };

  return (
    <form className="ia-deadline-add" onSubmit={submit}>
      <h3>
        <HiOutlinePlus size={16} aria-hidden="true" />
        {t("inboxAssistant:deadlines.addTitle")}
      </h3>
      <div className="ia-deadline-add-row">
        <label>
          <span>{t("inboxAssistant:deadlines.titleLabel")}</span>
          <input
            className="input"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("inboxAssistant:deadlines.titlePlaceholder")}
          />
        </label>
        <label>
          <span>{t("inboxAssistant:deadlines.dateLabel")}</span>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          <span>{t("inboxAssistant:deadlines.timeLabel")}</span>
          <input
            type="time"
            className="input"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !title.trim() || !date}>
          {creating
            ? <span className="ia-btn-spinner" aria-hidden="true" />
            : <HiOutlinePlus size={15} aria-hidden="true" />}
          {t("inboxAssistant:deadlines.add")}
        </button>
      </div>
    </form>
  );
}

export default function DeadlinesList({ list, language, onRetry }) {
  const { t } = useTranslation(["inboxAssistant"]);

  const proposed = list.deadlines
    .filter((deadline) => deadline.state === "proposed")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const confirmed = list.deadlines
    .filter((deadline) => deadline.state === "confirmed")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (list.state === "loading" || list.state === "idle") {
    return (
      <div className="ia-skeleton-state" role="status">
        <span className="ia-sr-only">{t("inboxAssistant:deadlines.loading")}</span>
        <div className="ia-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="ia-skeleton-row" style={{ "--ia-i": row }}>
              <span className="ia-skeleton-line is-title" />
              <span className="ia-skeleton-line is-meta" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (list.state === "error") {
    return (
      <div className="ia-list-state" role="alert">
        <p>{t("inboxAssistant:deadlines.loadFailed")}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t("inboxAssistant:retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="ia-deadlines">
      {proposed.length > 0 && (
        <section className="ia-deadline-proposed" aria-label={t("inboxAssistant:deadlines.checkTitle")}>
          <div className="ia-deadline-banner">
            <span className="ia-banner-icon" aria-hidden="true">
              <HiOutlineCalendarDays size={18} />
            </span>
            <div>
              <strong>{t("inboxAssistant:deadlines.checkTitle")}</strong>
              <p>{t("inboxAssistant:deadlines.checkBody")}</p>
            </div>
          </div>
          <ul className="ia-deadline-rows">
            {proposed.map((deadline, index) => (
              <ProposedRow
                key={deadline.id}
                deadline={deadline}
                language={language}
                index={index}
                saving={list.savingId === deadline.id}
                onConfirm={list.confirm}
                onDismiss={list.dismiss}
                onUpdateDue={list.updateDue}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t("inboxAssistant:deadlines.confirmedTitle")}>
        <h3 className="ia-deadline-section-title">
          {t("inboxAssistant:deadlines.confirmedTitle")}
          {confirmed.length > 0 && <span className="ia-count">{confirmed.length}</span>}
        </h3>
        {confirmed.length === 0 ? (
          <div className="ia-list-state ia-empty">
            <span className="ia-empty-icon" aria-hidden="true">
              <HiOutlineCalendarDays size={22} />
            </span>
            <strong>{t("inboxAssistant:deadlines.empty")}</strong>
          </div>
        ) : (
          <ul className="ia-deadline-rows">
            {confirmed.map((deadline, index) => (
              <ConfirmedRow
                key={deadline.id}
                deadline={deadline}
                language={language}
                index={index}
                saving={list.savingId === deadline.id}
                onDone={list.markDone}
                onRemind={list.setReminder}
              />
            ))}
          </ul>
        )}
      </section>

      <AddDeadlineForm creating={list.creating} onAdd={list.add} />
    </div>
  );
}
