import { useTranslation } from "react-i18next";
import { HiOutlineCalendarDays, HiOutlineNoSymbol } from "react-icons/hi2";
import { whenParts } from "./display.js";

const currentOf = (item, kind) => (kind === "deadline"
  ? { at: item.dueAt, allDay: Boolean(item.dueDateOnly) }
  : { at: item.startAt, allDay: Boolean(item.allDay) });

function When({ at, allDay, language }) {
  const parts = whenParts(at, { language, allDay });
  if (!parts) return null;
  return (
    <bdi className="ia-change-when">
      {parts.day}
      {parts.time ? ` ${parts.time}` : ""}
    </bdi>
  );
}

/**
 * A later email moved or cancelled this item. Nothing on the calendar changes until
 * the teacher clicks, so the two answers sit right under the row they belong to.
 */
export default function ChangeBanner({ item, kind, language, saving, onDecide }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const change = item?.pendingChange;
  if (!change?.kind) return null;

  const cancel = change.kind === "cancel";
  const onCalendar = item.calendar?.status === "synced";
  const current = currentOf(item, kind);
  const nextAllDay = change.newAllDay === null || change.newAllDay === undefined
    ? current.allDay
    : Boolean(change.newAllDay);

  const Icon = cancel ? HiOutlineNoSymbol : HiOutlineCalendarDays;

  const applyLabel = t(`inboxAssistant:${cancel
    ? (onCalendar ? "calendar.change.cancelApply" : "calendar.change.cancelApplyItem")
    : (onCalendar ? "calendar.change.moveApply" : "calendar.change.moveApplyItem")}`);
  const keepLabel = t(cancel
    ? "inboxAssistant:calendar.change.keepShort"
    : "inboxAssistant:calendar.change.keep");
  // Several rows can ask the same question, so the title has to be in the name.
  const named = (label) => (item.title ? `${label} — ${item.title}` : label);

  return (
    <div className={`ia-change ${cancel ? "is-cancel" : "is-move"}`}>
      <p className="ia-change-head">
        <Icon size={14} aria-hidden="true" />
        {cancel ? (
          <strong>{t("inboxAssistant:calendar.change.cancelTitle")}</strong>
        ) : (
          <strong>
            {t("inboxAssistant:calendar.change.moveTitle")}{" "}
            <When at={current.at} allDay={current.allDay} language={language} />
            <span className="ia-change-arrow" aria-hidden="true">→</span>
            <span className="ia-sr-only">{t("inboxAssistant:calendar.change.to")}</span>
            <When at={change.newStartAt} allDay={nextAllDay} language={language} />
          </strong>
        )}
      </p>

      {change.quote && (
        <p className="ia-change-quote" lang={language}>
          {t("inboxAssistant:deadlines.quote", { quote: change.quote })}
        </p>
      )}

      <div className="ia-change-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          aria-label={named(applyLabel)}
          onClick={() => onDecide(item.id, "apply")}
        >
          {applyLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={saving}
          aria-label={named(keepLabel)}
          onClick={() => onDecide(item.id, "keep")}
        >
          {keepLabel}
        </button>
      </div>
    </div>
  );
}
