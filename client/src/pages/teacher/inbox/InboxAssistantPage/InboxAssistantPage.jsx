import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCalendarDays,
  HiOutlineChevronDown,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineInboxArrowDown,
  HiOutlineLockClosed,
} from "react-icons/hi2";
import CreditChip from "../../writing/components/CreditChip.jsx";
import { useInboxData } from "./hooks/useInboxData.js";
import { useDeadlines } from "./hooks/useDeadlines.js";
import { useEvents } from "./hooks/useEvents.js";
import { useReplyDraft } from "./hooks/useReplyDraft.js";
import { useSent } from "./hooks/useSent.js";
import PlatformOffScreen from "./components/PlatformOffScreen.jsx";
import ConnectScreen from "./components/ConnectScreen.jsx";
import FirstRunScreen from "./components/FirstRunScreen.jsx";
import ScanToolbar from "./components/ScanToolbar.jsx";
import EmailList from "./components/EmailList.jsx";
import DeadlinesList from "./components/DeadlinesList.jsx";
import EventsList from "./components/EventsList.jsx";
import CalendarBanner from "./components/CalendarBanner.jsx";
import SentList from "./components/SentList.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import EstimateDialog from "./components/EstimateDialog.jsx";
import ReplyPanel from "./components/ReplyPanel.jsx";
import { countLabelKey, waitingOverKey } from "./components/display.js";
import { estimateNotice, eventsTabCount, isCalendarUsable } from "./inboxUi.js";
import "./inboxAssistant.css";

const TAB_KEYS = ["needs_reply", "deadlines", "events", "fyi", "sent"];
const DAY_MS = 24 * 60 * 60 * 1000;

const countText = (value) => (value === null ? "—" : value);

