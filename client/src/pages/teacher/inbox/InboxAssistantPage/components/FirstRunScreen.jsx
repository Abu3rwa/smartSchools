import { useTranslation } from "react-i18next";
import {
  HiOutlineBanknotes,
  HiOutlineEye,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from "react-icons/hi2";

const FACTS = [
  ["readsTitle", "reads", HiOutlineEye],
  ["aiTitle", "ai", HiOutlineSparkles],
  ["neverTitle", "never", HiOutlineShieldCheck],
  ["costTitle", "cost", HiOutlineBanknotes],
];

export default function FirstRunScreen({ saving, onEnable }) {
  const { t } = useTranslation(["inboxAssistant"]);
  return (
    <section className="ia-panel ia-intro ia-first-run" aria-labelledby="ia-first-run-title">
      <span className="ia-intro-icon" aria-hidden="true">
        <HiOutlineSparkles size={24} />
      </span>
      <h2 id="ia-first-run-title">{t("inboxAssistant:firstRun.title")}</h2>
      <p className="ia-first-run-intro">{t("inboxAssistant:firstRun.intro")}</p>
      <dl className="ia-facts">
        {FACTS.map(([titleKey, bodyKey, Icon]) => (
          <div className="ia-fact" key={titleKey}>
            <span className="ia-fact-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
              <dt>{t(`inboxAssistant:firstRun.${titleKey}`)}</dt>
              <dd>{t(`inboxAssistant:firstRun.${bodyKey}`)}</dd>
            </div>
          </div>
        ))}
      </dl>
      <button type="button" className="btn btn-primary" onClick={onEnable} disabled={saving}>
        {t(saving ? "inboxAssistant:firstRun.turningOn" : "inboxAssistant:firstRun.button")}
      </button>
    </section>
  );
}
