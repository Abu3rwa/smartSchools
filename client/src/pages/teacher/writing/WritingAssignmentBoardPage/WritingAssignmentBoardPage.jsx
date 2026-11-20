import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { countLabel } from "../../../../utils/countText.js";
import {
  HiOutlineArrowLeft,
  HiOutlineChartBar,
  HiOutlinePencilAlt,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineSparkles,
} from "react-icons/hi";
import { stageTone } from "../../../../utils/writingWorkflow.js";
import {
  canReturnSubmission,
  formatDate,
  formatDateTime,
  sortStages,
  teacherNextStepKey,
} from "./boardPresentation.js";
import ReviewPanel from "./ReviewPanel.jsx";
import PasteAttempts from "./PasteAttempts.jsx";
import BatchRunPanel from "./BatchRunPanel.jsx";
import BulkPublishPanel from "./BulkPublishPanel.jsx";
import ClassInsightPanel from "./ClassInsightPanel.jsx";
import WritingAiSelfTestCard from "./WritingAiSelfTestCard.jsx";
import CreditChip from "../components/CreditChip.jsx";
import ErrorBanner from "../../../../components/shared/ErrorBanner.jsx";
import useFocusTrap from "../../../../hooks/useFocusTrap.js";
import { useWritingBoardData } from "./hooks/useWritingBoardData.js";
import "../writingShared.css";

