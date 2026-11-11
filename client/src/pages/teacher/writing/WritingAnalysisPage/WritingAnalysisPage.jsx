import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineArrowLeft } from "react-icons/hi";
import { Navigate, useLocation, useParams } from "react-router-dom";
import AnalysisWorkspacePicker from "./AnalysisWorkspacePicker.jsx";
import AnalysisSetup from "./AnalysisSetup.jsx";
import AnalysisProgress from "./AnalysisProgress.jsx";
import AnalysisReview from "./AnalysisReview.jsx";
import { useAnalysisWorkspace } from "./hooks/useAnalysisWorkspace.js";
import { useWritingAnalysisData } from "./hooks/useWritingAnalysisData.js";
import "../writingShared.css";

const ACTIVE = ["pending", "running"];

/** The old board link: /portal/writing/analysis/:projectId. */
export function WritingAnalysisLegacyRoute() {
  const { projectId } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`/portal/writing/analysis?projectId=${encodeURIComponent(projectId || "")}`}
      replace
      state={location.state}
    />
  );
}

export default function WritingAnalysisPage() {
  const { t } = useTranslation(["writing"]);
  const workspace = useAnalysisWorkspace();
  const data = useWritingAnalysisData({
    projectId: workspace.projectId,
    classId: workspace.classId,
    studentId: workspace.studentId,
    subjectId: workspace.subjectId,
  });
  const {
    analysis,
    analysisLoading,
    busy,
    closeAnalysis,
    conflict,
    dismissConflict,
    dismissPublishPreview,
    lastEvidenceChange,
    onBack,
    preparePublish,
    publish,
    publishPreview,
    refreshScope,
    retry,
    save,
    scope,
    scopeError,
    scopeLoading,
    setLevel,
    setOpportunity,
    undoEvidence,
    applyProposedLevels,
    values,
  } = data;
  const { seed } = workspace;
  // A writing-task link resolves the student server-side; adopt it into the
  // picker so changing the selection starts from what is on screen.
  useEffect(() => {
    if (!workspace.projectId || workspace.classId || !scope?.class?._id) return;
    seed({
      classId: String(scope.class._id),
      studentId: scope.student?._id ? String(scope.student._id) : "",
      subjectId: scope.subject?._id ? String(scope.subject._id) : "",
    });
  }, [scope, seed, workspace.classId, workspace.projectId]);

  const published = analysis?.publish?.state === "published";
  const studentName = scope?.student?.name || "";
  const classRow = scope?.class || workspace.selectedClass;
  const className = workspace.selectedClass?.name || "";
  const subjectName =
    scope?.subject?.name ||
    (workspace.subjectOptions || []).find(
      (row) => String(row._id) === workspace.subjectId,
    )?.name ||
    "";
  const year =
    analysis?.academicYear || scope?.academicYear || classRow?.academicYear;
  const running = analysis && ACTIVE.includes(analysis.status);

  const renderBody = () => {
    if (!workspace.projectId && !(workspace.classId && workspace.studentId)) {
      return (
        <div className="wa-empty wa-empty-inline">
          <h3>{t("writing:teacher.analysis.chooseStudentTitle")}</h3>
          <p>{t("writing:teacher.analysis.chooseStudentBody")}</p>
        </div>
      );
    }

    if (scopeLoading && !scope) {
      return (
        <div className="wa-loading" aria-live="polite">
          <div className="spinner" />
          <p>{t("writing:teacher.analysis.loading")}</p>
        </div>
      );
    }

    if (scopeError && !scope) {
      return (
        <div className="wa-empty">
          <h3>{t("writing:teacher.analysis.loadFailed")}</h3>
          <p>{scopeError}</p>
          <button type="button" className="btn btn-secondary" onClick={refreshScope}>
            {t("writing:teacher.analysis.retryLoad")}
          </button>
        </div>
      );
    }

    if (scope && !scope.enabled) {
      return (
        <div className="wa-empty">
          <h3>{t("writing:teacher.analysis.disabledTitle")}</h3>
          <p>{t("writing:teacher.analysis.disabledBody")}</p>
        </div>
      );
    }

    if (analysisLoading) {
      return (
        <div className="wa-loading" aria-live="polite">
          <div className="spinner" />
        </div>
      );
    }

    if (running) return <AnalysisProgress analysis={analysis} />;

    if (analysis && analysis.status === "failed") {
      return (
        <div className="wa-ana-banner is-error">
          <h3>{t("writing:teacher.analysis.failedTitle")}</h3>
          <p>{analysis.aiError || t("writing:teacher.analysis.failedBody")}</p>
          <div className="wa-card-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={retry}
              disabled={busy === "retry"}
            >
              {busy === "retry"
                ? t("writing:teacher.analysis.retrying")
                : t("writing:teacher.analysis.retryFailed")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeAnalysis}>
              {t("writing:teacher.analysis.newRun")}
            </button>
          </div>
        </div>
      );
    }

    if (analysis) {
      return (
        <AnalysisReview
          analysis={analysis}
          busy={busy}
          conflict={conflict}
          dismissConflict={dismissConflict}
          dismissPublishPreview={dismissPublishPreview}
          lastEvidenceChange={lastEvidenceChange}
          onEvidence={setOpportunity}
          onNewRun={closeAnalysis}
          onPublish={publish}
          onPreparePublish={preparePublish}
          onRetry={retry}
          onSave={() => save()}
          onUndoEvidence={undoEvidence}
          published={published}
          publishPreview={publishPreview}
          setLevel={setLevel}
          applyProposedLevels={applyProposedLevels}
          values={values}
        />
      );
    }

    if (!scope) return null;
    return <AnalysisSetup data={data} />;
  };

  return (
    <div className="wa-page wa-analysis">
      <div className="wa-head">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm wa-back"
            onClick={onBack}
          >
            <HiOutlineArrowLeft size={16} aria-hidden="true" />
            {t("writing:teacher.analysis.back")}
          </button>
          <p className="wa-eyebrow">{t("writing:teacher.analysis.eyebrow")}</p>
          <h1>{studentName || t("writing:teacher.analysis.title")}</h1>
          <p className="wa-sub">
            {[subjectName, className || (classRow?.grade ? `${classRow.grade}` : ""), year]
              .filter(Boolean)
              .join(" · ") || t("writing:teacher.analysis.subtitle")}
          </p>
        </div>
        {analysis && (
          <div className="wa-head-actions">
            <span className="wa-chip">
              {t(`writing:teacher.analysis.runStatuses.${analysis.status}`)}
            </span>
            {published && (
              <span className="wa-chip">
                {t("writing:teacher.analysis.publishedChip")}
              </span>
            )}
          </div>
        )}
      </div>

      <AnalysisWorkspacePicker workspace={workspace} scope={scope} />

      {renderBody()}
    </div>
  );
}