export default function InboxAssistantPage() {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const data = useInboxData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deadlineSeed, setDeadlineSeed] = useState("");

  const ready = data.statusState === "ready" && Boolean(data.status);
  const status = data.status;
  const optedIn = Boolean(status?.optedIn);
  const settingsVisible = settingsOpen && optedIn;

  const { setNotice, refreshLists } = data;
  const reportError = useCallback(
    (key) => setNotice({ key, tone: "error" }),
    [setNotice],
  );
  const sent = useSent({
    enabled: optedIn && data.activeGroup === "sent",
    onError: reportError,
  });
  const deadlines = useDeadlines({
    enabled: optedIn && data.activeGroup === "deadlines",
    onError: reportError,
  });
  const events = useEvents({
    enabled: optedIn && data.activeGroup === "events",
    onError: reportError,
  });

  const calendar = status?.calendar || {};
  const calendarUsable = isCalendarUsable(calendar);
  const connectCalendar = useCallback(() => data.connectGoogle(true), [data]);
  const turnSyncOn = useCallback(
    () => data.saveSettings({ calendar: { syncOn: true } }),
    [data],
  );

  const { reload: reloadSent } = sent;
  const handleSent = useCallback(async () => {
    await refreshLists();
    await reloadSent();
    setNotice({ key: "reply.sent", tone: "ok" });
  }, [refreshLists, reloadSent, setNotice]);

  const reply = useReplyDraft({ onSent: handleSent });

  const startEstimate = useCallback(async (mode = "refresh", reanalyze = false) => {
    if (data.scanning || data.estimating) return;
    const entry = await data.requestEstimate(mode, reanalyze);
    if (!entry) return;
    const next = estimateNotice(entry, data.credit.balanceCents);
    if (next === "empty") {
      data.setNotice({ key: "scan.noNew", tone: "info" });
      return;
    }
    setDialogOpen(true);
  }, [data]);

  const runScan = async () => {
    const outcome = await data.scan();
    if (outcome.outcome !== "changed") {
      setDialogOpen(false);
      if (data.activeGroup === "deadlines") await deadlines.reload();
      if (data.activeGroup === "events") await events.reload();
    }
  };

  const onTabKeyDown = (event, key) => {
    const index = TAB_KEYS.indexOf(key);
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const step = (event.key === "ArrowRight" ? 1 : -1) * (i18n.dir() === "rtl" ? -1 : 1);
      next = TAB_KEYS[(index + step + TAB_KEYS.length) % TAB_KEYS.length];
    } else if (event.key === "Home") {
      next = TAB_KEYS[0];
    } else if (event.key === "End") {
      next = TAB_KEYS[TAB_KEYS.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    setDeadlineSeed("");
    data.setActiveGroup(next);
    document.getElementById(`ia-tab-${next}`)?.focus();
  };

  const retryGroup = (group) => data.loadGroup(group);
  const needsReply = data.lists.needs_reply;
  const fyi = data.lists.fyi;
  const ignored = data.lists.ignored;
  const needsReplyReady = needsReply.state === "ready";
  const deadlinesReady = deadlines.state === "ready";
  const eventsReady = events.state === "ready";

  const needsReplyCount = needsReplyReady ? needsReply.emails.length : null;
  const fyiCount = fyi.state === "ready" ? fyi.emails.length : null;
  const deadlinesCount = deadlinesReady ? deadlines.deadlines.length : null;
  const eventsCount = eventsReady ? eventsTabCount(events.events) : null;
  const ignoredCount = ignored.state === "ready" ? ignored.emails.length : null;
  const waitingCount = needsReplyReady ? needsReply.emails.filter((email) => email.isWaiting).length : null;
  const nudgeAfterDays = status?.settings?.nudgeAfterDays ?? 2;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekEnd = dayStart.getTime() + 7 * DAY_MS;
  const dueThisWeek = deadlinesReady
    ? deadlines.deadlines.filter((deadline) => {
      const due = new Date(deadline.dueAt).getTime();
      return due >= dayStart.getTime() && due < weekEnd;
    }).length
    : null;

  const tabCount = {
    needs_reply: needsReplyCount,
    deadlines: deadlinesCount,
    events: eventsCount,
    fyi: fyiCount,
    sent: null,
  };
  /** Item rows only know their email id, so the loaded lists supply the sender. */
  const emailsById = useMemo(() => {
    const byId = new Map();
    [needsReply, fyi, ignored].forEach((list) => {
      (list.emails || []).forEach((email) => byId.set(String(email.id), email));
    });
    return byId;
  }, [needsReply, fyi, ignored]);
  const senderFor = useCallback(
    (emailId) => {
      const email = emailsById.get(String(emailId));
      return email?.fromName || email?.fromEmail || "";
    },
    [emailsById],
  );
  const roleFor = useCallback(
    (emailId) => emailsById.get(String(emailId))?.senderRole || "",
    [emailsById],
  );
  const openEmailFrom = useCallback((emailId) => {
    const row = emailsById.get(String(emailId));
    void reply.open(row || { id: emailId });
  }, [emailsById, reply]);
  const isEmailTab = data.activeGroup !== "sent"
    && data.activeGroup !== "deadlines"
    && data.activeGroup !== "events";
  const lastScanAt = status?.lastScanAt || status?.settings?.lastScanAt || null;

  const openDeadlineFromRow = (email) => {
    setDeadlineSeed(email.subject || email.summary || t("inboxAssistant:row.noSubject"));
    data.setActiveGroup("deadlines");
  };

  return (
    <div className="ia-page">
      <header className="ia-head">
        <div className="ia-head-title">
          <p className="ia-eyebrow">{t("inboxAssistant:eyebrow")}</p>
          <h1>{t("inboxAssistant:title")}</h1>
          {optedIn && <p className="ia-sub">{t("inboxAssistant:subtitle")}</p>}
        </div>
        <div className="ia-head-actions">
          {ready && <CreditChip credit={data.credit} />}
          {optedIn && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-expanded={settingsVisible}
              aria-controls={settingsVisible ? "ia-settings" : undefined}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <HiOutlineCog6Tooth size={16} aria-hidden="true" />
              {t("inboxAssistant:toolbar.settings")}
            </button>
          )}
        </div>
      </header>

      {data.notice && (
        <p
          className={`ia-notice is-${data.notice.tone || "info"}`}
          role={data.notice.tone === "error" ? "alert" : "status"}
        >
          {t(`inboxAssistant:${data.notice.key}`, data.notice.params)}
        </p>
      )}

      {data.statusState === "loading" && (
        <section className="ia-panel ia-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          {t("inboxAssistant:loading")}
        </section>
      )}

      {data.statusState === "error" && (
        <section className="ia-panel" role="alert">
          <p>{data.statusErrorKey ? t(`inboxAssistant:${data.statusErrorKey}`) : t("inboxAssistant:loadFailed")}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => data.loadStatus()}>
            {t("inboxAssistant:retry")}
          </button>
        </section>
      )}

      {ready && !status.platform.enabled && <PlatformOffScreen />}

      {ready && status.platform.enabled && (!status.gmailConnected || status.requiresReauth) && (
        <ConnectScreen
          requiresReauth={status.requiresReauth}
          connecting={data.connecting}
          onConnect={() => data.connectGoogle(false)}
        />
      )}

      {ready && status.platform.enabled && status.gmailConnected
        && !status.requiresReauth && !optedIn && (
          <FirstRunScreen
            saving={data.saving}
            onEnable={() => {
              setSettingsOpen(false);
              data.optIn();
            }}
          />
        )}

      {ready && status.platform.enabled && status.gmailConnected
        && !status.requiresReauth && optedIn && (
          <>
            <section className="ia-stats" aria-label={t("inboxAssistant:stats.label")}>
              <div className="ia-stat is-rose">
                <span className="ia-stat-icon" aria-hidden="true">
                  <HiOutlineInboxArrowDown size={18} />
                </span>
                <div>
                  <b>{countText(needsReplyCount)}</b>
                  <span>{t(`inboxAssistant:${countLabelKey("stats.needsReply", needsReplyCount ?? 0)}`)}</span>
                </div>
              </div>
              <div className="ia-stat is-amber">
                <span className="ia-stat-icon" aria-hidden="true">
                  <HiOutlineCalendarDays size={18} />
                </span>
                <div>
                  <b>{countText(dueThisWeek)}</b>
                  <span>{t(`inboxAssistant:${countLabelKey("stats.deadlines", dueThisWeek ?? 0)}`)}</span>
                </div>
              </div>
              <div className="ia-stat is-teal">
                <span className="ia-stat-icon" aria-hidden="true">
                  <HiOutlineClock size={18} />
                </span>
                <div>
                  <b>{countText(waitingCount)}</b>
                  <span>{t(`inboxAssistant:${waitingOverKey(nudgeAfterDays)}`, { n: nudgeAfterDays })}</span>
                </div>
              </div>
            </section>

            {settingsVisible && (
              <div id="ia-settings">
                <SettingsPanel
                  settings={status.settings}
                  calendar={calendar}
                  saving={data.saving}
                  onClose={() => setSettingsOpen(false)}
                  onSave={(patch) => data.saveSettings(patch, { announce: true })}
                  onDelete={data.deleteData}
                />
              </div>
            )}

            {reply.email && (
              <ReplyPanel
                reply={reply}
                language={String(i18n.language || "").startsWith("ar") ? "ar" : "en"}
                defaultTone={status.settings.tone}
              />
            )}

            <section className="ia-panel ia-main-panel" aria-label={t("inboxAssistant:tabs.label")}>
              <div className="ia-panel-head">
                <div className="ia-tabs" role="tablist" aria-label={t("inboxAssistant:tabs.label")}>
                  {TAB_KEYS.map((key) => (
                    <button
                      key={key}
                      id={`ia-tab-${key}`}
                      type="button"
                      role="tab"
                      className={`ia-tab ${data.activeGroup === key ? "is-active" : ""}`}
                      aria-selected={data.activeGroup === key}
                      aria-controls="ia-email-panel"
                      tabIndex={data.activeGroup === key ? 0 : -1}
                      onClick={() => {
                        setDeadlineSeed("");
                        data.setActiveGroup(key);
                      }}
                      onKeyDown={(event) => onTabKeyDown(event, key)}
                    >
                      {t(`inboxAssistant:tabs.${key}`)}
                      {tabCount[key] > 0 && (
                        <span className="ia-tab-count">{tabCount[key]}</span>
                      )}
                    </button>
                  ))}
                </div>

                {isEmailTab ? (
                  <ScanToolbar
                    maxScanSize={status.platform.maxScanSize}
                    scanSize={status.settings.scanSize}
                    tone={status.settings.tone}
                    lastScanAt={lastScanAt}
                    scanning={data.scanning}
                    onScanSize={(value) => data.saveSettings({ scanSize: value })}
                    onTone={(value) => data.saveSettings({ tone: value })}
                    onRefresh={() => startEstimate("refresh", false)}
                    onFullRescan={() => startEstimate("full", false)}
                    onReanalyze={() => startEstimate("full", true)}
                  />
                ) : (
                  <ScanToolbar metaOnly lastScanAt={lastScanAt} />
                )}
              </div>

              <div
                key={data.activeGroup}
                id="ia-email-panel"
                className="ia-tab-panel"
                role="tabpanel"
                aria-labelledby={`ia-tab-${data.activeGroup}`}
                tabIndex={0}
              >
                {data.activeGroup === "sent" && (
                  <SentList
                    list={sent}
                    language={i18n.language}
                    onRetry={sent.reload}
                    onDelete={sent.remove}
                    onLoadMore={sent.loadMore}
                    onEmpty={sent.empty}
                  />
                )}
                {(data.activeGroup === "deadlines" || data.activeGroup === "events") && (
                  <CalendarBanner
                    calendar={calendar}
                    connecting={data.connecting}
                    onConnect={connectCalendar}
                    onEnableSync={turnSyncOn}
                  />
                )}
                {data.activeGroup === "deadlines" && (
                  <DeadlinesList
                    list={deadlines}
                    language={i18n.language}
                    onRetry={deadlines.reload}
                    seedTitle={deadlineSeed}
                    onSeedUsed={() => setDeadlineSeed("")}
                    senderFor={senderFor}
                    usable={calendarUsable}
                  />
                )}
                {data.activeGroup === "events" && (
                  <EventsList
                    list={events}
                    language={i18n.language}
                    onRetry={events.reload}
                    senderFor={senderFor}
                    roleFor={roleFor}
                    calendarUsable={calendarUsable}
                    actions={{ ...events, openEmail: openEmailFrom }}
                  />
                )}
                {isEmailTab && (
                  <EmailList
                    group={data.activeGroup}
                    list={data.lists[data.activeGroup]}
                    language={i18n.language}
                    onRetry={() => retryGroup(data.activeGroup)}
                    onRefresh={() => startEstimate("refresh", false)}
                    onDraftReply={(email) => reply.open(email)}
                    onDone={(id) => data.markEmail(id, "done")}
                    onNotImportant={(id) => data.markEmail(id, "dismissed")}
                    onAddDeadline={openDeadlineFromRow}
                  />
                )}
              </div>

              {isEmailTab && (
                <div className="ia-panel-foot">
                  <button
                    type="button"
                    className="ia-ghost-link"
                    aria-expanded={data.ignoredOpen}
                    aria-controls={data.ignoredOpen ? "ia-ignored-list" : undefined}
                    onClick={() => data.setIgnoredOpen(!data.ignoredOpen)}
                  >
                    <HiOutlineChevronDown
                      size={14}
                      aria-hidden="true"
                      className={`ia-ignored-chevron ${data.ignoredOpen ? "is-open" : ""}`}
                    />
                    {data.ignoredOpen
                      ? (ignoredCount === null
                        ? t("inboxAssistant:tabs.hideIgnored")
                        : t("inboxAssistant:tabs.hideIgnoredCount", { n: ignoredCount }))
                      : (ignoredCount === null
                        ? t("inboxAssistant:tabs.showIgnored")
                        : t("inboxAssistant:tabs.showIgnoredCount", { n: ignoredCount }))}
                  </button>
                  <span className="ia-reassure">
                    <HiOutlineLockClosed size={13} aria-hidden="true" />
                    {t("inboxAssistant:footer.safety")}
                  </span>
                </div>
              )}
            </section>

            {isEmailTab && data.ignoredOpen && (
              <section id="ia-ignored-list" className="ia-panel ia-list" aria-label={t("inboxAssistant:tabs.ignored")}>
                <EmailList
                  group="ignored"
                  list={ignored}
                  language={i18n.language}
                  onRetry={() => retryGroup("ignored")}
                  onRefresh={() => startEstimate("refresh", false)}
                  onDraftReply={(email) => reply.open(email)}
                  onDone={(id) => data.markEmail(id, "done")}
                  onNotImportant={(id) => data.markEmail(id, "dismissed")}
                  onAddDeadline={openDeadlineFromRow}
                />
              </section>
            )}
          </>
        )}

      {dialogOpen && data.estimate && (
        <EstimateDialog
          estimate={data.estimate}
          fallbackBalanceCents={data.credit.balanceCents}
          scanning={data.scanning}
          onClose={() => {
            if (!data.scanning) setDialogOpen(false);
          }}
          onScan={runScan}
        />
      )}
    </div>
  );
}
