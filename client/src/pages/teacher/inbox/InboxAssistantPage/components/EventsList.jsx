import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineEnvelope,
  HiOutlinePencilSquare,
  HiOutlinePlus,
} from "react-icons/hi2";
import {
  eventWindowFromInput,
  localDateInputValue,
  localTimeInputValue,
  senderRoleKey,
} from "../inboxUi.js";
import { formatClock } from "./display.js";
import CalendarChips from "./CalendarChips.jsx";
import ChangeBanner from "./ChangeBanner.jsx";
import DatePill from "./DatePill.jsx";

function EventTimeRow({ event, language }) {
  const { t } = useTranslation(["inboxAssistant"]);
  return (
    <span className="ia-event-time">
      <bdi>
        {event.allDay
          ? t("inboxAssistant:events.allDay")
          : `${formatClock(event.startAt, language)} – ${formatClock(event.endAt, language)}`}
      </bdi>
      {event.endAssumed && (
        <em>{t("inboxAssistant:events.assumedEnd", { time: formatClock(event.endAt, language) })}</em>
      )}
    </span>
  );
}

function EditEventForm({ event, saving, onSave, onCancel }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [title, setTitle] = useState(event.title);
  const [allDay, setAllDay] = useState(Boolean(event.allDay));
  const [date, setDate] = useState(localDateInputValue(event.startAt));
  const [startTime, setStartTime] = useState(allDay ? "" : localTimeInputValue(event.startAt));
  const [endTime, setEndTime] = useState(
    allDay || event.endAssumed ? "" : localTimeInputValue(event.endAt),
  );
  const [location, setLocation] = useState(event.location || "");

  const save = () => {
    const span = eventWindowFromInput({ date, startTime, endTime, allDay });
    if (!span || !title.trim()) return;
    onSave({
      title: title.trim(),
      startAt: span.startAt,
      endAt: span.endAt,
      allDay,
      location: location.trim(),
    });
  };

  const valid = Boolean(title.trim())
    && Boolean(eventWindowFromInput({ date, startTime, endTime, allDay }));

  return (
    <div className="ia-event-edit">
      <label>
        <span>{t("inboxAssistant:events.titleLabel")}</span>
        <input
          className="input"
          maxLength={200}
          value={title}
          disabled={saving}
          onChange={(change) => setTitle(change.target.value)}
        />
      </label>
      <label className="ia-check">
        <input
          type="checkbox"
          checked={allDay}
          disabled={saving}
          onChange={(change) => setAllDay(change.target.checked)}
        />
        <span>{t("inboxAssistant:events.allDayLabel")}</span>
      </label>
      <label>
        <span>{t("inboxAssistant:events.dateLabel")}</span>
        <input
          type="date"
          className="input"
          value={date}
          disabled={saving}
          onChange={(change) => setDate(change.target.value)}
        />
      </label>
      {!allDay && (
        <>
          <label>
            <span>{t("inboxAssistant:events.startLabel")}</span>
            <input
              type="time"
              className="input"
              value={startTime}
              disabled={saving}
              onChange={(change) => setStartTime(change.target.value)}
            />
          </label>
          <label>
            <span>{t("inboxAssistant:events.endLabel")}</span>
            <input
              type="time"
              className="input"
              value={endTime}
              disabled={saving}
              onChange={(change) => setEndTime(change.target.value)}
            />
            <small className="ia-hint">{t("inboxAssistant:events.endHint")}</small>
          </label>
        </>
      )}
      <label>
        <span>{t("inboxAssistant:events.locationLabel")}</span>
        <input
          className="input"
          maxLength={300}
          value={location}
          disabled={saving}
          onChange={(change) => setLocation(change.target.value)}
          placeholder={t("inboxAssistant:events.locationPlaceholder")}
        />
      </label>
      <div className="ia-event-edit-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={saving || !valid} onClick={save}>
          {t("inboxAssistant:events.save")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onCancel}>
          {t("inboxAssistant:events.cancel")}
        </button>
      </div>
    </div>
  );
}

