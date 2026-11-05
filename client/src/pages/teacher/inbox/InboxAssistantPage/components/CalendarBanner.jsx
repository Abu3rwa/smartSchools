import { useTranslation } from "react-i18next";
import { HiOutlineCalendarDays } from "react-icons/hi2";
import { showCalendarBanner } from "../inboxUi.js";

/**
 * One line at the top of the Deadlines and Events tabs. It only appears while the
 * platform allows Calendar and this teacher is not using it yet.
 */
export default function CalendarBanner({ calendar, connecting, onConnect, onEnableSync }) {
  const { t } = useTranslation(["inboxAssistant"]);
  if (!showCalendarBanner(calendar)) return null;

  const offBySetting = Boolean(calendar.connected) && calendar.syncOn === false;
  const reconnect = !calendar.connected && Boolean(calendar.needsReconnect);
  const copy = offBySetting
    ? { text: "calendar.banner.syncOff", button: "calendar.banner.turnOn" }
    : {
      text: reconnect ? "calendar.banner.reconnect" : "calendar.banner.connect",
      button: reconnect ? "calendar.banner.reconnectButton" : "calendar.banner.connectButton",
    };

  return (
    <div className="ia-cal-banner">
      <span className="ia-cal-banner-icon" aria-hidden="true">
        <HiOutlineCalendarDays size={16} />
      </span>
      <p>{t(`inboxAssistant:${copy.text}`)}</p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={connecting}
        onClick={offBySetting ? onEnableSync : onConnect}
      >
        {t(`inboxAssistant:${copy.button}`)}
      </button>
    </div>
  );
}
