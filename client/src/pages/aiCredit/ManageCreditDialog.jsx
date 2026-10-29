import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import aiCreditService from "../../services/aiCreditService.js";
import {
  centsToDollarsInput,
  creditState,
  dollarsToCents,
  formatBalance,
  formatUsd,
} from "../../utils/aiCredit.js";
import CreditHistoryTable from "./CreditHistoryTable.jsx";

const MAX_CENTS = 100000;

export default function ManageCreditDialog({ teacher, reserveCents = 0, onClose, onChanged }) {
  const { t, i18n } = useTranslation(["aiCredit"]);
  const locale = i18n.language;
  const [mode, setMode] = useState("allocate");
  const [amount, setAmount] = useState("5");
  const [note, setNote] = useState("");
  const [warning, setWarning] = useState(centsToDollarsInput(teacher.lowBalanceCents));
  const [paused, setPaused] = useState(teacher.paused);
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const userId = teacher.userId;

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const loadHistory = useCallback(
    (page, type, pageSize) =>
      aiCreditService.getAccountHistory(userId, { page, type: type || undefined, pageSize }),
    [userId],
  );

  const state = creditState(teacher);

  const saveAmount = async (event) => {
    event.preventDefault();
    const cents = dollarsToCents(amount);
    if (!Number.isFinite(cents) || cents < 1 || cents > MAX_CENTS) {
      toast.error(t("aiCredit:admin.dialog.invalid"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "allocate") {
        await aiCreditService.allocate(userId, { amountCents: cents, note: note.trim() });
      } else {
        await aiCreditService.reclaim(userId, { amountCents: cents, note: note.trim() });
      }
      toast.success(t(mode === "allocate" ? "aiCredit:admin.dialog.allocated" : "aiCredit:admin.dialog.returned"));
      setNote("");
      setHistoryKey((current) => current + 1);
      onChanged();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:admin.dialog.failed"));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    const cents = dollarsToCents(warning);
    if (!Number.isFinite(cents) || cents < 0 || cents > MAX_CENTS) {
      toast.error(t("aiCredit:admin.dialog.settingsInvalid"));
      return;
    }
    setBusy(true);
    try {
      await aiCreditService.updateSettings(userId, { lowBalanceCents: cents, paused });
      toast.success(t("aiCredit:admin.dialog.settingsSaved"));
      onChanged();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("aiCredit:admin.dialog.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div
        className="wa-modal wa-credit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-credit-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="wa-modal-head">
          <div className="wa-modal-id">
            <h2 id="wa-credit-dialog-title">{teacher.name}</h2>
            <p className="wa-sub">
              {t("aiCredit:balance")}: <strong>{formatBalance(teacher.balanceCents, locale)}</strong>
              {" · "}
              {t("aiCredit:admin.dialog.schoolShare")}: <strong>{formatBalance(teacher.schoolCents, locale)}</strong>
              {" · "}
              <span className={`wa-credit-state is-${state}`}>{t(`aiCredit:states.${state}`)}</span>
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} autoFocus>
            {t("aiCredit:admin.dialog.close")}
          </button>
        </header>

        <div className="wa-credit-modal-body">
          <div className="wa-credit-top">
            <form className="wa-credit-panel wa-credit-form" onSubmit={saveAmount}>
              <h3>{t("aiCredit:admin.dialog.adjustTitle")}</h3>
              <p className="wa-hint">
                {t("aiCredit:admin.dialog.reserveLeft", { amount: formatBalance(reserveCents, locale) })}
              </p>
              <div className="wa-chip-row" role="group" aria-label={t("aiCredit:admin.dialog.adjustTitle")}>
                {["allocate", "reclaim"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`wa-chip-button${mode === value ? " is-active" : ""}`}
                    onClick={() => setMode(value)}
                  >
                    {t(`aiCredit:admin.dialog.${value}`)}
                  </button>
                ))}
              </div>
              <label className="wa-field">
                <span>{t("aiCredit:admin.dialog.amount")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="wa-hint">{t("aiCredit:amountHelp")}</p>
              <label className="wa-field">
                <span>{t("aiCredit:admin.dialog.note")}</span>
                <input
                  type="text"
                  maxLength={500}
                  value={note}
                  placeholder={t("aiCredit:admin.dialog.notePlaceholder")}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <p className="wa-hint">
                {t(mode === "allocate"
                  ? "aiCredit:admin.dialog.allocateHelp"
                  : "aiCredit:admin.dialog.reclaimHelp")}
              </p>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? t("aiCredit:admin.dialog.saving") : t(`aiCredit:admin.dialog.save_${mode}`)}
                </button>
              </div>
            </form>

            <form className="wa-credit-panel wa-credit-form" onSubmit={saveSettings}>
              <h3>{t("aiCredit:admin.dialog.settingsTitle")}</h3>
              <label className="wa-field">
                <span>{t("aiCredit:admin.dialog.warning")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={warning}
                  onChange={(event) => setWarning(event.target.value)}
                />
              </label>
              <p className="wa-hint">{t("aiCredit:admin.dialog.warningHelp")}</p>
              <label className="wa-switch">
                <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />
                {t("aiCredit:admin.dialog.pause")}
              </label>
              <p className="wa-hint">{t("aiCredit:admin.dialog.pauseHelp")}</p>
              <div>
                <button type="submit" className="btn btn-secondary" disabled={busy}>
                  {t("aiCredit:admin.dialog.saveSettings")}
                </button>
              </div>
            </form>
          </div>

          <p className="wa-hint">
            {t("aiCredit:admin.dialog.totals", {
              added: formatUsd(teacher.grantedCents, locale),
              spent: formatUsd(teacher.spentCents, locale),
            })}
            {" · "}
            {t("aiCredit:admin.dialog.grantShare", { amount: formatBalance(teacher.grantCents, locale) })}
          </p>

          <CreditHistoryTable key={historyKey} load={loadHistory} />
        </div>
      </div>
    </div>
  );
}
