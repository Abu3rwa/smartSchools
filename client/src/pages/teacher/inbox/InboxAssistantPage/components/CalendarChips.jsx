import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowPath,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowUturnLeft,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineSparkles,
} from "react-icons/hi2";
import { calendarChips } from "../inboxUi.js";

const ICONS = {
  "calendar.chips.added": HiOutlineCheckCircle,
  "calendar.chips.autoAdded": HiOutlineSparkles,
  "calendar.chips.waiting": HiOutlineClock,
  "calendar.chips.failed": HiOutlineExclamationTriangle,
  "calendar.chips.gaveUp": HiOutlineExclamationTriangle,
  "calendar.chips.lost": HiOutlineExclamationTriangle,
  "calendar.chips.dateChanged": HiOutlineCalendarDays,
  "calendar.chips.cancelled": HiOutlineExclamationTriangle,
  "calendar.chips.overlap": HiOutlineExclamationTriangle,
};

/**
 * The calendar line under an item. Every chip says one thing in plain words and
 * carries only the click that belongs to it; a row without a link renders nothing.
 */
export default function CalendarChips({
  item, saving, usable, hideAddAction = false, onAdd, onRemove, onUndo,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const chips = calendarChips(item);
  if (!chips.length) return null;

  // Every row offers the same clicks, so the row's title has to be in the name.
  const named = (label) => (item.title ? `${label} — ${item.title}` : label);

  return (
    <div className="ia-cal-chips">
      {chips.map((chip) => {
        const Icon = ICONS[chip.key] || HiOutlineCalendarDays;
        return (
          <span key={chip.key} className={`ia-cal-chip ${chip.tone}`}>
            <Icon size={13} aria-hidden="true" />
            <span className="ia-cal-text">
              {chip.title
                ? t(`inboxAssistant:${chip.key}`, { title: chip.title })
                : t(`inboxAssistant:${chip.key}`)}
              {chip.reasonKey && (
                <em>{t(`inboxAssistant:${chip.reasonKey}`)}</em>
              )}
            </span>

            {chip.link && (
              <a
                className="ia-cal-action"
                href={chip.link}
                target="_blank"
                rel="noreferrer"
                aria-label={named(t(chip.key === "calendar.chips.gaveUp"
                  ? "inboxAssistant:calendar.openGoogle"
                  : "inboxAssistant:calendar.open"))}
              >
                <HiOutlineArrowTopRightOnSquare size={12} aria-hidden="true" />
                {t(chip.key === "calendar.chips.gaveUp"
                  ? "inboxAssistant:calendar.openGoogle"
                  : "inboxAssistant:calendar.open")}
              </a>
            )}

            {chip.key === "calendar.chips.added" && usable && (
              <button
                type="button"
                className="ia-cal-action"
                disabled={saving}
                aria-label={named(t("inboxAssistant:calendar.removeFromCalendar"))}
                onClick={() => onRemove(item.id)}
              >
                {t("inboxAssistant:calendar.removeFromCalendar")}
              </button>
            )}

            {chip.key === "calendar.chips.autoAdded" && usable && (
              <button
                type="button"
                className="ia-cal-action"
                disabled={saving}
                aria-label={named(t("inboxAssistant:calendar.undo"))}
                onClick={() => onUndo(item.id)}
              >
                <HiOutlineArrowUturnLeft size={12} aria-hidden="true" />
                {t("inboxAssistant:calendar.undo")}
              </button>
            )}

            {chip.key === "calendar.chips.waiting" && usable && !hideAddAction && (
              <button
                type="button"
                className="ia-cal-action"
                disabled={saving}
                aria-label={named(t("inboxAssistant:calendar.addToCalendar"))}
                onClick={() => onAdd(item.id)}
              >
                {t("inboxAssistant:calendar.addToCalendar")}
              </button>
            )}

            {chip.key === "calendar.chips.failed" && usable && (
              <button
                type="button"
                className="ia-cal-action"
                disabled={saving}
                aria-label={named(t("inboxAssistant:calendar.retry"))}
                onClick={() => onAdd(item.id)}
              >
                <HiOutlineArrowPath size={12} aria-hidden="true" />
                {t("inboxAssistant:calendar.retry")}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
