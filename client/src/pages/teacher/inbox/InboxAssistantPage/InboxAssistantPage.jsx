import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineChevronDown,
  HiOutlineCog6Tooth,
  HiOutlineInboxArrowDown,
} from "react-icons/hi2";
import CreditChip from "../../writing/components/CreditChip.jsx";
import { useInboxData } from "./hooks/useInboxData.js";
import { useDeadlines } from "./hooks/useDeadlines.js";
import { useReplyDraft } from "./hooks/useReplyDraft.js";
import { useSent } from "./hooks/useSent.js";
import PlatformOffScreen from "./components/PlatformOffScreen.jsx";
import ConnectScreen from "./components/ConnectScreen.jsx";
import FirstRunScreen from "./components/FirstRunScreen.jsx";
import ScanToolbar from "./components/ScanToolbar.jsx";
import EmailList from "./components/EmailList.jsx";
import DeadlinesList from "./components/DeadlinesList.jsx";
import SentList from "./components/SentList.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import EstimateDialog from "./components/EstimateDialog.jsx";
import ReplyPanel from "./components/ReplyPanel.jsx";
import { estimateNotice } from "./inboxUi.js";
import "./inboxAssistant.css";

const TAB_KEYS = ["needs_reply", "deadlines", "fyi", "sent"];

export default function InboxAssistantPage() {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const data = useInboxData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    data.setActiveGroup(next);
    document.getElementById(`ia-tab-${next}`)?.focus();
  };

  const retryGroup = (group) => data.loadGroup(group);
  const activeTabIndex = Math.max(TAB_KEYS.indexOf(data.activeGroup), 0);
  const needsReply = data.lists.needs_reply;
  const needsReplyCount = needsReply?.state === "ready" ? needsReply.emails.length : 0;

  return (
    <div className="ia-page">
      <header className="ia-head">
        <div className="ia-head-title">
          <span className="ia-head-icon" aria-hidden="true">
            <HiOutlineInboxArrowDown size={22} />
          </span>
          <div>
            <p className="ia-eyebrow">{t("inboxAssistant:eyebrow")}</p>
            <h1>{t("inboxAssistant:title")}</h1>
            {optedIn && <p className="ia-sub">{t("inboxAssistant:subtitle")}</p>}
          </div>
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
          onConnect={data.connectGoogle}
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
            {reply.email && (
              <ReplyPanel
                reply={reply}
                language={String(i18n.language || "").startsWith("ar") ? "ar" : "en"}
                defaultTone={status.settings.tone}
              />
            )}

            <ScanToolbar
              maxScanSize={status.platform.maxScanSize}
              scanSize={status.settings.scanSize}
              tone={status.settings.tone}
              lastScanAt={status.lastScanAt || status.settings.lastScanAt}
              scanning={data.scanning}
              onScanSize={(value) => data.saveSettings({ scanSize: value })}
              onTone={(value) => data.saveSettings({ tone: value })}
              onRefresh={() => startEstimate("refresh", false)}
              onFullRescan={() => startEstimate("full", false)}
              onReanalyze={() => startEstimate("full", true)}
            />

            {settingsVisible && (
              <div id="ia-settings">
                <SettingsPanel
                  settings={status.settings}
                  saving={data.saving}
                  onClose={() => setSettingsOpen(false)}
                  onSave={(patch) => data.saveSettings(patch, { announce: true })}
                  onDelete={data.deleteData}
                />
              </div>
            )}

            <div className="ia-tabs-wrap">
              <div className="ia-tabs" role="tablist" aria-label={t("inboxAssistant:tabs.label")}>
                <span
                  className="ia-tab-glider"
                  aria-hidden="true"
                  style={{ "--ia-tab-index": activeTabIndex }}
                />
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
                    onClick={() => data.setActiveGroup(key)}
                    onKeyDown={(event) => onTabKeyDown(event, key)}
                  >
                    {t(`inboxAssistant:tabs.${key}`)}
                    {key === "needs_reply" && needsReplyCount > 0 && (
                      <span className="ia-tab-count">{needsReplyCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div
              key={data.activeGroup}
              id="ia-email-panel"
              className="ia-panel ia-list ia-tab-panel"
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
              {data.activeGroup === "deadlines" && (
                <DeadlinesList
                  list={deadlines}
                  language={i18n.language}
                  onRetry={deadlines.reload}
                />
              )}
              {data.activeGroup !== "sent" && data.activeGroup !== "deadlines" && (
                <EmailList
                  group={data.activeGroup}
                  list={data.lists[data.activeGroup]}
                  language={i18n.language}
                  onRetry={() => retryGroup(data.activeGroup)}
                  onDraftReply={(email) => reply.open(email)}
                  onDone={(id) => data.markEmail(id, "done")}
                  onNotImportant={(id) => data.markEmail(id, "dismissed")}
                />
              )}
            </div>

            {data.activeGroup !== "sent" && data.activeGroup !== "deadlines" && (
              <div className="ia-ignored">
                <button
                  type="button"
                  className="btn btn-ghost ia-ignored-toggle"
                  aria-expanded={data.ignoredOpen}
                  aria-controls="ia-ignored-list"
                  onClick={() => data.setIgnoredOpen(!data.ignoredOpen)}
                >
                  {t(data.ignoredOpen
                    ? "inboxAssistant:tabs.hideIgnored"
                    : "inboxAssistant:tabs.showIgnored")}
                  <span
                    className={`ia-ignored-chevron ${data.ignoredOpen ? "is-open" : ""}`}
                    aria-hidden="true"
                  >
                    <HiOutlineChevronDown size={16} />
                  </span>
                </button>
                {data.ignoredOpen && (
                  <div id="ia-ignored-list" className="ia-panel ia-list">
                    <EmailList
                      group="ignored"
                      list={data.lists.ignored}
                      language={i18n.language}
                      onRetry={() => retryGroup("ignored")}
                      onDraftReply={(email) => reply.open(email)}
                      onDone={(id) => data.markEmail(id, "done")}
                      onNotImportant={(id) => data.markEmail(id, "dismissed")}
                    />
                  </div>
                )}
              </div>
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
