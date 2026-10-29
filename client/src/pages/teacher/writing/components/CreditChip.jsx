import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HiOutlineCreditCard } from "react-icons/hi";
import { creditState, formatBalance } from "../../../../utils/aiCredit.js";

export default function CreditChip({ credit }) {
  const { t, i18n } = useTranslation(["aiCredit"]);
  if (!credit) return null;
  const state = creditState(credit);
  const label = state === "paused"
    ? t("aiCredit:chip.paused")
    : state === "empty"
      ? t("aiCredit:chip.empty")
      : formatBalance(credit.balanceCents, i18n.language);
  return (
    <Link to="/portal/ai-credit/me" className={`wa-credit-chip is-${state}`}>
      <HiOutlineCreditCard size={16} aria-hidden="true" />
      <span>{t("aiCredit:chip.label")}</span>
      <strong>{label}</strong>
    </Link>
  );
}
