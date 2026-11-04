import { useTranslation } from "react-i18next";
import { HiOutlineServerStack } from "react-icons/hi2";

export default function PlatformOffScreen() {
  const { t } = useTranslation(["inboxAssistant"]);
  return (
    <section className="ia-panel ia-intro" aria-labelledby="ia-platform-off-title">
      <span className="ia-intro-icon is-muted" aria-hidden="true">
        <HiOutlineServerStack size={24} />
      </span>
      <h2 id="ia-platform-off-title">{t("inboxAssistant:platformOff.title")}</h2>
      <p>{t("inboxAssistant:platformOff.body")}</p>
    </section>
  );
}
