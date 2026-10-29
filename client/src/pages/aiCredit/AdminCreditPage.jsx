import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineSearch } from "react-icons/hi";
import aiCreditService from "../../services/aiCreditService.js";
import {
  centsToDollarsInput,
  creditState,
  dollarsToCents,
  formatBalance,
  formatCents,
  formatUsd,
} from "../../utils/aiCredit.js";
import ManageCreditDialog from "./ManageCreditDialog.jsx";
import "../teacher/writing/writingShared.css";
import "./aiCredit.css";

const MAX_CENTS = 100000;

export default function AdminCreditPage() {
  const { t, i18n } = useTranslation(["aiCredit"]);
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
    aiCreditService.listAccounts()
      .then((data) => { if (active) setLoaded({ key: refreshKey, data }); })
      .catch((error) => {
        if (!active) return;
        setLoaded((current) => ({ key: refreshKey, data: current.data }));
        toast.error(error?.response?.data?.message || t("aiCredit:loadFailed"));
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
            <p>{t("aiCredit:loadFailed")}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>
              {t("aiCredit:retry")}
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
      toast.error(t("aiCredit:admin.dialog.invalid"));
      return;
    }
    setTopUpBusy(true);
    try {
      await aiCreditService.requestCredit({ amountCents: cents, note: topUpNote.trim(), target: "pool" });
      toast.success(t("aiCredit:admin.topUp.sent"));
      setTopUpNote("");
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:admin.topUp.failed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  const cancelTopUp = async () => {
    if (!data?.poolRequest) return;
    setTopUpBusy(true);
    try {
      await aiCreditService.cancelRequest(data.poolRequest.id);
      toast.success(t("aiCredit:admin.topUp.cancelled"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:admin.topUp.failed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  const decide = async (request, approve) => {
    const body = { approve, note: (notes[request.id] || "").trim() };
    if (approve) {
      const cents = dollarsToCents(amounts[request.id] ?? centsToDollarsInput(request.amountCents));
      if (!Number.isFinite(cents) || cents < 1 || cents > MAX_CENTS) {
        toast.error(t("aiCredit:admin.dialog.invalid"));
        return;
      }
      body.amountCents = cents;
    }
    setBusyId(request.id);
    try {
      await aiCreditService.decideRequest(request.id, body);
      toast.success(t(approve ? "aiCredit:admin.approved" : "aiCredit:admin.declined"));
      refresh();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:admin.decideFailed"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="wa-page wa-credit-page">
      <div className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("aiCredit:admin.eyebrow")}</p>
          <h1>{t("aiCredit:admin.title")}</h1>
          <p className="wa-sub">{t("aiCredit:adminSubtitle")}</p>
        </div>
        <Link to="/portal/ai-credit/me" className="btn btn-secondary btn-sm">
          {t("aiCredit:myCredit")}
        </Link>
      </div>

      <div className="wa-stats">
        <div className="wa-stat">
          <span className="wa-stat-value">{formatBalance(data.pool.balanceCents, locale)}</span>
          <span className="wa-stat-label">{t("aiCredit:admin.stats.reserve")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{formatBalance(data.pool.allocatedCents, locale)}</span>
          <span className="wa-stat-label">{t("aiCredit:admin.stats.allocated")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{formatUsd(data.totals.spentThisMonthCents, locale)}</span>
          <span className="wa-stat-label">{t("aiCredit:admin.stats.spentThisMonth")}</span>
        </div>
        <div className="wa-stat">
          <span className="wa-stat-value">{data.pending.length}</span>
          <span className="wa-stat-label">{t("aiCredit:admin.stats.waiting")}</span>
        </div>
      </div>

      <section className="wa-credit-panel">
        <header className="wa-credit-panel-head">
          <div>
            <h2>{t("aiCredit:admin.topUp.title")}</h2>
            <p className="wa-hint">{t("aiCredit:admin.topUp.body")}</p>
          </div>
        </header>
        {data.poolRequest ? (
          <div className="wa-credit-form">
            <p className="wa-credit-help">
              {t("aiCredit:admin.topUp.pendingBody", {
                amount: formatUsd(data.poolRequest.amountCents, locale),
                date: formatDate(data.poolRequest.createdAt),
              })}
            </p>
            {data.poolRequest.note && <p className="wa-credit-quote" dir="auto">{data.poolRequest.note}</p>}
            <div>
              <button type="button" className="btn btn-secondary" disabled={topUpBusy || refreshing} onClick={cancelTopUp}>
                {t("aiCredit:admin.topUp.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <form className="wa-credit-form" onSubmit={sendTopUp}>
            <div className="wa-credit-top">
              <label className="wa-field">
                <span>{t("aiCredit:admin.topUp.amount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                />
              </label>
              <label className="wa-field wa-grow">
                <span>{t("aiCredit:admin.topUp.note")}</span>
                <input
                  type="text"
                  maxLength={500}
                  value={topUpNote}
                  placeholder={t("aiCredit:admin.topUp.notePlaceholder")}
                  onChange={(event) => setTopUpNote(event.target.value)}
                />
              </label>
            </div>
            <p className="wa-hint">{t("aiCredit:admin.topUp.help")}</p>
            <div>
              <button type="submit" className="btn btn-primary" disabled={topUpBusy || refreshing}>
                {t("aiCredit:admin.topUp.send")}
              </button>
            </div>
          </form>
        )}
      </section>

      {data.pending.length > 0 && (
        <section className="wa-credit-panel">
          <header className="wa-credit-panel-head">
            <div>
              <h2>{t("aiCredit:admin.waitingTitle")}</h2>
              <p className="wa-hint">{t("aiCredit:admin.waitingBody")}</p>
              <p className="wa-hint">{t("aiCredit:amountHelp")}</p>
            </div>
          </header>
          <ul className="wa-credit-waiting">
            {data.pending.map((request) => (
              <li key={request.id}>
                <div className="wa-credit-waiting-who">
                  <strong>{request.teacherName}</strong>
                  <span className="wa-hint">
                    {t("aiCredit:admin.requested", {
                      amount: formatUsd(request.amountCents, locale),
                      date: formatDate(request.createdAt),
                    })}
                  </span>
                  {request.note && <span className="wa-credit-quote" dir="auto">{request.note}</span>}
                </div>
                <label className="wa-field wa-credit-amount-field">
                  <span>{t("aiCredit:admin.grantAmount")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amounts[request.id] ?? centsToDollarsInput(request.amountCents)}
                    onChange={(event) => setAmounts((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                </label>
                <label className="wa-field wa-grow">
                  <span>{t("aiCredit:admin.decisionNote")}</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={notes[request.id] || ""}
                    placeholder={t("aiCredit:admin.decisionNotePlaceholder")}
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
                    {t("aiCredit:admin.approve")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={Boolean(busyId) || refreshing}
                    onClick={() => decide(request, false)}
                  >
                    {t("aiCredit:admin.decline")}
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
            <h2>{t("aiCredit:admin.teachersTitle")}</h2>
            <p className="wa-hint">{t("aiCredit:admin.teachersBody")}</p>
          </div>
          <div className="wa-search">
            <HiOutlineSearch size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder={t("aiCredit:admin.search")}
              aria-label={t("aiCredit:admin.search")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </header>

        <div className="wa-table-card">
          <table className="wa-table wa-credit-teachers">
            <thead>
              <tr>
                <th>{t("aiCredit:admin.columns.teacher")}</th>
                <th className="wa-cell-number">{t("aiCredit:admin.columns.balance")}</th>
                <th className="wa-cell-number">{t("aiCredit:admin.columns.schoolShare")}</th>
                <th>{t("aiCredit:admin.columns.thisMonth")}</th>
                <th className="wa-cell-number">{t("aiCredit:admin.columns.warning")}</th>
                <th>{t("aiCredit:admin.columns.status")}</th>
                <th aria-label={t("aiCredit:admin.manage")} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="wa-table-empty">
                    {rows.length === 0 ? t("aiCredit:admin.noTeachers") : t("aiCredit:admin.noMatch")}
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
                      {t("aiCredit:admin.monthCell", {
                        cost: formatCents(row.thisMonth.costCents, locale),
                        n: row.thisMonth.requests,
                      })}
                    </td>
                    <td className="wa-cell-number">{formatUsd(row.lowBalanceCents, locale)}</td>
                    <td>
                      <div className="wa-credit-status-cell">
                        <span className={`wa-credit-state is-${state}`}>{t(`aiCredit:states.${state}`)}</span>
                        {row.pendingRequest && (
                          <span className="wa-credit-status is-pending">{t("aiCredit:admin.waitingChip")}</span>
                        )}
                        {!row.active && <span className="wa-credit-flag">{t("aiCredit:admin.inactive")}</span>}
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
                        {t("aiCredit:admin.manage")}
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
