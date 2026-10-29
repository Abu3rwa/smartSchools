import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import aiCreditService from "../../services/aiCreditService.js";
import {
  creditState,
  dollarsToCents,
  formatBalance,
  formatCents,
  formatTokens,
  formatUsd,
} from "../../utils/aiCredit.js";
import CreditHistoryTable from "./CreditHistoryTable.jsx";
import "../teacher/writing/writingShared.css";
import "./aiCredit.css";

const PRESETS = [2, 5, 10, 20];
const MAX_CENTS = 100000;

export default function MyCreditPage() {
  const { t, i18n } = useTranslation(["aiCredit"]);
  const locale = i18n.language;
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState({ key: -1, summary: null });
  const [amount, setAmount] = useState("5");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    aiCreditService.getSummary()
      .then((summary) => { if (active) setLoaded({ key: refreshKey, summary }); })
      .catch((error) => {
        if (!active) return;
        setLoaded((current) => ({ key: refreshKey, summary: current.summary }));
        toast.error(error?.response?.data?.message || t("aiCredit:loadFailed"));
      });
    return () => { active = false; };
  }, [refreshKey, t]);

  const loadHistory = useCallback(
    (page, type) => aiCreditService.getHistory({ page, type: type || undefined }),
    [],
  );

  const summary = loaded.summary;
  const refreshing = loaded.key !== refreshKey;
  if (!summary) {
    return (
      <div className="wa-page wa-loading" aria-live="polite">
        {refreshing ? <div className="spinner" /> : (
          <div className="wa-empty">
            <p>{t("aiCredit:loadFailed")}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>
              {t("aiCredit:retry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const state = creditState(summary);
  const threshold = formatUsd(summary.lowBalanceCents, locale);
  const month = summary.thisMonth || {};
  const average = month.requests ? month.costCents / month.requests : 0;
  const pending = summary.pendingRequest;
  const earlier = (summary.requests || []).filter((row) => row.status !== "pending");
  const formatDate = (value) => new Date(value).toLocaleDateString(locale, {
    day: "2-digit", month: "short", year: "numeric",
  });
  const refresh = () => setRefreshKey((current) => current + 1);

  const sendRequest = async (event) => {
    event.preventDefault();
    const cents = dollarsToCents(amount);
    if (!Number.isFinite(cents) || cents < 1 || cents > MAX_CENTS) {
      toast.error(t("aiCredit:request.invalid"));
      return;
    }
    setBusy(true);
    try {
      await aiCreditService.requestCredit({ amountCents: cents, note: note.trim() });
      toast.success(t("aiCredit:request.sent"));
      setNote("");
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:request.failed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async () => {
    setBusy(true);
    try {
      await aiCreditService.cancelRequest(pending.id);
      toast.success(t("aiCredit:request.cancelled"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:request.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-page wa-credit-page">
      <div className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("aiCredit:eyebrow")}</p>
          <h1>{t("aiCredit:title")}</h1>
          <p className="wa-sub">{t("aiCredit:teacherSubtitle")}</p>
        </div>
        {isAdmin && (
          <Link to="/portal/ai-credit" className="btn btn-secondary btn-sm">
            {t("aiCredit:admin.title")}
          </Link>
        )}
      </div>

      <div className="wa-credit-top">
        <section className={`wa-credit-balance is-${state}`} aria-live="polite">
          <div className="wa-credit-balance-row">
            <div>
              <span className="wa-credit-label">{t("aiCredit:balance")}</span>
              <strong className="wa-credit-amount">{formatBalance(summary.balanceCents, locale)}</strong>
            </div>
            <span className={`wa-credit-state is-${state}`}>{t(`aiCredit:states.${state}`)}</span>
          </div>
          <p className="wa-credit-help">{t(`aiCredit:stateHelp.${state}`, { threshold })}</p>

          <dl className="wa-credit-facts">
            <div>
              <dt>{t("aiCredit:facts.thisMonth")}</dt>
              <dd>{formatCents(month.costCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.requests")}</dt>
              <dd>{formatTokens(month.requests, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.tokens")}</dt>
              <dd>{formatTokens(month.tokens, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.average")}</dt>
              <dd>{month.requests ? formatCents(average, locale) : "—"}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.fromSchool")}</dt>
              <dd>{formatBalance(summary.schoolCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.fromPlatform")}</dt>
              <dd>{formatBalance(summary.grantCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.added")}</dt>
              <dd>{formatUsd(summary.grantedCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("aiCredit:facts.spent")}</dt>
              <dd>{formatUsd(summary.spentCents, locale)}</dd>
            </div>
          </dl>
        </section>

        <section className="wa-credit-panel wa-credit-request">
          {pending ? (
            <>
              <h2>{t("aiCredit:request.pendingTitle")}</h2>
              <p className="wa-credit-help">
                {t("aiCredit:request.pendingBody", {
                  amount: formatUsd(pending.amountCents, locale),
                  date: formatDate(pending.createdAt),
                })}
              </p>
              {pending.note && <p className="wa-credit-quote" dir="auto">{pending.note}</p>}
              <div>
                <button type="button" className="btn btn-secondary" disabled={busy || refreshing} onClick={cancelRequest}>
                  {t("aiCredit:request.cancel")}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={sendRequest} className="wa-credit-form">
              <h2>{t("aiCredit:request.title")}</h2>
              <p className="wa-credit-help">{t("aiCredit:request.body")}</p>
              <div className="wa-chip-row">
                {PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`wa-chip-button${amount === String(value) ? " is-active" : ""}`}
                    onClick={() => setAmount(String(value))}
                  >
                    {formatUsd(value * 100, locale)}
                  </button>
                ))}
              </div>
              <label className="wa-field">
                <span>{t("aiCredit:request.amount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="wa-hint">{t("aiCredit:amountHelp")}</p>
              <label className="wa-field">
                <span>{t("aiCredit:request.note")}</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  placeholder={t("aiCredit:request.notePlaceholder")}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy || refreshing}>
                  {busy ? t("aiCredit:request.sending") : t("aiCredit:request.send")}
                </button>
              </div>
            </form>
          )}

          {earlier.length > 0 && (
            <div className="wa-credit-requests">
              <h3>{t("aiCredit:request.pastTitle")}</h3>
              <ul>
                {earlier.map((row) => (
                  <li key={row.id}>
                    <span className={`wa-credit-status is-${row.status}`}>
                      {t(`aiCredit:request.statuses.${row.status}`)}
                    </span>
                    <span>{formatUsd(row.amountCents, locale)}</span>
                    {row.status === "approved" && row.grantedCents !== row.amountCents && (
                      <span className="wa-hint">
                        {t("aiCredit:request.granted", { amount: formatUsd(row.grantedCents, locale) })}
                      </span>
                    )}
                    <span className="wa-cell-date">{formatDate(row.createdAt)}</span>
                    {row.decisionNote && (
                      <span className="wa-credit-quote" dir="auto">
                        {t("aiCredit:request.adminNote", { note: row.decisionNote })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <CreditHistoryTable key={refreshKey} load={loadHistory} />
    </div>
  );
}
