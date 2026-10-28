import { useTranslation } from "react-i18next";
import { HiOutlineArrowLeft, HiOutlinePencilAlt, HiOutlineSearch, HiOutlineSparkles } from "react-icons/hi";
import { stageTone } from "../../../../utils/writingWorkflow.js";
import {
  formatDate,
  formatDateTime,
  sortStages,
  teacherNextStepKey,
} from "./boardPresentation.js";
import ReviewPanel from "./ReviewPanel.jsx";
import { useWritingBoardData } from "./hooks/useWritingBoardData.js";
import "../writingShared.css";

export default function WritingAssignmentBoardPage() {
  const { t, i18n } = useTranslation(["writing"]);
  const {
    assignment,
    assessWaiting,
    batchPending,
    history,
    historyLoading,
    loading,
    onBack,
    onEdit,
    onStage,
    openStudent,
    projectId,
    refresh,
    rows,
    search,
    setSearch,
    stageFilter,
    stagesPresent,
    summary,
  } = useWritingBoardData();

  if (loading) {
    return (
      <div className="wa-page wa-loading" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }

  const labelFor = (section) => section.label
    || (assignment?.sections || []).find((item) => item.key === section.key)?.label
    || section.key;

  return (
    <div className="wa-page wa-board">
      <div className="wa-head">
        <div>
          <button type="button" className="btn btn-ghost btn-sm wa-back" onClick={onBack}>
            <HiOutlineArrowLeft size={16} aria-hidden="true" />
            {t("writing:common.back")}
          </button>
          <h1>{assignment?.title || t("writing:teacher.board.title")}</h1>
          <p className="wa-sub">
            {t(`writing:teacher.types.${assignment?.writingType}`)}
            {assignment?.dueDate && <> · {t("writing:teacher.due")} {formatDate(assignment.dueDate, i18n.language)}</>}
            {assignment?.expectedLevel && <> · {assignment.expectedLevel}</>}
          </p>
        </div>
        <div className="wa-head-actions">
          {summary?.awaitingAssessment > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={batchPending}
              onClick={assessWaiting}
            >
              <HiOutlineSparkles size={16} aria-hidden="true" />
              {batchPending
                ? t("writing:teacher.review.assessing")
                : t("writing:teacher.review.batch", { n: summary.awaitingAssessment })}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onEdit}>
            <HiOutlinePencilAlt size={16} aria-hidden="true" />
            {t("writing:teacher.edit")}
          </button>
        </div>
      </div>

      {summary && (
        <div className="wa-stats">
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.total}</span>
            <span className="wa-stat-label">{t("writing:teacher.board.students")}</span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.notStarted}</span>
            <span className="wa-stat-label">{t("writing:teacher.board.notStarted")}</span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{rows.filter((row) => row.draftCount > 0).length}</span>
            <span className="wa-stat-label">{t("writing:teacher.board.withDrafts")}</span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.completed}</span>
            <span className="wa-stat-label">{t("writing:teacher.board.completed")}</span>
          </div>
        </div>
      )}

      <div className="wa-toolbar">
        <div className="wa-chip-row">
          <button
            type="button"
            className={`wa-chip-button${stageFilter === "" ? " is-active" : ""}`}
            onClick={() => onStage("")}
          >
            {t("writing:teacher.board.allStages")}
          </button>
          {sortStages(stagesPresent).map((item) => (
            <button
              type="button"
              key={item.stage}
              className={`wa-chip-button${stageFilter === item.stage ? " is-active" : ""}`}
              onClick={() => onStage(item.stage)}
            >
              {t(`writing:teacher.stages.${item.stage}`)}
              <b>{item.count}</b>
            </button>
          ))}
        </div>
        <div className="wa-search">
          <HiOutlineSearch size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("writing:teacher.board.searchPlaceholder")}
            aria-label={t("writing:teacher.board.searchPlaceholder")}
          />
        </div>
      </div>

      <div className="wa-board-body">
        <div className="wa-table-card">
          <table className="wa-table">
            <caption className="wa-sr-only">{t("writing:teacher.board.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("writing:teacher.board.columns.student")}</th>
                <th scope="col">{t("writing:teacher.board.columns.stage")}</th>
                <th scope="col" className="wa-cell-number">{t("writing:teacher.board.columns.drafts")}</th>
                <th scope="col" className="wa-cell-number">{t("writing:teacher.board.columns.words")}</th>
                <th scope="col" className="wa-cell-date">{t("writing:teacher.board.columns.lastEdit")}</th>
                <th scope="col">{t("writing:teacher.board.columns.next")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.studentId}
                  className={projectId === row.projectId && row.projectId ? "is-selected" : undefined}
                  onClick={() => row.projectId && openStudent(row.projectId)}
                  tabIndex={row.projectId ? 0 : -1}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && row.projectId) openStudent(row.projectId);
                  }}
                >
                  <td>
                    <span className="wa-student-name">{row.name}</span>
                    {row.studentIdCode && <span className="wa-student-code">{row.studentIdCode}</span>}
                  </td>
                  <td>
                    <span className={`wa-stage ${stageTone(row.stage)}`}>
                      <em>{t(`writing:teacher.stages.${row.stage}`)}</em>
                    </span>
                  </td>
                  <td className="wa-cell-number">{row.draftCount}</td>
                  <td className="wa-cell-number">{row.wordCount}</td>
                  <td className="wa-cell-date">{formatDateTime(row.lastEditedAt, i18n.language) || "—"}</td>
                  <td>{t(`writing:teacher.board.next.${teacherNextStepKey(row)}`)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="wa-table-empty">{t("writing:teacher.board.noRows")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {projectId && (
          <aside className="wa-drawer" aria-live="polite">
            <div className="wa-drawer-head">
              <h2>{history?.project?.student?.name || t("writing:teacher.board.loading")}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openStudent("")}>
                {t("writing:teacher.board.closePanel")}
              </button>
            </div>

            {historyLoading && <div className="wa-loading"><div className="spinner" /></div>}

            {!historyLoading && history && (
              <>
                <p className="wa-sub">
                  {t("writing:teacher.board.draftsIn", { n: history.drafts.length })}
                  {" · "}
                  {t(`writing:teacher.stages.${history.project.stage}`)}
                </p>
                {history.tracker?.length > 0 && (
                  <ol className="wa-tracker">
                    {history.tracker.map((step) => (
                      <li key={step.key} className={`wa-tracker-step is-${step.state}`}>
                        {t(`writing:student.tracker.${step.key}`)}
                      </li>
                    ))}
                  </ol>
                )}
                <ReviewPanel history={history} onChanged={refresh} />
                {history.drafts.length === 0 && (
                  <p className="wa-hint">{t("writing:teacher.board.noDraftsYet")}</p>
                )}
                {history.drafts.map((draft) => (
                  <section className="wa-draft" key={draft._id}>
                    <header>
                      <h3>{t("writing:teacher.board.draftNumber", { n: draft.number })}</h3>
                      <span>{t("writing:teacher.board.words", { n: draft.totalWords || 0 })}</span>
                    </header>
                    <p className="wa-draft-time">{formatDateTime(draft.submittedAt, i18n.language)}</p>
                    {(draft.sections || []).map((section) => (
                      <div className="wa-draft-section" key={`${section.key}-${section.index}`}>
                        <h4>{labelFor(section)}</h4>
                        <p>{String(section.text || "").trim() || t("writing:teacher.board.emptySection")}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
