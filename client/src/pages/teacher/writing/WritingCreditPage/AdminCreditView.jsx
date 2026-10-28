import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineSearch } from "react-icons/hi";
import writingService from "../../../../services/writingService.js";
import {
  centsToDollarsInput,
  creditState,
  dollarsToCents,
  formatBalance,
  formatCents,
  formatUsd,
} from "../../../../utils/writingCredit.js";
import ManageCreditDialog from "./ManageCreditDialog.jsx";
import "../writingShared.css";
import "./writingCredit.css";

const MAX_CENTS = 100000;

export default function AdminCreditView() {
  const { t, i18n } = useTranslation(["writing"]);
  const locale = i18n.language;
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState({ key: -1, data: null });
  const [search, setSearch] = useState("");
  const [manageId, setManageId] = useState("");
  const [amounts, setAmounts] = useState({});
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [topUpNote, setTopUpNote] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);

  useEffect(() => {
    let active = true;
    writingService.listCreditAccounts()
      .then((data) => { if (active) setLoaded({ key: refreshKey, data }); })
      .catch((error) => {
        if (!active) return;
        setLoaded((current) => ({ key: refreshKey, data: current.data }));
        toast.error(error?.response?.data?.message || t("writing:credit.loadFailed"));
      });
    return () => { active = false; };
  }, [refreshKey, t]);

  const data = loaded.data;
  const rows = useMemo(() => data?.rows || [], [data]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(needle));
  }, [rows, search]);
  const closeManage = useCallback(() => setManageId(""), []);

  const refreshing = loaded.key !== refreshKey;
  if (!data) {
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

  const refresh = () => setRefreshKey((current) => current + 1);
  const managed = rows.find((row) => row.userId === manageId) || null;
  const formatDate = (value) => new Date(value).toLocaleDateString(locale, {
    day: "2-digit", month: "short", year: "numeric",
  });

  const sendTopUp = async (event) => {
    event.preventDefault();
    const cents = dollarsToCents(topUpAmount);
    if (!Number.isFinite(cents) || cents < 1 || cents > MAX_CENTS) {
      toast.error(t("writing:credit.admin.dialog.invalid"));
      return;
    }
    setTopUpBusy(true);
    try {
      await writingService.requestCredit({ amountCents: cents, note: topUpNote.trim(), target: "pool" });
      toast.success(t("writing:credit.admin.topUp.sent"));
      setTopUpNote("");
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:credit.admin.topUp.failed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  const cancelTopUp = async () => {
    if (!data?.poolRequest) return;
    setTopUpBusy(true);
    try {
      await writingService.cancelCreditRequest(data.poolRequest.id);
      toast.success(t("writing:credit.admin.topUp.cancelled"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:credit.admin.topUp.failed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  const decide = async (request, approve) => {
    const body = { approve, note: (notes[request.id] || "").trim() };
    if (approve) {
      const cents = dollarsToCents(amounts[request.id] ?? centsToDollarsInput(request.amountCents));
      if (!Number.isFinite(cents) || cents < 1 || cents > MAX_CENTS) {
        toast.error(t("writing:credit.admin.dialog.invalid"));
        return;
      }
      body.amountCents = cents;
    }
    setBusyId(request.id);
    try {
      await writingService.decideCreditRequest(request.id, body);
      toast.success(t(approve ? "writing:credit.admin.approved" : "writing:credit.admin.declined"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:credit.admin.decideFailed"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="wa-page wa-credit-page">
      <div className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("writing:credit.admin.eyebrow")}</p>
          <h1>{t("writing:credit.admin.title")}</h1>
          <p className="wa-sub">{t("writing:credit.adminSubtitle")}</p>
        </div>
        <Link to="/portal/writing/credit" className="btn btn-secondary btn-sm">
          {t("writing:credit.myCredit")}
        </Link>
      </div>

      <div className="wa-stats">
        <div className="wa-stat">
          <span className="wa-stat-value">{formatBalance(data.pool.balanceCents, locale)}</span>
          <span className="wa-stat-label">{t("writing:credit.admin.stats.reserve")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{formatBalance(data.pool.allocatedCents, locale)}</span>
          <span className="wa-stat-label">{t("writing:credit.admin.stats.allocated")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{formatUsd(data.totals.spentThisMonthCents, locale)}</span>
          <span className="wa-stat-label">{t("writing:credit.admin.stats.spentThisMonth")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{data.pending.length}</span>
          <span className="wa-stat-label">{t("writing:credit.admin.stats.waiting")}</span>
        </div>
      </div>

      <p className="wa-hint">
        {t("writing:credit.rates", {
          model: data.rates?.model,
          input: formatUsd(data.rates?.inputPerMillionCents, locale, 4),
          cached: formatUsd(data.rates?.cachedInputPerMillionCents, locale, 4),
          output: formatUsd(data.rates?.outputPerMillionCents, locale, 4),
        })}
        {" "}
        {t("writing:credit.admin.chargingNote")}
      </p>

      <section className="wa-credit-panel">
        <header className="wa-credit-panel-head">
          <div>
            <h2>{t("writing:credit.admin.topUp.title")}</h2>
            <p className="wa-hint">{t("writing:credit.admin.topUp.body")}</p>
          </div>
        </header>
        {data.poolRequest ? (
          <div className="wa-credit-form">
            <p className="wa-credit-help">
              {t("writing:credit.admin.topUp.pendingBody", {
                amount: formatUsd(data.poolRequest.amountCents, locale),
                date: formatDate(data.poolRequest.createdAt),
              })}
            </p>
            {data.poolRequest.note && <p className="wa-credit-quote" dir="auto">{data.poolRequest.note}</p>}
            <div>
              <button type="button" className="btn btn-secondary" disabled={topUpBusy || refreshing} onClick={cancelTopUp}>
                {t("writing:credit.admin.topUp.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <form className="wa-credit-form" onSubmit={sendTopUp}>
            <div className="wa-credit-top">
              <label className="wa-field">
                <span>{t("writing:credit.admin.topUp.amount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                />
              </label>
              <label className="wa-field wa-grow">
                <span>{t("writing:credit.admin.topUp.note")}</span>
                <input
                  type="text"
                  maxLength={500}
                  value={topUpNote}
                  placeholder={t("writing:credit.admin.topUp.notePlaceholder")}
                  onChange={(event) => setTopUpNote(event.target.value)}
                />
              </label>
            </div>
            <p className="wa-hint">{t("writing:credit.admin.topUp.help")}</p>
            <div>
              <button type="submit" className="btn btn-primary" disabled={topUpBusy || refreshing}>
                {t("writing:credit.admin.topUp.send")}
              </button>
            </div>
          </form>
        )}
      </section>

      {data.pending.length > 0 && (
        <section className="wa-credit-panel">
          <header className="wa-credit-panel-head">
            <div>
              <h2>{t("writing:credit.admin.waitingTitle")}</h2>
              <p className="wa-hint">{t("writing:credit.admin.waitingBody")}</p>
              <p className="wa-hint">{t("writing:credit.amountHelp")}</p>
            </div>
          </header>
          <ul className="wa-credit-waiting">
            {data.pending.map((request) => (
              <li key={request.id}>
                <div className="wa-credit-waiting-who">
                  <strong>{request.teacherName}</strong>
                  <span className="wa-hint">
                    {t("writing:credit.admin.requested", {
                      amount: formatUsd(request.amountCents, locale),
                      date: formatDate(request.createdAt),
                    })}
                  </span>
                  {request.note && <span className="wa-credit-quote" dir="auto">{request.note}</span>}
                </div>
                <label className="wa-field wa-credit-amount-field">
                  <span>{t("writing:credit.admin.grantAmount")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amounts[request.id] ?? centsToDollarsInput(request.amountCents)}
                    onChange={(event) => setAmounts((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                </label>
                <label className="wa-field wa-grow">
                  <span>{t("writing:credit.admin.decisionNote")}</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={notes[request.id] || ""}
                    placeholder={t("writing:credit.admin.decisionNotePlaceholder")}
                    onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                </label>
                <div className="wa-credit-waiting-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busyId) || refreshing}
                    onClick={() => decide(request, true)}
                  >
                    {t("writing:credit.admin.approve")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={Boolean(busyId) || refreshing}
                    onClick={() => decide(request, false)}
                  >
                    {t("writing:credit.admin.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="wa-credit-panel">
        <header className="wa-credit-panel-head">
          <div>
            <h2>{t("writing:credit.admin.teachersTitle")}</h2>
            <p className="wa-hint">{t("writing:credit.admin.teachersBody")}</p>
          </div>
          <div className="wa-search">
            <HiOutlineSearch size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder={t("writing:credit.admin.search")}
              aria-label={t("writing:credit.admin.search")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </header>

        <div className="wa-table-card">
          <table className="wa-table wa-credit-teachers">
            <thead>
              <tr>
                <th>{t("writing:credit.admin.columns.teacher")}</th>
                <th className="wa-cell-number">{t("writing:credit.admin.columns.balance")}</th>
                <th className="wa-cell-number">{t("writing:credit.admin.columns.schoolShare")}</th>
                <th>{t("writing:credit.admin.columns.thisMonth")}</th>
                <th className="wa-cell-number">{t("writing:credit.admin.columns.warning")}</th>
                <th>{t("writing:credit.admin.columns.status")}</th>
                <th aria-label={t("writing:credit.admin.manage")} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="wa-table-empty">
                    {rows.length === 0 ? t("writing:credit.admin.noTeachers") : t("writing:credit.admin.noMatch")}
                  </td>
                </tr>
              )}
              {visible.map((row) => {
                const state = creditState(row);
                return (
                  <tr key={row.userId} onClick={() => setManageId(row.userId)}>
                    <td>
                      <span className="wa-student-name">{row.name}</span>
                      <span className="wa-student-code">{row.email}</span>
                    </td>
                    <td className="wa-cell-number">{formatBalance(row.balanceCents, locale)}</td>
                    <td className="wa-cell-number">{formatBalance(row.schoolCents, locale)}</td>
                    <td>
                      {t("writing:credit.admin.monthCell", {
                        cost: formatCents(row.thisMonth.costCents, locale),
                        n: row.thisMonth.requests,
                      })}
                    </td>
                    <td className="wa-cell-number">{formatUsd(row.lowBalanceCents, locale)}</td>
                    <td>
                      <div className="wa-credit-status-cell">
                        <span className={`wa-credit-state is-${state}`}>{t(`writing:credit.states.${state}`)}</span>
                        {row.pendingRequest && (
                          <span className="wa-credit-status is-pending">{t("writing:credit.admin.waitingChip")}</span>
                        )}
                        {!row.active && <span className="wa-credit-flag">{t("writing:credit.admin.inactive")}</span>}
                      </div>
                    </td>
                    <td className="wa-cell-number">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setManageId(row.userId);
                        }}
                      >
                        {t("writing:credit.admin.manage")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {managed && (
        <ManageCreditDialog
          key={managed.userId}
          teacher={managed}
          reserveCents={data.pool.balanceCents}
          onClose={closeManage}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
