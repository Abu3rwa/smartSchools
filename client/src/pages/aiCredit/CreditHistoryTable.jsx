import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { formatBalance, formatCents, formatTokens, formatUsd } from "../../utils/aiCredit.js";

const FILTERS = ["", "usage", "grant", "allocation", "reclaim"];

const kindFor = (row) => {
  if (row.type === "usage") return "usage";
  if (["grant", "allocation", "reclaim"].includes(row.type)) return row.type;
  return "adjustment";
};

const featureLabel = (row, t) =>
  t(`aiCredit:history.features.${row.feature || "general"}`, {
    defaultValue: t("aiCredit:history.features.general"),
  });

export default function CreditHistoryTable({ load }) {
  const { t, i18n } = useTranslation(["aiCredit"]);
  const locale = i18n.language;
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ key: "", data: null, failed: false });
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = `${page}|${type}|${retryKey}`;
  const loading = result.key !== requestKey;
  const data = loading ? null : result.data;

  useEffect(() => {
    let active = true;
    load(page, type)
      .then((next) => { if (active) setResult({ key: requestKey, data: next, failed: false }); })
      .catch((error) => {
        if (!active) return;
        setResult({ key: requestKey, data: null, failed: true });
        toast.error(error?.response?.data?.message || t("aiCredit:history.loadFailed"));
      });
    return () => { active = false; };
  }, [load, page, type, requestKey, t]);

  const chooseType = (value) => {
    setType(value);
    setPage(1);
  };

  const rows = data?.rows || [];
  const formatDate = (value) => new Date(value).toLocaleString(locale, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <section className="wa-credit-panel">
      <header className="wa-credit-panel-head">
        <div>
          <h2>{t("aiCredit:history.title")}</h2>
          <p className="wa-hint">{t("aiCredit:history.subtitle")}</p>
        </div>
        <div className="wa-chip-row" role="group" aria-label={t("aiCredit:history.filter")}>
          {FILTERS.map((value) => (
            <button
              key={value || "all"}
              type="button"
              className={`wa-chip-button${type === value ? " is-active" : ""}`}
              onClick={() => chooseType(value)}
            >
              {t(`aiCredit:history.filters.${value || "all"}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="wa-table-card">
        <table className="wa-table wa-credit-table">
          <thead>
            <tr>
              <th>{t("aiCredit:history.date")}</th>
              <th>{t("aiCredit:history.what")}</th>
              <th className="wa-cell-number">{t("aiCredit:history.tokensIn")}</th>
              <th className="wa-cell-number">{t("aiCredit:history.tokensOut")}</th>
              <th className="wa-cell-number">{t("aiCredit:history.tokensTotal")}</th>
              <th className="wa-cell-number">{t("aiCredit:history.amount")}</th>
              <th className="wa-cell-number">{t("aiCredit:history.balance")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={7} className="wa-table-empty"><div className="spinner" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="wa-table-empty">
                {result.failed ? <>
                  <p>{t("aiCredit:history.loadFailed")}</p>
                  <button type="button" className="btn btn-secondary" onClick={() => setRetryKey((key) => key + 1)}>
                    {t("aiCredit:retry")}
                  </button>
                </> : t("aiCredit:history.empty")}
              </td></tr>
            )}
            {rows.map((row) => {
              const kind = kindFor(row);
              const isUsage = row.type === "usage";
              const details = isUsage
                ? [
                  row.studentName,
                  row.assignmentTitle,
                  row.draftNumber ? t("aiCredit:history.draft", { n: row.draftNumber }) : "",
                ].filter(Boolean).join(" · ")
                : row.note;
              return (
                <tr key={row.id}>
                  <td className="wa-cell-date">{formatDate(row.createdAt)}</td>
                  <td>
                    <span className={`wa-credit-kind is-${kind}`}>
                      {isUsage ? featureLabel(row, t) : t(`aiCredit:history.kinds.${kind}`)}
                    </span>
                    {row.outcome === "unusable" && (
                      <span className="wa-credit-flag">{t("aiCredit:history.unusable")}</span>
                    )}
                    {isUsage && !row.charged && (
                      <span className="wa-credit-flag">
                        {t(row.unpriced ? "aiCredit:history.unpriced" : "aiCredit:history.notCharged")}
                      </span>
                    )}
                    {details && <span className="wa-credit-details" dir="auto">{details}</span>}
                    {isUsage && row.model && <span className="wa-credit-details" dir="ltr">{row.model}</span>}
                  </td>
                  <td className="wa-cell-number">
                    {isUsage ? formatTokens(row.inputTokens, locale) : "—"}
                    {isUsage && row.cachedInputTokens > 0 && (
                      <span className="wa-credit-details">
                        {t("aiCredit:history.cached", { n: formatTokens(row.cachedInputTokens, locale) })}
                      </span>
                    )}
                  </td>
                  <td className="wa-cell-number">{isUsage ? formatTokens(row.outputTokens, locale) : "—"}</td>
                  <td className="wa-cell-number">{isUsage ? formatTokens(row.totalTokens, locale) : "—"}</td>
                  <td className={`wa-cell-number ${row.amountCents < 0 ? "is-debit" : "is-credit"}`}>
                    {isUsage
                      ? formatCents(row.chargedCents, locale)
                      : `${row.amountCents > 0 ? "+" : "−"}${formatUsd(Math.abs(row.amountCents), locale)}`}
                  </td>
                  <td className="wa-cell-number">
                    {row.balanceAfterCents == null ? "—" : formatBalance(row.balanceAfterCents, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="wa-credit-pager">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            {t("aiCredit:history.previous")}
          </button>
          <span>{t("aiCredit:history.page", { page: data.page, pages: data.pages })}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= data.pages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("aiCredit:history.next")}
          </button>
        </div>
      )}
    </section>
  );
}
