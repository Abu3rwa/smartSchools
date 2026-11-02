import { Fragment, useEffect, useMemo, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineSearch,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineXCircle,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  answerForQuestion,
  assignmentSummary,
  filterAssignments,
  isObjectiveCorrect,
  objectiveAnswerLabel,
  scorePercent,
  studentFullName,
  submissionRate,
} from "./resultsPresentation.js";
import { useReadingAssignmentsData } from "./hooks/useReadingAssignmentsData.js";
import FluencyReportPanel from "./FluencyReportPanel.jsx";
import "../readingTable.css";
import "./ReadingAssignmentsPage.css";

const PAGE_SIZE = 10;
const STATUS_OPTIONS = ["active", "pending", "complete", "removed", "all"];

export default function ReadingAssignmentsPage() {
  const { t, i18n } = useTranslation(["reading"]);
  const {
    assignments,
    results,
    loading,
    resultsLoading,
    academicYear,
    canRemoveAssignment,
    textFilter,
    openAssignmentId,
    openResults,
    closeResults,
    clearTextFilter,
    removeAssignment,
    updateAssignmentPublish,
    onBack,
  } = useReadingAssignmentsData();
  const [expanded, setExpanded] = useState({
    assignmentId: null,
    studentId: null,
  });
  const [removingId, setRemovingId] = useState("");
  const [publishingId, setPublishingId] = useState("");
  const [tabState, setTabState] = useState({
    assignmentId: null,
    tab: "results",
  });
  const tab =
    tabState.assignmentId === openAssignmentId ? tabState.tab : "results";
  const selectTab = (nextTab) =>
    setTabState({ assignmentId: openAssignmentId, tab: nextTab });
  const [filters, setFilters] = useState({
    search: "",
    className: "",
    status: "active",
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [studentFilterState, setStudentFilterState] = useState({
    assignmentId: null,
    value: "all",
  });
  const studentFilter =
    studentFilterState.assignmentId === openAssignmentId
      ? studentFilterState.value
      : "all";
  const updateFilters = (changes) => {
    setFilters((current) => ({ ...current, ...changes }));
    setVisibleCount(PAGE_SIZE);
  };

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.isActive !== false),
    [assignments],
  );
  const summary = useMemo(
    () => assignmentSummary(activeAssignments),
    [activeAssignments],
  );
  const classNames = useMemo(
    () =>
      [
        ...new Set(
          assignments
            .map((assignment) => assignment.class?.name)
            .filter(Boolean),
        ),
      ].sort(),
    [assignments],
  );
  const filteredAssignments = useMemo(
    () => filterAssignments(assignments, filters),
    [assignments, filters],
  );
  const shownAssignments = filteredAssignments.slice(0, visibleCount);

  useEffect(() => {
    if (!openAssignmentId) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeResults();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAssignmentId, closeResults]);
  const expandedStudent =
    expanded.assignmentId === openAssignmentId ? expanded.studentId : null;

  const handleRemove = async (assignment) => {
    const title = assignment.text?.title || "—";
    if (!window.confirm(t("reading:assignments.removeConfirm", { title })))
      return;
    setRemovingId(assignment._id);
    const removed = await removeAssignment(assignment._id);
    setRemovingId("");
    if (removed) toast.success(t("reading:assignments.removeSuccess"));
  };

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString(i18n.language, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : t("reading:assignments.noDueDate");

  const formatTime = (value) =>
    new Date(value).toLocaleTimeString(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDateTime = (value) =>
    new Date(value).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const publishStateOf = (assignment) => {
    if (assignment.isPublished === false) return "unpublished";
    if (assignment.publishAt && new Date(assignment.publishAt) > new Date()) {
      return "scheduled";
    }
    return "published";
  };

  const handlePublish = async (assignment, publish) => {
    if (!publish) {
      const title = assignment.text?.title || "—";
      if (!window.confirm(t("reading:assignments.publish.unpublishConfirm", { title }))) {
        return;
      }
    }
    setPublishingId(assignment._id);
    const result = await updateAssignmentPublish(assignment._id, {
      isPublished: publish,
      publishAt: null,
    });
    setPublishingId("");
    if (result.ok) {
      toast.success(t(publish
        ? "reading:assignments.publish.publishSuccess"
        : "reading:assignments.publish.unpublishSuccess"));
    } else {
      toast.error(result.message || t("reading:assignments.publish.publishFailed"));
    }
  };

  const toggleStudent = (studentId) =>
    setExpanded((current) =>
      current.assignmentId === openAssignmentId &&
      current.studentId === studentId
        ? { assignmentId: null, studentId: null }
        : { assignmentId: openAssignmentId, studentId },
    );

  const isOpen = results?.assignment?._id === openAssignmentId;
  const fluencyEnabled = Boolean(
    isOpen && results?.assignment?.fluency?.enabled,
  );
  const questions = isOpen
    ? results.assignment.text.comprehensionQuestions || []
    : [];
  const thinkingQuestions = isOpen
    ? results.assignment.text.criticalThinkingQuestions || []
    : [];
  const readingGateEnabled = Boolean(
    isOpen && results?.assignment?.readingGate?.enabled,
  );

  return (
    <div className="reading-assignments-page">
      <div className="page-header-row">
        <button
          type="button"
          className="btn btn-ghost back-btn"
          onClick={onBack}
        >
          <HiOutlineArrowLeft size={18} />
          {t("reading:common.back")}
        </button>
        <div className="page-header">
          <h1>{t("reading:assignments.title")}</h1>
          <p className="text-muted">
            {t("reading:assignments.subtitle")}
            {academicYear
              ? ` ${t("reading:texts.academicYear", { year: academicYear })}`
              : ""}
          </p>
        </div>
      </div>

      {textFilter && (
        <div className="reading-filter-notice">
          <span>
            {isOpen && results
              ? results.assignment.text.title
              : t("reading:assignments.filteredToReading")}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearTextFilter}
          >
            {t("reading:assignments.showAllReadings")}
          </button>
        </div>
      )}

      <div className="reading-summary-strip">
        <div>
          <span className="strip-value">{summary.total}</span>
          <span className="strip-label">
            {t("reading:assignments.statsAssignments")}
          </span>
        </div>
        <div>
          <span className="strip-value">{summary.students}</span>
          <span className="strip-label">
            {t("reading:assignments.statsStudents")}
          </span>
        </div>
        <div>
          <span className="strip-value">{summary.submitted}</span>
          <span className="strip-label">
            {t("reading:assignments.statsSubmitted")}
          </span>
        </div>
      </div>

      {assignments.length > 0 && (
        <div className="reading-assignments-toolbar">
          <label className="reading-search">
            <HiOutlineSearch size={16} aria-hidden="true" />
            <span className="reading-sr-only">
              {t("reading:assignments.searchLabel")}
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) =>
                updateFilters({ search: event.target.value })
              }
              placeholder={t("reading:assignments.searchPlaceholder")}
            />
          </label>
          {classNames.length > 1 && (
            <select
              className="reading-toolbar-select"
              aria-label={t("reading:assignments.classFilterLabel")}
              value={filters.className}
              onChange={(event) =>
                updateFilters({ className: event.target.value })
              }
            >
              <option value="">{t("reading:assignments.allClasses")}</option>
              {classNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <div
            className="reading-chip-group"
            role="group"
            aria-label={t("reading:assignments.statusFilterLabel")}
          >
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={`reading-chip${filters.status === status ? " is-active" : ""}`}
                aria-pressed={filters.status === status}
                onClick={() => updateFilters({ status })}
              >
                {t(
                  `reading:assignments.status${status[0].toUpperCase()}${status.slice(1)}`,
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && assignments.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineClock size={44} className="empty-icon" />
          <h3>{t("reading:assignments.emptyTitle")}</h3>
          <p>{t("reading:assignments.emptySubtitle")}</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineSearch size={40} className="empty-icon" />
          <h3>{t("reading:assignments.noMatchesTitle")}</h3>
          <p>{t("reading:assignments.noMatchesSubtitle")}</p>
        </div>
      ) : (
        <div className="reading-table-card">
          <div className="reading-table-wrap">
            <table className="reading-table results-table">
              <caption className="reading-sr-only">
                {t("reading:assignments.caption")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {t("reading:assignments.columns.reading")}
                  </th>
                  <th scope="col">{t("reading:assignments.columns.class")}</th>
                  <th scope="col" className="reading-cell-number">
                    {t("reading:assignments.columns.submitted")}
                  </th>
                  <th scope="col" className="reading-col-optional">
                    {t("reading:assignments.columns.average")}
                  </th>
                  <th scope="col" className="reading-col-optional">
                    {t("reading:assignments.columns.due")}
                  </th>
                  <th scope="col" className="reading-cell-actions">
                    <span className="reading-th-label">
                      {t("reading:assignments.columns.actions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownAssignments.map((assignment) => {
                  const rate = submissionRate(assignment);
                  const isRowOpen = openAssignmentId === assignment._id;
                  const publishState = publishStateOf(assignment);
                  return (
                    <tr
                      key={assignment._id}
                      className={`is-clickable${isRowOpen ? " is-selected" : ""}`}
                      onClick={(event) => {
                        if (!isRowOpen && !event.target.closest("button"))
                          openResults(assignment._id);
                      }}
                    >
                      <td>
                        <div className="reading-title-cell">
                          <span className="reading-title">
                            {assignment.text?.title || "—"}
                          </span>
                          {assignment.isActive === false && (
                            <span className="reading-tags">
                              <em className="is-removed">
                                {t("reading:assignments.removed")}
                              </em>
                            </span>
                          )}
                          {assignment.isActive !== false && (
                            <span className="reading-tags">
                              <em className={`is-${publishState}`}>
                                {publishState === "scheduled"
                                  ? t("reading:assignments.publish.scheduledFor", {
                                      date: formatDateTime(assignment.publishAt),
                                    })
                                  : t(`reading:assignments.publish.${publishState}`)}
                              </em>
                            </span>
                          )}
                          {assignment.instructions && (
                            <span className="reading-tags">
                              <em>
                                {t("reading:assignments.hasInstructions")}
                              </em>
                            </span>
                          )}
                          {assignment.readingGate?.enabled && (
                            <span className="reading-tags">
                              <em>{t("reading:assignments.gateOn")}</em>
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {assignment.class?.name ||
                          t("reading:assignments.multipleClasses")}
                      </td>
                      <td className="reading-cell-number">
                        <span
                          className={`reading-count${assignment.completedCount ? "" : " is-empty"}`}
                        >
                          {assignment.completedCount || 0}
                        </span>
                        <span className="reading-sub">
                          {t("reading:assignments.ofTotal", {
                            done: assignment.completedCount || 0,
                            total: assignment.studentCount || 0,
                          })}
                        </span>
                        {rate !== null && (
                          <span className="results-track" aria-hidden="true">
                            <span
                              className="results-fill"
                              style={{ width: `${rate}%` }}
                            />
                          </span>
                        )}
                      </td>
                      <td className="reading-col-optional">
                        {assignment.averagePercent === null ? (
                          <span className="reading-dash">—</span>
                        ) : (
                          <span className="reading-pill is-soft">
                            {assignment.averagePercent}%
                          </span>
                        )}
                      </td>
                      <td className="reading-col-optional reading-cell-date">
                        {formatDate(assignment.dueDate)}
                      </td>
                      <td className="reading-cell-actions">
                        <div className="reading-row-actions">
                          {assignment.isActive !== false &&
                            canRemoveAssignment(assignment) && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm reading-publish-btn"
                                disabled={publishingId === assignment._id}
                                onClick={() => handlePublish(assignment, publishState === "unpublished")}
                                aria-label={t(
                                  publishState === "unpublished"
                                    ? "reading:assignments.publish.publishAria"
                                    : "reading:assignments.publish.unpublishAria",
                                  { title: assignment.text?.title || "" },
                                )}
                              >
                                {publishState === "unpublished" ? (
                                  <HiOutlineEye size={16} aria-hidden="true" />
                                ) : (
                                  <HiOutlineEyeOff size={16} aria-hidden="true" />
                                )}
                                {publishState === "unpublished"
                                  ? t("reading:assignments.publish.publish")
                                  : t("reading:assignments.publish.unpublish")}
                              </button>
                            )}
                          {assignment.isActive !== false &&
                            canRemoveAssignment(assignment) && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm reading-remove-btn"
                                disabled={removingId === assignment._id}
                                onClick={() => handleRemove(assignment)}
                                aria-label={t(
                                  "reading:assignments.removeAssignmentAria",
                                  {
                                    title: assignment.text?.title || "",
                                  },
                                )}
                              >
                                <HiOutlineTrash size={16} aria-hidden="true" />
                                {t("reading:assignments.removeAssignment")}
                              </button>
                            )}
                          <button
                            type="button"
                            className={`btn btn-sm ${isRowOpen || assignment.isActive === false ? "btn-secondary" : "btn-primary"}`}
                            onClick={() =>
                              isRowOpen
                                ? closeResults()
                                : openResults(assignment._id)
                            }
                            aria-expanded={isRowOpen}
                          >
                            {t("reading:assignments.viewResults")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredAssignments.length > shownAssignments.length && (
            <div className="reading-show-more">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                {t("reading:assignments.showMore", {
                  count: filteredAssignments.length - shownAssignments.length,
                })}
              </button>
            </div>
          )}
        </div>
      )}

      {openAssignmentId && (
        <>
          <div
            className="results-backdrop"
            onClick={closeResults}
            aria-hidden="true"
          />
          <aside
            className="results-panel results-drawer"
            aria-live="polite"
            aria-label={t("reading:assignments.title")}
          >
            {resultsLoading || !isOpen ? (
              <div className="loading-container">
                <div className="spinner" />
              </div>
            ) : (
              <>
                <div className="results-panel-header">
                  <div>
                    <h2>{results.assignment.text.title}</h2>
                    <p className="text-muted">
                      {results.assignment.className ||
                        t("reading:assignments.multipleClasses")}
                      {" · "}
                      {t("reading:assignments.submittedOf", {
                        done: results.totals.completed,
                        total: results.totals.assigned,
                      })}
                      {results.totals.averagePercent !== null && (
                        <>
                          {" · "}
                          {t("reading:assignments.average", {
                            percent: results.totals.averagePercent,
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm results-close"
                    onClick={closeResults}
                    aria-label={t("reading:assignments.closePanel")}
                  >
                    <HiOutlineX size={18} aria-hidden="true" />
                  </button>
                </div>

                <div
                  className="results-tabs"
                  role="tablist"
                  aria-label={t("reading:assignments.tabs.label")}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "results"}
                    className={`results-tab${tab === "results" ? " is-active" : ""}`}
                    onClick={() => selectTab("results")}
                  >
                    {t("reading:assignments.tabs.results")}
                  </button>
                  {fluencyEnabled && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "fluency"}
                      className={`results-tab${tab === "fluency" ? " is-active" : ""}`}
                      onClick={() => selectTab("fluency")}
                    >
                      {t("reading:assignments.tabs.fluency")}
                    </button>
                  )}
                </div>

                {tab === "fluency" && fluencyEnabled ? (
                  <FluencyReportPanel
                    key={openAssignmentId}
                    assignmentId={openAssignmentId}
                  />
                ) : (
                  <>
                    {results.assignment.instructions && (
                      <p className="results-instructions">
                        {results.assignment.instructions}
                      </p>
                    )}

                    {results.assignment.isActive === false && (
                      <p className="results-removed-note">
                        {t("reading:assignments.removedNotice")}
                      </p>
                    )}

                    {results.totals.assigned === 0 ? (
                      <p className="reading-dash results-empty-note">
                        {t("reading:assignments.noRoster")}
                      </p>
                    ) : (
                      <>
                        <div
                          className="reading-chip-group results-student-filter"
                          role="group"
                          aria-label={t(
                            "reading:assignments.studentFilterLabel",
                          )}
                        >
                          {[
                            [
                              "all",
                              results.students.length,
                              "studentFilterAll",
                            ],
                            [
                              "submitted",
                              results.students.filter((s) => s.completed)
                                .length,
                              "studentFilterSubmitted",
                            ],
                            [
                              "pending",
                              results.students.filter((s) => !s.completed)
                                .length,
                              "studentFilterPending",
                            ],
                          ].map(([value, count, key]) => (
                            <button
                              key={value}
                              type="button"
                              className={`reading-chip${studentFilter === value ? " is-active" : ""}`}
                              aria-pressed={studentFilter === value}
                              onClick={() =>
                                setStudentFilterState({
                                  assignmentId: openAssignmentId,
                                  value,
                                })
                              }
                            >
                              {t(`reading:assignments.${key}`, { count })}
                            </button>
                          ))}
                        </div>
                        <div className="reading-table-card">
                          <div className="reading-table-wrap">
                            <table className="reading-table results-table">
                              <thead>
                                <tr>
                                  <th scope="col">
                                    {t("reading:assignments.columns.student")}
                                  </th>
                                  <th
                                    scope="col"
                                    className="reading-cell-number"
                                  >
                                    {t("reading:assignments.columns.score")}
                                  </th>
                                  <th scope="col">
                                    {t("reading:assignments.columns.status")}
                                  </th>
                                  <th
                                    scope="col"
                                    className="reading-cell-actions"
                                  >
                                    <span className="reading-th-label">
                                      {t("reading:assignments.columns.answers")}
                                    </span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.students
                                  .filter(
                                    (student) =>
                                      studentFilter === "all" ||
                                      (studentFilter === "submitted") ===
                                        Boolean(student.completed),
                                  )
                                  .map((student) => {
                                    const percent = scorePercent(
                                      student.completed,
                                    );
                                    const expanded =
                                      expandedStudent === String(student._id);
                                    return (
                                      <Fragment key={student._id}>
                                        <tr>
                                          <td>
                                            <div className="reading-title-cell">
                                              <span className="reading-title">
                                                {studentFullName(student)}
                                              </span>
                                              {!student.assigned && (
                                                <span className="reading-tags">
                                                  <em>
                                                    {t(
                                                      "reading:assignments.noLongerAssigned",
                                                    )}
                                                  </em>
                                                </span>
                                              )}
                                              {readingGateEnabled
                                                && student.readingGate
                                                  ?.readFinishedAt && (
                                                  <span className="reading-sub">
                                                    {t(
                                                      "reading:assignments.finishedReadingAt",
                                                      {
                                                        time: formatTime(
                                                          student.readingGate
                                                            .readFinishedAt,
                                                        ),
                                                      },
                                                    )}
                                                  </span>
                                                )}
                                            </div>
                                          </td>
                                          <td className="reading-cell-number">
                                            {percent === null ? (
                                              <span className="reading-dash">
                                                —
                                              </span>
                                            ) : (
                                              <span
                                                className={`reading-pill ${percent >= 70 ? "is-soft" : "is-warning"}`}
                                              >
                                                {t(
                                                  "reading:assignments.scoreCell",
                                                  {
                                                    correct:
                                                      student.completed
                                                        .correctCount,
                                                    total:
                                                      student.completed
                                                        .totalCount,
                                                  },
                                                )}
                                              </span>
                                            )}
                                          </td>
                                          <td>
                                            <span
                                              className={`reading-badge ${student.completed ? "is-shared" : "is-private"}`}
                                            >
                                              {student.completed
                                                ? formatDate(
                                                    student.completed
                                                      .completedAt,
                                                  )
                                                : t(
                                                    "reading:assignments.notSubmitted",
                                                  )}
                                            </span>
                                          </td>
                                          <td className="reading-cell-actions">
                                            {student.completed ? (
                                              <button
                                                type="button"
                                                className="reading-kebab"
                                                aria-expanded={expanded}
                                                aria-label={t(
                                                  "reading:assignments.toggleAnswers",
                                                  {
                                                    name: studentFullName(
                                                      student,
                                                    ),
                                                  },
                                                )}
                                                onClick={() =>
                                                  toggleStudent(
                                                    String(student._id),
                                                  )
                                                }
                                              >
                                                {expanded ? (
                                                  <HiOutlineChevronUp
                                                    size={18}
                                                  />
                                                ) : (
                                                  <HiOutlineChevronDown
                                                    size={18}
                                                  />
                                                )}
                                              </button>
                                            ) : (
                                              <span className="reading-dash">
                                                —
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                        {expanded && (
                                          <tr
                                            key={`${student._id}-detail`}
                                            className="results-detail-row"
                                          >
                                            <td colSpan={4}>
                                              <ul className="results-answers">
                                                {questions.map((question) => {
                                                  const answer =
                                                    answerForQuestion(
                                                      student.completed
                                                        .responses,
                                                      question._id,
                                                    );
                                                  const label =
                                                    objectiveAnswerLabel(
                                                      question,
                                                      answer,
                                                    );
                                                  const correct =
                                                    isObjectiveCorrect(
                                                      question,
                                                      answer,
                                                    );
                                                  return (
                                                    <li
                                                      key={question._id}
                                                      className={`result-answer${correct ? " is-correct" : " is-wrong"}`}
                                                    >
                                                      <span className="answer-mark">
                                                        {correct ? (
                                                          <HiOutlineCheckCircle
                                                            size={17}
                                                            aria-hidden="true"
                                                          />
                                                        ) : (
                                                          <HiOutlineXCircle
                                                            size={17}
                                                            aria-hidden="true"
                                                          />
                                                        )}
                                                      </span>
                                                      <span className="answer-body">
                                                        <span className="answer-question">
                                                          {question.question}
                                                        </span>
                                                        <span className="answer-line">
                                                          {t(
                                                            "reading:assignments.studentAnswer",
                                                            {
                                                              answer:
                                                                label ??
                                                                t(
                                                                  "reading:assignments.skipped",
                                                                ),
                                                            },
                                                          )}
                                                        </span>
                                                        {!correct && (
                                                          <span className="answer-line is-key">
                                                            {t(
                                                              "reading:assignments.correctAnswer",
                                                              {
                                                                answer:
                                                                  question
                                                                    .options?.[
                                                                    question
                                                                      .correctIndex
                                                                  ] ?? "—",
                                                              },
                                                            )}
                                                          </span>
                                                        )}
                                                      </span>
                                                    </li>
                                                  );
                                                })}
                                                {thinkingQuestions.map(
                                                  (question) => {
                                                    const answer =
                                                      answerForQuestion(
                                                        student.completed
                                                          .responses,
                                                        question._id,
                                                      );
                                                    return (
                                                      <li
                                                        key={question._id}
                                                        className="result-answer is-open"
                                                      >
                                                        <span
                                                          className="answer-mark"
                                                          aria-hidden="true"
                                                        >
                                                          ✎
                                                        </span>
                                                        <span className="answer-body">
                                                          <span className="answer-question">
                                                            {question.question}
                                                          </span>
                                                          <span className="answer-line answer-text">
                                                            {String(
                                                              answer ?? "",
                                                            ).trim() ||
                                                              t(
                                                                "reading:assignments.skipped",
                                                              )}
                                                          </span>
                                                        </span>
                                                      </li>
                                                    );
                                                  },
                                                )}
                                                {questions.length === 0 &&
                                                  thinkingQuestions.length ===
                                                    0 && (
                                                    <li className="answer-line">
                                                      {t(
                                                        "reading:assignments.noQuestionsForReading",
                                                      )}
                                                    </li>
                                                  )}
                                              </ul>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
