import { useState } from "react";
import { useTranslation } from "react-i18next";
import writingService from "../../../../services/writingService.js";

/**
 * I12: proves the writing AI path works before a student draft has to fail.
 * The server call is unmetered and stores nothing; the report names provider,
 * model, latency and a typed error code, never a secret.
 */
export default function WritingAiSelfTestCard() {
  const { t } = useTranslation("writing");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await writingService.testWritingAi());
    } catch (error) {
      setResult({
        ok: false,
        message:
          error?.response?.data?.message || t("teacher.selftest.failed"),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="wa-selftest" aria-label={t("teacher.selftest.title")}>
      <div className="wa-selftest-head">
        <div>
          <h3>{t("teacher.selftest.title")}</h3>
          <p className="wa-hint">{t("teacher.selftest.hint")}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={running}
          onClick={run}
        >
          {running ? t("teacher.selftest.running") : t("teacher.selftest.run")}
        </button>
      </div>
      {result && (
        <div className="wa-selftest-result" aria-live="polite">
          <dl className="wa-insight-stats">
            <div>
              <dt>{t("teacher.selftest.status")}</dt>
              <dd>{result.ok ? t("teacher.selftest.pass") : t("teacher.selftest.fail")}</dd>
            </div>
            {result.provider && (
              <div>
                <dt>{t("teacher.selftest.provider")}</dt>
                <dd>{result.provider}</dd>
              </div>
            )}
            {result.model && (
              <div>
                <dt>{t("teacher.selftest.model")}</dt>
                <dd>{result.model}</dd>
              </div>
            )}
            {Number.isFinite(result.latencyMs) && (
              <div>
                <dt>{t("teacher.selftest.latency")}</dt>
                <dd>{t("teacher.selftest.ms", { n: result.latencyMs })}</dd>
              </div>
            )}
            {!result.ok && result.errorCode && (
              <div>
                <dt>{t("teacher.selftest.code")}</dt>
                <dd>
                  <code>{result.errorCode}</code>
                </dd>
              </div>
            )}
          </dl>
          {!result.ok && result.message && (
            <p className="wa-hint">{result.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