export default function WritingAssignmentBoardPage() {
  const { t, i18n } = useTranslation(["writing"]);
  const {
    assignment,
    assessWaiting,
    analyseStudent,
    batchCancel,
    batchConfirm,
    batchDismiss,
    batchPending,
    batchPrompt,
    batchRetry,
    batchRun,
    bulkClear,
    bulkConfirm,
    bulkDismiss,
    bulkNotify,
    bulkPending,
    bulkPrompt,
    bulkRequest,
    bulkResult,
    credit,
    emailDelivery,
    failed,
    history,
    historyFailed,
    historyLoading,
    loading,
    onBack,
    onEdit,
    onStage,
    openStudent,
    projectId,
    refresh,
    returnSubmission,
    rows,
    search,
    selectedProjects,
    setBulkNotify,
    setSearch,
    sort,
    onSort,
    stageFilter,
    stagesPresent,
    summary,
    teacherTools,
    toggleSelect,
    toggleSelectAll,
  } = useWritingBoardData();

  // The review dialog owns the screen: Escape closes it and the page behind it stays put.
  const modalRef = useRef(null);
  const closeRef = useRef(null);
  // ReviewPanel owns the editable text, so it reports whether leaving would lose it.
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((value) => {
    dirtyRef.current = value;
  }, []);

  const requestClose = useCallback(() => {
    if (
      dirtyRef.current &&
      !window.confirm(t("writing:teacher.review.discardEdits"))
    ) {
      return;
    }
    openStudent("");
  }, [openStudent, t]);

  useFocusTrap({
    active: Boolean(projectId),
    containerRef: modalRef,
    initialFocusRef: closeRef,
    onEscape: requestClose,
  });

  useEffect(() => {
    if (!projectId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="wa-page wa-loading" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }

  // Nothing loaded: say the load failed and offer a retry, never an empty class list.
  if (failed && !assignment) {
    return (
      <div className="wa-page wa-board">
        <div className="wa-head">
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm wa-back"
              onClick={onBack}
            >
              <HiOutlineArrowLeft size={16} aria-hidden="true" />
              {t("writing:common.back")}
            </button>
            <h1>{t("writing:teacher.board.title")}</h1>
          </div>
        </div>
        <ErrorBanner
          message={t("writing:teacher.boardLoadFailed")}
          onRetry={refresh}
          retryLabel={t("writing:teacher.retry")}
        />
      </div>
    );
  }

  const selectedRow = rows.find((row) => row.projectId === projectId) || null;

  // F7: selection is per project; a student with no task yet cannot be picked.
  const selectableRows = rows.filter((row) => row.projectId);
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selectedProjects.has(row.projectId));
  const openBulkPublish = () =>
    bulkRequest([...selectedProjects], {
      student: Boolean(emailDelivery?.students && bulkNotify.student),
      parents: Boolean(emailDelivery?.parents && bulkNotify.parents),
    });
  // The recipient counts on screen must match the channels that will be used.
  const changeBulkNotify = (role, value) => {
    const next = { ...bulkNotify, [role]: value };
    setBulkNotify(next);
    if (bulkPrompt) {
      bulkRequest(
        bulkPrompt.rows.map((row) => row.projectId),
        {
          student: Boolean(emailDelivery?.students && next.student),
          parents: Boolean(emailDelivery?.parents && next.parents),
        },
      );
    }
  };

  const labelFor = (section) =>
    section.label ||
    (assignment?.sections || []).find((item) => item.key === section.key)
      ?.label ||
    section.key;

  return (
    <div className="wa-page wa-board">
      <div className="wa-head">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm wa-back"
            onClick={onBack}
          >
            <HiOutlineArrowLeft size={16} aria-hidden="true" />
            {t("writing:common.back")}
          </button>
          <h1>{assignment?.title || t("writing:teacher.board.title")}</h1>
          <p className="wa-sub">
            {t(`writing:teacher.types.${assignment?.writingType}`)}
            {assignment?.dueDate && (
              <>
                {" "}
                · {t("writing:teacher.due")}{" "}
                {formatDate(assignment.dueDate, i18n.language)}
              </>
            )}
            {assignment?.expectedLevel && <> · {assignment.expectedLevel}</>}
          </p>
        </div>
        <div className="wa-head-actions">
          <CreditChip credit={credit} />
          {summary?.awaitingAssessment > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={batchPending || batchRun?.status === "running"}
              onClick={assessWaiting}
            >
              <HiOutlineSparkles size={16} aria-hidden="true" />
              {batchPending
                ? t("writing:teacher.review.assessing")
                : t("writing:teacher.review.batchUpTo", {
                    // One run takes ten drafts with the queued batch, five with
                    // the legacy path; say so rather than promising the queue.
                    n: Math.min(
                      summary.awaitingAssessment,
                      teacherTools ? 10 : 5,
                    ),
                  })}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onEdit}>
            <HiOutlinePencilAlt size={16} aria-hidden="true" />
            {t("writing:teacher.edit")}
          </button>
        </div>
      </div>

      {failed && (
        <ErrorBanner
          message={t("writing:teacher.boardLoadFailed")}
          onRetry={refresh}
          retryLabel={t("writing:teacher.retry")}
        />
      )}

      {teacherTools && (
        <BatchRunPanel
          prompt={batchPrompt}
          run={batchRun}
          busy={batchPending}
          locale={i18n.language}
          onConfirm={batchConfirm}
          onDismiss={batchDismiss}
          onCancel={batchCancel}
          onRetry={batchRetry}
        />
      )}

      {teacherTools && (
        <BulkPublishPanel
          prompt={bulkPrompt}
          result={bulkResult}
          pending={bulkPending}
          emailDelivery={emailDelivery}
          notify={bulkNotify}
          onNotifyChange={changeBulkNotify}
          onConfirm={bulkConfirm}
          onDismiss={bulkDismiss}
        />
      )}

      {summary && (
        <div className="wa-stats">
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.total}</span>
            <span className="wa-stat-label">
              {t("writing:teacher.board.students")}
            </span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.needsTeacher}</span>
            <span className="wa-stat-label">
              {t("writing:teacher.board.needsTeacher")}
            </span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.notStarted}</span>
            <span className="wa-stat-label">
              {t("writing:teacher.board.notStarted")}
            </span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">
              {rows.filter((row) => row.draftCount > 0).length}
            </span>
            <span className="wa-stat-label">
              {t("writing:teacher.board.withDrafts")}
            </span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{summary.completed}</span>
            <span className="wa-stat-label">
              {t("writing:teacher.board.completed")}
            </span>
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
        <div
          className="wa-chip-row"
          role="group"
          aria-label={t("writing:teacher.board.sort.label")}
        >
          <button
            type="button"
            className={`wa-chip-button${sort === "attention" ? " is-active" : ""}`}
            aria-pressed={sort === "attention"}
            onClick={() => onSort("attention")}
          >
            {t("writing:teacher.board.sort.attention")}
          </button>
          <button
            type="button"
            className={`wa-chip-button${sort === "name" ? " is-active" : ""}`}
            aria-pressed={sort === "name"}
            onClick={() => onSort("name")}
          >
            {t("writing:teacher.board.sort.name")}
          </button>
        </div>
        {teacherTools && selectedProjects.size > 0 && (
          <div className="wa-chip-row">
            <button
              type="button"
              className="wa-chip-button is-active"
              disabled={bulkPending}
              onClick={openBulkPublish}
            >
              {t("writing:teacher.bulk.action", { n: selectedProjects.size })}
            </button>
            <button
              type="button"
              className="wa-chip-button"
              disabled={bulkPending}
              onClick={bulkClear}
            >
              {t("writing:teacher.bulk.clear")}
            </button>
          </div>
        )}
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
            <caption className="wa-sr-only">
              {t("writing:teacher.board.caption")}
            </caption>
            <thead>
              <tr>
                {teacherTools && (
                  <th scope="col" className="wa-cell-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectableRows.length === 0}
                      onChange={toggleSelectAll}
                      aria-label={t("writing:teacher.bulk.selectAll")}
                    />
                  </th>
                )}
                <th scope="col">
                  {t("writing:teacher.board.columns.student")}
                </th>
                <th scope="col">{t("writing:teacher.board.columns.stage")}</th>
                <th scope="col" className="wa-cell-number">
                  {t("writing:teacher.board.columns.drafts")}
                </th>
                <th scope="col" className="wa-cell-number">
                  {t("writing:teacher.board.columns.words")}
                </th>
                <th scope="col" className="wa-cell-date">
                  {t("writing:teacher.board.columns.lastEdit")}
                </th>
                <th scope="col">{t("writing:teacher.board.columns.next")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.studentId}
                  className={
                    projectId === row.projectId && row.projectId
                      ? "is-selected"
                      : undefined
                  }
                  onClick={() => row.projectId && openStudent(row.projectId)}
                  tabIndex={row.projectId ? 0 : -1}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && row.projectId)
                      openStudent(row.projectId);
                  }}
                >
                  {teacherTools && (
                    <td className="wa-cell-check">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          row.projectId && selectedProjects.has(row.projectId),
                        )}
                        disabled={!row.projectId}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onChange={() => toggleSelect(row.projectId)}
                        aria-label={t("writing:teacher.bulk.selectRow", {
                          name: row.name,
                        })}
                      />
                    </td>
                  )}
                  <td>
                    <span className="wa-student-name">{row.name}</span>
                    {row.studentIdCode && (
                      <span className="wa-student-code">
                        {row.studentIdCode}
                      </span>
                    )}
                    {row.pasteAttempts > 0 && (
                      <span
                        className="wa-paste-badge"
                        title={t("writing:teacher.paste.title", {
                          n: row.pasteAttempts,
                        })}
                      >
                        {t("writing:teacher.paste.badge", {
                          n: row.pasteAttempts,
                        })}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`wa-stage ${stageTone(row.stage)}`}>
                      <em>{t(`writing:teacher.stages.${row.stage}`)}</em>
                    </span>
                  </td>
                  <td className="wa-cell-number">{row.draftCount}</td>
                  <td className="wa-cell-number">{row.wordCount}</td>
                  <td className="wa-cell-date">
                    {formatDateTime(row.lastEditedAt, i18n.language) || "—"}
                  </td>
                  <td>
                    {t(`writing:teacher.board.next.${teacherNextStepKey(row)}`)}
                    {canReturnSubmission(row) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm wa-return-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          returnSubmission(row.projectId);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {t("writing:teacher.board.returnAction")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={teacherTools ? 7 : 6}
                    className="wa-table-empty"
                  >
                    {t("writing:teacher.board.noRows")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {teacherTools && <ClassInsightPanel />}
      {teacherTools && <WritingAiSelfTestCard />}

      {projectId && (
        <div className="wa-modal-backdrop" onClick={requestClose}>
          <div
            className="wa-modal"
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="wa-modal-head">
              <div className="wa-modal-id">
                <h2 id="wa-review-title">
                  {history?.project?.student?.name ||
                    selectedRow?.name ||
                    t("writing:teacher.board.loading")}
                </h2>
                {history && (
                  <p className="wa-sub">
                    {t("writing:teacher.board.draftsIn", {
                      n: history.drafts.length,
                    })}
                    {" · "}
                    {t(`writing:teacher.stages.${history.project.stage}`)}
                  </p>
                )}
              </div>
              <div className="wa-modal-head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={refresh}
                >
                  <HiOutlineRefresh size={16} aria-hidden="true" />
                  {t("writing:teacher.board.refresh")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={analyseStudent}
                >
                  <HiOutlineChartBar size={16} aria-hidden="true" />
                  {t("writing:teacher.analysis.open")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  ref={closeRef}
                  onClick={requestClose}
                >
                  {t("writing:teacher.board.closePanel")}
                </button>
              </div>
            </header>

            {historyLoading && (
              <div className="wa-modal-loading">
                <div className="spinner" />
              </div>
            )}

            {!historyLoading && !history && historyFailed && (
              <div className="wa-modal-loading">
                <ErrorBanner
                  message={t("writing:teacher.historyLoadFailed")}
                  onRetry={refresh}
                  retryLabel={t("writing:teacher.retry")}
                />
              </div>
            )}

            {!historyLoading && history && (
              <div className="wa-modal-body">
                <div className="wa-modal-main">
                  {history.tracker?.length > 0 && (
                    <ol
                      className="wa-tracker"
                      aria-label={t("writing:student.progressAria")}
                    >
                      {history.tracker.map((step) => (
                        <li
                          key={step.key}
                          className={`wa-tracker-step is-${step.state}`}
                        >
                          {t(`writing:student.tracker.${step.key}`)}
                        </li>
                      ))}
                    </ol>
                  )}
                  <PasteAttempts history={history} />
                  <ReviewPanel
                    history={history}
                    onChanged={refresh}
                    onDirtyChange={onDirtyChange}
                    emailDelivery={emailDelivery}
                    teacherTools={teacherTools}
                  />
                </div>

                <aside
                  className="wa-modal-side"
                  aria-label={t("writing:teacher.board.draftsPanel")}
                >
                  <h3 className="wa-modal-side-title">
                    {t("writing:teacher.board.draftsPanel")}
                  </h3>
                  {history.drafts.length === 0 && (
                    <p className="wa-hint">
                      {t("writing:teacher.board.noDraftsYet")}
                    </p>
                  )}
                  {history.drafts.map((draft) => (
                    <section className="wa-draft" key={draft._id}>
                      <header>
                        <h4>
                          {t("writing:teacher.board.draftNumber", {
                            n: draft.number,
                          })}
                        </h4>
                        <span>
                          {countLabel(t, "writing:teacher.board.wordCount", draft.totalWords || 0)}
                        </span>
                      </header>
                      <p className="wa-draft-time">
                        {formatDateTime(draft.submittedAt, i18n.language)}
                      </p>
                      {(draft.sections || []).map((section) => (
                        <div
                          className="wa-draft-section"
                          key={`${section.key}-${section.index}`}
                        >
                          <h5>{labelFor(section)}</h5>
                          <p>
                            {String(section.text || "").trim() ||
                              t("writing:teacher.board.emptySection")}
                          </p>
                        </div>
                      ))}
                    </section>
                  ))}
                </aside>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
