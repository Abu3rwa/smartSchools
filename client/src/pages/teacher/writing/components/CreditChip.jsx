import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HiOutlineCreditCard } from "react-icons/hi";
import { creditState, formatBalance } from "../../../../utils/writingCredit.js";

export default function CreditChip({ credit }) {
  const { t, i18n } = useTranslation(["writing"]);
  if (!credit) return null;
  const state = creditState(credit);
  const label = state === "paused"
    ? t("writing:credit.chip.paused")
    : state === "empty"
      ? t("writing:credit.chip.empty")
      : formatBalance(credit.balanceCents, i18n.language);
  return (
    <Link to="/portal/writing/credit" className={`wa-credit-chip is-${state}`}>
      <HiOutlineCreditCard size={16} aria-hidden="true" />
      <span>{t("writing:credit.chip.label")}</span>
      <strong>{label}</strong>
    </Link>
  );
}
