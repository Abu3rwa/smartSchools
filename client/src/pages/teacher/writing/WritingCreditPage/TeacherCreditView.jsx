import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../services/writingService.js";
import {
  creditState,
  dollarsToCents,
  formatBalance,
  formatCents,
  formatTokens,
  formatUsd,
} from "../../../../utils/writingCredit.js";
import CreditHistoryTable from "./CreditHistoryTable.jsx";

const PRESETS = [2, 5, 10, 20];
const MAX_CENTS = 100000;

export default function TeacherCreditView() {
  const { t, i18n } = useTranslation(["writing"]);
  const locale = i18n.language;
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState({ key: -1, summary: null });
  const [amount, setAmount] = useState("5");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    writingService.getCredit()
      .then((summary) => { if (active) setLoaded({ key: refreshKey, summary }); })
      .catch((error) => {
        if (!active) return;
        setLoaded((current) => ({ key: refreshKey, summary: current.summary }));
        toast.error(error?.response?.data?.message || t("writing:credit.loadFailed"));
      });
    return () => { active = false; };
  }, [refreshKey, t]);

  const loadHistory = useCallback(
    (page, type) => writingService.getCreditHistory({ page, type: type || undefined }),
    [],
  );

  const summary = loaded.summary;
  const refreshing = loaded.key !== refreshKey;
  if (!summary) {
    return (
      <div className="wa-page wa-loading" aria-live="polite">
        {refreshing ? <div className="spinner" /> : (
          <div className="wa-empty">
            <p>{t("writing:credit.loadFailed")}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>
              {t("writing:credit.retry")}
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
      toast.error(t("writing:credit.request.invalid"));
      return;
    }
    setBusy(true);
    try {
      await writingService.requestCredit({ amountCents: cents, note: note.trim() });
      toast.success(t("writing:credit.request.sent"));
      setNote("");
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:credit.request.failed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async () => {
    setBusy(true);
    try {
      await writingService.cancelCreditRequest(pending.id);
      toast.success(t("writing:credit.request.cancelled"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:credit.request.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-page wa-credit-page">
      <div className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("writing:credit.eyebrow")}</p>
          <h1>{t("writing:credit.title")}</h1>
          <p className="wa-sub">{t("writing:credit.teacherSubtitle")}</p>
        </div>
        {isAdmin && (
          <Link to="/portal/ai-credit" className="btn btn-secondary btn-sm">
            {t("writing:credit.admin.title")}
          </Link>
        )}
      </div>

      <div className="wa-credit-top">
        <section className={`wa-credit-balance is-${state}`} aria-live="polite">
          <div className="wa-credit-balance-row">
            <div>
              <span className="wa-credit-label">{t("writing:credit.balance")}</span>
              <strong className="wa-credit-amount">{formatBalance(summary.balanceCents, locale)}</strong>
            </div>
            <span className={`wa-credit-state is-${state}`}>{t(`writing:credit.states.${state}`)}</span>
          </div>
          <p className="wa-credit-help">{t(`writing:credit.stateHelp.${state}`, { threshold })}</p>

          <dl className="wa-credit-facts">
            <div>
              <dt>{t("writing:credit.facts.thisMonth")}</dt>
              <dd>{formatCents(month.costCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.requests")}</dt>
              <dd>{formatTokens(month.requests, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.tokens")}</dt>
              <dd>{formatTokens(month.tokens, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.average")}</dt>
              <dd>{month.requests ? formatCents(average, locale) : "—"}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.fromSchool")}</dt>
              <dd>{formatBalance(summary.schoolCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.fromPlatform")}</dt>
              <dd>{formatBalance(summary.grantCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.added")}</dt>
              <dd>{formatUsd(summary.grantedCents, locale)}</dd>
            </div>
            <div>
              <dt>{t("writing:credit.facts.spent")}</dt>
              <dd>{formatUsd(summary.spentCents, locale)}</dd>
            </div>
          </dl>

          <p className="wa-hint">
            {t("writing:credit.rates", {
              model: summary.rates?.model,
              input: formatUsd(summary.rates?.inputPerMillionCents, locale, 4),
              cached: formatUsd(summary.rates?.cachedInputPerMillionCents, locale, 4),
              output: formatUsd(summary.rates?.outputPerMillionCents, locale, 4),
            })}
          </p>
        </section>

        <section className="wa-credit-panel wa-credit-request">
          {pending ? (
            <>
              <h2>{t("writing:credit.request.pendingTitle")}</h2>
              <p className="wa-credit-help">
                {t("writing:credit.request.pendingBody", {
                  amount: formatUsd(pending.amountCents, locale),
                  date: formatDate(pending.createdAt),
                })}
              </p>
              {pending.note && <p className="wa-credit-quote" dir="auto">{pending.note}</p>}
              <div>
                <button type="button" className="btn btn-secondary" disabled={busy || refreshing} onClick={cancelRequest}>
                  {t("writing:credit.request.cancel")}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={sendRequest} className="wa-credit-form">
              <h2>{t("writing:credit.request.title")}</h2>
              <p className="wa-credit-help">{t("writing:credit.request.body")}</p>
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
                <span>{t("writing:credit.request.amount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="wa-hint">{t("writing:credit.amountHelp")}</p>
              <label className="wa-field">
                <span>{t("writing:credit.request.note")}</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={note}
                  placeholder={t("writing:credit.request.notePlaceholder")}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy || refreshing}>
                  {busy ? t("writing:credit.request.sending") : t("writing:credit.request.send")}
                </button>
              </div>
            </form>
          )}

          {earlier.length > 0 && (
            <div className="wa-credit-requests">
              <h3>{t("writing:credit.request.pastTitle")}</h3>
              <ul>
                {earlier.map((row) => (
                  <li key={row.id}>
                    <span className={`wa-credit-status is-${row.status}`}>
                      {t(`writing:credit.request.statuses.${row.status}`)}
                    </span>
                    <span>{formatUsd(row.amountCents, locale)}</span>
                    {row.status === "approved" && row.grantedCents !== row.amountCents && (
                      <span className="wa-hint">
                        {t("writing:credit.request.granted", { amount: formatUsd(row.grantedCents, locale) })}
                      </span>
                    )}
                    <span className="wa-cell-date">{formatDate(row.createdAt)}</span>
                    {row.decisionNote && (
                      <span className="wa-credit-quote" dir="auto">
                        {t("writing:credit.request.adminNote", { note: row.decisionNote })}
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
