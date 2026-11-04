import { useTranslation } from "react-i18next";
import { HiOutlineLink } from "react-icons/hi2";

export default function ConnectScreen({ requiresReauth, connecting, onConnect }) {
  const { t } = useTranslation(["inboxAssistant"]);
  return (
    <section className="ia-panel ia-intro ia-connect" aria-labelledby="ia-connect-title">
      <span className="ia-intro-icon" aria-hidden="true">
        <HiOutlineLink size={24} />
      </span>
      <h2 id="ia-connect-title">
        {t(requiresReauth ? "inboxAssistant:connect.reauthTitle" : "inboxAssistant:connect.title")}
      </h2>
      <p>
        {t(requiresReauth ? "inboxAssistant:connect.reauthBody" : "inboxAssistant:connect.body")}
      </p>
      <button type="button" className="btn btn-primary" onClick={onConnect} disabled={connecting}>
        {t(connecting ? "inboxAssistant:connect.connecting" : "inboxAssistant:connect.button")}
      </button>
    </section>
  );
}