function EventRow({ event, language, index = 0, saving, sender, senderRole, usable, actions }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [editing, setEditing] = useState(false);
  const proposed = event.state === "proposed";
  const synced = event.calendar?.status === "synced";
  const roleKey = senderRoleKey(senderRole);

  const meta = [
    sender,
    roleKey ? t(`inboxAssistant:${roleKey}`) : "",
    event.location,
  ].filter(Boolean).join(" · ");

  const primary = () => {
    // Confirming is what puts a proposed event on the calendar, so saying "Add to
    // calendar" here would promise the chip's calendar-only click under a second name.
    if (proposed) return { label: "events.confirm", run: actions.confirm };
    if (synced || !usable) return null;
    // A failed or abandoned calendar call already carries its own click in the chip;
    // a second add button would just repeat the call that did not work.
    if (event.calendar?.status === "failed") return null;
    // Nothing about the date may move while a change is still waiting on the teacher.
    if (event.pendingChange?.kind) return null;
    return { label: "calendar.addToCalendar", run: actions.addToCalendar };
  };
  const mainAction = primary();

  return (
    <li
      className={`ia-deadline ia-event ${proposed ? "is-proposed" : "is-confirmed"}`}
      style={{ "--ia-i": index }}
    >
      <DatePill at={event.startAt} allDay={event.allDay} language={language} />

      <div className="ia-deadline-main">
        <strong className="ia-deadline-title">{event.title}</strong>
        <EventTimeRow event={event} language={language} />
        {meta && <span className="ia-deadline-meta">{meta}</span>}
        {event.quote && (
          <span className="ia-deadline-meta">
            {t("inboxAssistant:deadlines.quote", { quote: event.quote })}
          </span>
        )}
        {proposed && <span className="ia-chip is-found">{t("inboxAssistant:events.foundInEmail")}</span>}

        <CalendarChips
          item={event}
          saving={saving}
          usable={usable}
          hideAddAction={Boolean(event.pendingChange?.kind)}
          onAdd={actions.addToCalendar}
          onRemove={actions.removeFromCalendar}
          onUndo={(id) => actions.removeFromCalendar(id, true)}
        />

        <ChangeBanner
          item={event}
          kind="event"
          language={language}
          saving={saving}
          onDecide={actions.decideChange}
        />

        {editing && (
          <EditEventForm
            event={event}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={async (patch) => {
              const saved = await actions.update(event.id, patch);
              if (saved) setEditing(false);
            }}
          />
        )}
      </div>

      <div className="ia-deadline-actions">
        {mainAction && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => mainAction.run(event.id)}
          >
            <HiOutlineCheck size={14} aria-hidden="true" />
            {t(`inboxAssistant:${mainAction.label}`)}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={saving}
          onClick={() => setEditing((current) => !current)}
        >
          <HiOutlinePencilSquare size={14} aria-hidden="true" />
          {t("inboxAssistant:events.edit")}
        </button>
        {event.emailId && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => actions.openEmail(event.emailId)}
          >
            <HiOutlineEnvelope size={14} aria-hidden="true" />
            {t("inboxAssistant:events.openEmail")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={saving}
          onClick={() => actions.dismiss(event.id)}
        >
          {t("inboxAssistant:events.notEvent")}
        </button>
      </div>
    </li>
  );
}

function AddEventForm({ creating, onAdd }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");

  const span = eventWindowFromInput({ date, startTime, endTime, allDay });
  const valid = Boolean(title.trim()) && Boolean(span);

  const reset = () => {
    setTitle("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setAllDay(false);
  };

  const submit = async (formEvent) => {
    formEvent.preventDefault();
    if (!valid) return;
    const created = await onAdd({
      title: title.trim(),
      startAt: span.startAt,
      endAt: span.endAt,
      allDay,
      location: location.trim(),
    });
    if (created) {
      reset();
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <div className="ia-deadline-add is-collapsed">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(true)}
        >
          <HiOutlinePlus size={15} aria-hidden="true" />
          {t("inboxAssistant:events.addTitle")}
        </button>
      </div>
    );
  }

  return (
    <form className="ia-deadline-add" onSubmit={submit}>
      <h3>
        <HiOutlinePlus size={16} aria-hidden="true" />
        {t("inboxAssistant:events.addTitle")}
      </h3>
      <div className="ia-event-add-row">
        <label>
          <span>{t("inboxAssistant:events.titleLabel")}</span>
          <input
            className="input"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("inboxAssistant:events.titlePlaceholder")}
          />
        </label>
        <label>
          <span>{t("inboxAssistant:events.dateLabel")}</span>
          <input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="ia-check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
          />
          <span>{t("inboxAssistant:events.allDayLabel")}</span>
        </label>
        {!allDay && (
          <>
            <label>
              <span>{t("inboxAssistant:events.startLabel")}</span>
              <input
                type="time"
                className="input"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label>
              <span>{t("inboxAssistant:events.endLabel")}</span>
              <input
                type="time"
                className="input"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
              <small className="ia-hint">{t("inboxAssistant:events.endHint")}</small>
            </label>
          </>
        )}
        <label>
          <span>{t("inboxAssistant:events.locationLabel")}</span>
          <input
            className="input"
            maxLength={300}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={t("inboxAssistant:events.locationPlaceholder")}
          />
        </label>
        <div className="ia-event-add-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !valid}>
            {creating
              ? <span className="ia-btn-spinner" aria-hidden="true" />
              : <HiOutlinePlus size={15} aria-hidden="true" />}
            {t("inboxAssistant:events.add")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={creating}
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            {t("inboxAssistant:events.cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Meetings and events found in the mail, plus the ones the teacher adds by hand. */
export default function EventsList({ list, language, onRetry, senderFor, roleFor, calendarUsable, actions }) {
  const { t } = useTranslation(["inboxAssistant"]);

  const proposed = list.events
    .filter((event) => event.state === "proposed")
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const confirmed = list.events
    .filter((event) => event.state === "confirmed")
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  if (list.state === "loading" || list.state === "idle") {
    return (
      <div className="ia-skeleton-state" role="status">
        <span className="ia-sr-only">{t("inboxAssistant:events.loading")}</span>
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
        <p>{t("inboxAssistant:events.loadFailed")}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t("inboxAssistant:retry")}
        </button>
      </div>
    );
  }

  const rowProps = (event, index) => ({
    key: event.id,
    event,
    language,
    index,
    saving: list.savingId === event.id,
    sender: senderFor?.(event.emailId) || "",
    senderRole: roleFor?.(event.emailId) || "",
    usable: calendarUsable,
    actions,
  });

  return (
    <div className="ia-deadlines">
      {proposed.length > 0 && (
        <section className="ia-deadline-proposed" aria-label={t("inboxAssistant:events.checkTitle")}>
          <div className="ia-deadline-banner">
            <span className="ia-banner-icon" aria-hidden="true">
              <HiOutlineCalendarDays size={18} />
            </span>
            <div>
              <strong>{t("inboxAssistant:events.checkTitle")}</strong>
              <p>{t("inboxAssistant:events.checkBody")}</p>
            </div>
          </div>
          <ul className="ia-deadline-rows">
            {proposed.map((event, index) => <EventRow {...rowProps(event, index)} />)}
          </ul>
        </section>
      )}

      <section aria-label={t("inboxAssistant:events.confirmedTitle")}>
        <h3 className="ia-deadline-section-title">
          {t("inboxAssistant:events.confirmedTitle")}
          {confirmed.length > 0 && <span className="ia-tab-count">{confirmed.length}</span>}
        </h3>
        {confirmed.length === 0 ? (
          <div className="ia-list-state ia-empty">
            <span className="ia-empty-icon" aria-hidden="true">
              <HiOutlineCalendarDays size={22} />
            </span>
            <strong>{t("inboxAssistant:events.empty")}</strong>
          </div>
        ) : (
          <ul className="ia-deadline-rows">
            {confirmed.map((event, index) => <EventRow {...rowProps(event, index)} />)}
          </ul>
        )}
      </section>

      <AddEventForm creating={list.creating} onAdd={list.add} />
    </div>
  );
}
