import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlinePlus,
} from "react-icons/hi2";
import {
  deadlineDateKey,
  instantFromLocalInput,
  localDateInputValue,
  localDateTimeInputValue,
  reminderFromOption,
  reminderOptionFor,
} from "../inboxUi.js";
import { formatClock } from "./display.js";
import CalendarChips from "./CalendarChips.jsx";
import ChangeBanner from "./ChangeBanner.jsx";
import DatePill from "./DatePill.jsx";

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
      ? instantFromLocalInput({ date: value })
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

function ProposedRow({
  deadline,
  language,
  index = 0,
  saving,
  sender,
  usable,
  actions,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [editing, setEditing] = useState(false);
  const source = [
    deadline.quote ? t("inboxAssistant:deadlines.quote", { quote: deadline.quote }) : "",
    sender,
  ].filter(Boolean).join(" · ");

  return (
    <li className="ia-deadline is-proposed" style={{ "--ia-i": index }}>
      <DatePill at={deadline.dueAt} allDay={deadline.dueDateOnly} language={language} />
      <div className="ia-deadline-main">
        <strong className="ia-deadline-title">{deadline.title}</strong>
        {source && <span className="ia-deadline-meta">{source}</span>}
        <span className="ia-chip is-found">{t("inboxAssistant:deadlines.foundInEmail")}</span>

        <CalendarChips
          item={deadline}
          saving={saving}
          usable={usable}
          hideAddAction={Boolean(deadline.pendingChange?.kind)}
          onAdd={actions.addToCalendar}
          onRemove={actions.removeFromCalendar}
          onUndo={(id) => actions.removeFromCalendar(id, true)}
        />

        <ChangeBanner
          item={deadline}
          kind="deadline"
          language={language}
          saving={saving}
          onDecide={actions.decideChange}
        />

        {editing && (
          <EditDateForm
            deadline={deadline}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={async (patch) => {
              const saved = await actions.updateDue(deadline.id, patch);
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
          onClick={() => actions.confirm(deadline.id)}
        >
          <HiOutlineCheck size={14} aria-hidden="true" />
          {t(usable
            ? "inboxAssistant:deadlines.confirmAndAdd"
            : "inboxAssistant:deadlines.confirm")}
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
          onClick={() => actions.dismiss(deadline.id)}
        >
          {t("inboxAssistant:deadlines.notDeadline")}
        </button>
      </div>
    </li>
  );
}

function ConfirmedRow({ deadline, language, index = 0, saving, sender, usable, actions }) {
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
  // On Google Calendar the reminder is Google's job, so the selector goes away and
  // comes back on its own if the event is removed.
  const synced = deadline.calendar?.status === "synced";
  const meta = [
    sender ? t("inboxAssistant:deadlines.confirmedFrom", { sender }) : "",
    deadline.dueDateOnly ? "" : formatClock(deadline.dueAt, language),
  ].filter(Boolean).join(" · ");

  const changeOption = (next) => {
    setOption(next);
    if (next === "custom") return;
    actions.setReminder(deadline.id, reminderFromOption(next, deadline));
  };

  const saveCustom = () => {
    const date = new Date(customValue);
    if (Number.isNaN(date.getTime())) return;
    actions.setReminder(deadline.id, date.toISOString());
  };

  return (
    <li
      className={`ia-deadline is-confirmed ${chipKey ? chipClass : ""}`}
      style={{ "--ia-i": index }}
    >
      <DatePill at={deadline.dueAt} allDay={deadline.dueDateOnly} language={language} />
      <div className="ia-deadline-main">
        <strong className="ia-deadline-title">{deadline.title}</strong>
        {meta && <span className="ia-deadline-meta">{meta}</span>}
        {chipKey && <span className={`ia-chip ${chipClass}`}>{t(`inboxAssistant:${chipKey}`)}</span>}

        <CalendarChips
          item={deadline}
          saving={saving}
          usable={usable}
          hideAddAction={Boolean(deadline.pendingChange?.kind)}
          onAdd={actions.addToCalendar}
          onRemove={actions.removeFromCalendar}
          onUndo={(id) => actions.removeFromCalendar(id, true)}
        />

        <ChangeBanner
          item={deadline}
          kind="deadline"
          language={language}
          saving={saving}
          onDecide={actions.decideChange}
        />
      </div>
      <div className="ia-deadline-actions">
        {synced ? (
          <span className="ia-remind-note">
            {t("inboxAssistant:deadlines.remindInGoogle")}
          </span>
        ) : (
          <>
            <label className="ia-remind">
              <span>{t("inboxAssistant:deadlines.remindLabel")}</span>
              <select
                className="ia-select"
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
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={saving}
                  onClick={saveCustom}
                >
                  {t("inboxAssistant:deadlines.save")}
                </button>
              </span>
            )}
          </>
        )}
        {!synced && usable
          && deadline.calendar?.status !== "failed"
          && !deadline.pendingChange?.kind && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={() => actions.addToCalendar(deadline.id)}
          >
            <HiOutlineCalendarDays size={14} aria-hidden="true" />
            {t("inboxAssistant:calendar.addToCalendar")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={saving}
          onClick={() => actions.markDone(deadline.id)}
        >
          <HiOutlineCheck size={14} aria-hidden="true" />
          {t("inboxAssistant:deadlines.done")}
        </button>
      </div>
    </li>
  );
}

function AddDeadlineForm({ creating, seedTitle = "", onAdd, onSeedUsed }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [title, setTitle] = useState(seedTitle);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const dueAt = instantFromLocalInput({ date, time });
    if (!title.trim() || !dueAt) return;
    const created = await onAdd({ title: title.trim(), dueAt, dueDateOnly: !time });
    if (created) {
      setTitle("");
      setDate("");
      setTime("");
      onSeedUsed?.();
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

export default function DeadlinesList({ list, language, onRetry, seedTitle = "", onSeedUsed, senderFor, usable }) {
  const { t } = useTranslation(["inboxAssistant"]);

  const proposed = list.deadlines
    .filter((deadline) => deadline.state === "proposed")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const confirmed = list.deadlines
    .filter((deadline) => deadline.state === "confirmed")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  /** The hook is the row's action set; every calendar call lives on it too. */
  const rowProps = (deadline, index) => ({
    key: deadline.id,
    deadline,
    language,
    index,
    saving: list.savingId === deadline.id,
    sender: senderFor?.(deadline.emailId) || "",
    usable,
    actions: list,
  });

  if (list.state === "loading" || list.state === "idle") {
    return (
      <div className="ia-skeleton-state" role="status">
        <span className="ia-sr-only">{t("inboxAssistant:deadlines.loading")}</span>
        <div className="ia-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="ia-skeleton-row" style={{ "--ia-i": row }}>
              <span className="ia-skeleton-avatar" />
              <div className="ia-skeleton-lines">
                <span className="ia-skeleton-line is-short" />
                <span className="ia-skeleton-line" />
              </div>
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
            {proposed.map((deadline, index) => <ProposedRow {...rowProps(deadline, index)} />)}
          </ul>
        </section>
      )}

      <section aria-label={t("inboxAssistant:deadlines.confirmedTitle")}>
        <h3 className="ia-deadline-section-title">
          {t("inboxAssistant:deadlines.confirmedTitle")}
          {confirmed.length > 0 && <span className="ia-tab-count">{confirmed.length}</span>}
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
            {confirmed.map((deadline, index) => <ConfirmedRow {...rowProps(deadline, index)} />)}
          </ul>
        )}
      </section>

      <AddDeadlineForm
        creating={list.creating}
        seedTitle={seedTitle}
        onAdd={list.add}
        onSeedUsed={onSeedUsed}
      />
    </div>
  );
}
