import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineArrowLeft, HiOutlineLockClosed } from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import ErrorBanner from "../shared/ErrorBanner.jsx";
import CaseOverview from "./CaseOverview.jsx";
import CaseSurveys from "./CaseSurveys.jsx";
import CasePlan from "./CasePlan.jsx";
import CaseEvidence from "./CaseEvidence.jsx";
import { dateLabel, dueLabel, errorText, isOverdue, severityTone, statusTone } from "./supportUi.js";

const TABS = ["overview", "surveys", "plan", "evidence"];

const CaseWorkspace = ({ caseId, onBack }) => {
  const { t, i18n } = useTranslation("support");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("overview");

  const reload = useCallback(async () => {
    try {
      const value = await supportService.getCase(caseId);
      setData(value);
      setLoadError(false);
      return value;
    } catch (error) {
      setLoadError(true);
      toast.error(errorText(error, t("errors.loadCase")));
      return null;
    } finally {
      setLoading(false);
    }
  }, [caseId, t]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return <div className="support-empty-inline"><div className="spinner" /></div>;
  }

  if (loadError || !data) {
    return (
      <ErrorBanner
        message={t("errors.loadCase")}
        onRetry={() => { setLoading(true); reload(); }}
        retryLabel={t("common.retry")}
      />
    );
  }

  const { case: caseRow } = data;
  const closed = caseRow.status === "closed";

  return (
    <div className="support-workspace">
      <div className="support-workspace-head">
        <button type="button" className="support-back-btn" onClick={onBack}>
          <HiOutlineArrowLeft size={16} />
          {t("case.backToList")}
        </button>
        <div className="support-workspace-title">
          <div>
            <h1>{caseRow.student.name}</h1>
            <p>
              {[caseRow.student.class, caseRow.student.academicYear, caseRow.owner?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="support-workspace-chips">
            <span className={`support-chip ${severityTone(caseRow.severity)} is-solid`}>{t(`severity.${caseRow.severity}`)}</span>
            <span className={`support-chip ${statusTone(caseRow.status)}`}>{t(`status.${caseRow.status}`)}</span>
            {caseRow.nextReviewAt && (
              <span className={`support-chip ${isOverdue(caseRow.nextReviewAt) ? "is-overdue" : "is-waiting"}`}>
                {t("case.nextReview", { date: dueLabel(caseRow.nextReviewAt, i18n.language) })}
              </span>
            )}
          </div>
        </div>
        {closed && (
          <p className="support-closed-note">
            <HiOutlineLockClosed size={15} />
            {t("case.closedNote", { date: dateLabel(caseRow.closedAt, i18n.language) })}
            {caseRow.closeReason ? ` · ${t(`case.closeReason.${caseRow.closeReason}`, { defaultValue: caseRow.closeReason })}` : ""}
          </p>
        )}
      </div>

      <div className="support-tabs" role="tablist" aria-label={t("case.tabsLabel")}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`support-tab ${tab === key ? "is-active" : ""}`}
            onClick={() => setTab(key)}
          >
            {t(`case.tab.${key}`)}
            {key === "surveys" && data.surveys.length > 0 && (
              <span className="support-tab-count">{data.surveys.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <CaseOverview data={data} reload={reload} />}
      {tab === "surveys" && <CaseSurveys data={data} reload={reload} />}
      {tab === "plan" && <CasePlan data={data} reload={reload} />}
      {tab === "evidence" && <CaseEvidence data={data} />}
    </div>
  );
};

export default CaseWorkspace;
