import { Fragment, useMemo, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import {
  answerForQuestion,
  assignmentSummary,
  isObjectiveCorrect,
  objectiveAnswerLabel,
  scorePercent,
  studentFullName,
  submissionRate,
} from "./resultsPresentation.js";
import { useReadingAssignmentsData } from "./hooks/useReadingAssignmentsData.js";
import "../readingTable.css";
import "./ReadingAssignmentsPage.css";

export default function ReadingAssignmentsPage() {
  const { t, i18n } = useTranslation(["reading"]);
  const {
    assignments,
    results,
    loading,
    resultsLoading,
    academicYear,
    textFilter,
    openAssignmentId,
    openResults,
    closeResults,
    clearTextFilter,
    onBack,
  } = useReadingAssignmentsData();
  const [expanded, setExpanded] = useState({ assignmentId: null, studentId: null });

  const summary = useMemo(() => assignmentSummary(assignments), [assignments]);
  const expandedStudent = expanded.assignmentId === openAssignmentId ? expanded.studentId : null;

  const formatDate = (value) => (value
    ? new Date(value).toLocaleDateString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : t("reading:assignments.noDueDate"));

  const toggleStudent = (studentId) => setExpanded((current) => (
    current.assignmentId === openAssignmentId && current.studentId === studentId
      ? { assignmentId: null, studentId: null }
      : { assignmentId: openAssignmentId, studentId }
  ));

  const isOpen = results?.assignment?._id === openAssignmentId;
  const questions = isOpen ? (results.assignment.text.comprehensionQuestions || []) : [];
  const thinkingQuestions = isOpen
    ? (results.assignment.text.criticalThinkingQuestions || [])
    : [];

  return (
    <div className="reading-assignments-page">
      <div className="page-header-row">
        <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
          <HiOutlineArrowLeft size={18} />
          {t("reading:common.back")}
        </button>
        <div className="page-header">
          <h1>{t("reading:assignments.title")}</h1>
          <p className="text-muted">
            {t("reading:assignments.subtitle")}
            {academicYear ? ` ${t("reading:texts.academicYear", { year: academicYear })}` : ""}
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearTextFilter}>
            {t("reading:assignments.showAllReadings")}
          </button>
        </div>
      )}

      <div className="reading-summary-strip">
        <div>
          <span className="strip-value">{summary.total}</span>
          <span className="strip-label">{t("reading:assignments.statsAssignments")}</span>
        </div>
        <div>
          <span className="strip-value">{summary.students}</span>
          <span className="strip-label">{t("reading:assignments.statsStudents")}</span>
        </div>
        <div>
          <span className="strip-value">{summary.submitted}</span>
          <span className="strip-label">{t("reading:assignments.statsSubmitted")}</span>
        </div>
      </div>

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
      ) : (
        <div className="reading-table-card">
          <div className="reading-table-wrap">
            <table className="reading-table results-table">
              <caption className="reading-sr-only">{t("reading:assignments.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("reading:assignments.columns.reading")}</th>
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
                    <span className="reading-th-label">{t("reading:assignments.columns.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const rate = submissionRate(assignment);
                  const isRowOpen = openAssignmentId === assignment._id;
                  return (
                    <tr key={assignment._id} className={isRowOpen ? "is-selected" : undefined}>
                      <td>
                        <div className="reading-title-cell">
                          <span className="reading-title">{assignment.text?.title || "—"}</span>
                          {assignment.instructions && (
                            <span className="reading-tags">
                              <em>{t("reading:assignments.hasInstructions")}</em>
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{assignment.class?.name || t("reading:assignments.multipleClasses")}</td>
                      <td className="reading-cell-number">
                        <span className={`reading-count${assignment.completedCount ? "" : " is-empty"}`}>
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
                            <span className="results-fill" style={{ width: `${rate}%` }} />
                          </span>
                        )}
                      </td>
                      <td className="reading-col-optional">
                        {assignment.averagePercent === null
                          ? <span className="reading-dash">—</span>
                          : <span className="reading-pill is-soft">{assignment.averagePercent}%</span>}
                      </td>
                      <td className="reading-col-optional reading-cell-date">
                        {formatDate(assignment.dueDate)}
                      </td>
                      <td className="reading-cell-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${isRowOpen ? "btn-secondary" : "btn-primary"}`}
                          onClick={() => (isRowOpen ? closeResults() : openResults(assignment._id))}
                          aria-expanded={isRowOpen}
                        >
                          {isRowOpen ? t("reading:assignments.hideResults") : t("reading:assignments.viewResults")}
                          {isRowOpen
                            ? <HiOutlineChevronUp size={16} aria-hidden="true" />
                            : <HiOutlineChevronDown size={16} aria-hidden="true" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openAssignmentId && (
        <section className="results-panel" aria-live="polite">
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
                    {results.assignment.className || t("reading:assignments.multipleClasses")}
                    {" · "}
                    {t("reading:assignments.submittedOf", {
                      done: results.totals.completed,
                      total: results.totals.assigned,
                    })}
                    {results.totals.averagePercent !== null && (
                      <>
                        {" · "}
                        {t("reading:assignments.average", { percent: results.totals.averagePercent })}
                      </>
                    )}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeResults}>
                  {t("reading:assignments.hideResults")}
                </button>
              </div>

              {results.assignment.instructions && (
                <p className="results-instructions">{results.assignment.instructions}</p>
              )}

              {results.totals.assigned === 0 ? (
                <p className="reading-dash results-empty-note">{t("reading:assignments.noRoster")}</p>
              ) : (
                <div className="reading-table-card">
                  <div className="reading-table-wrap">
                    <table className="reading-table results-table">
                      <thead>
                        <tr>
                          <th scope="col">{t("reading:assignments.columns.student")}</th>
                          <th scope="col" className="reading-cell-number">
                            {t("reading:assignments.columns.score")}
                          </th>
                          <th scope="col">{t("reading:assignments.columns.status")}</th>
                          <th scope="col" className="reading-cell-actions">
                            <span className="reading-th-label">{t("reading:assignments.columns.answers")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.students.map((student) => {
                          const percent = scorePercent(student.completed);
                          const expanded = expandedStudent === String(student._id);
                          return (
                            <Fragment key={student._id}>
                              <tr>
                                <td>
                                  <div className="reading-title-cell">
                                    <span className="reading-title">{studentFullName(student)}</span>
                                    {!student.assigned && (
                                      <span className="reading-tags">
                                        <em>{t("reading:assignments.noLongerAssigned")}</em>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="reading-cell-number">
                                  {percent === null ? (
                                    <span className="reading-dash">—</span>
                                  ) : (
                                    <span className={`reading-pill ${percent >= 70 ? "is-soft" : "is-warning"}`}>
                                      {t("reading:assignments.scoreCell", {
                                        correct: student.completed.correctCount,
                                        total: student.completed.totalCount,
                                      })}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className={`reading-badge ${student.completed ? "is-shared" : "is-private"}`}>
                                    {student.completed
                                      ? formatDate(student.completed.completedAt)
                                      : t("reading:assignments.notSubmitted")}
                                  </span>
                                </td>
                                <td className="reading-cell-actions">
                                  {student.completed ? (
                                    <button
                                      type="button"
                                      className="reading-kebab"
                                      aria-expanded={expanded}
                                      aria-label={t("reading:assignments.toggleAnswers", {
                                        name: studentFullName(student),
                                      })}
                                      onClick={() => toggleStudent(String(student._id))}
                                    >
                                      {expanded
                                        ? <HiOutlineChevronUp size={18} />
                                        : <HiOutlineChevronDown size={18} />}
                                    </button>
                                  ) : <span className="reading-dash">—</span>}
                                </td>
                              </tr>
                              {expanded && (
                                <tr key={`${student._id}-detail`} className="results-detail-row">
                                  <td colSpan={4}>
                                    <ul className="results-answers">
                                      {questions.map((question) => {
                                        const answer = answerForQuestion(
                                          student.completed.responses,
                                          question._id,
                                        );
                                        const label = objectiveAnswerLabel(question, answer);
                                        const correct = isObjectiveCorrect(question, answer);
                                        return (
                                          <li key={question._id} className={`result-answer${correct ? " is-correct" : " is-wrong"}`}>
                                            <span className="answer-mark">
                                              {correct
                                                ? <HiOutlineCheckCircle size={17} aria-hidden="true" />
                                                : <HiOutlineXCircle size={17} aria-hidden="true" />}
                                            </span>
                                            <span className="answer-body">
                                              <span className="answer-question">{question.question}</span>
                                              <span className="answer-line">
                                                {t("reading:assignments.studentAnswer", {
                                                  answer: label ?? t("reading:assignments.skipped"),
                                                })}
                                              </span>
                                              {!correct && (
                                                <span className="answer-line is-key">
                                                  {t("reading:assignments.correctAnswer", {
                                                    answer: question.options?.[question.correctIndex] ?? "—",
                                                  })}
                                                </span>
                                              )}
                                            </span>
                                          </li>
                                        );
                                      })}
                                      {thinkingQuestions.map((question) => {
                                        const answer = answerForQuestion(
                                          student.completed.responses,
                                          question._id,
                                        );
                                        return (
                                          <li key={question._id} className="result-answer is-open">
                                            <span className="answer-mark" aria-hidden="true">✎</span>
                                            <span className="answer-body">
                                              <span className="answer-question">{question.question}</span>
                                              <span className="answer-line answer-text">
                                                {String(answer ?? "").trim() || t("reading:assignments.skipped")}
                                              </span>
                                            </span>
                                          </li>
                                        );
                                      })}
                                      {questions.length === 0 && thinkingQuestions.length === 0 && (
                                        <li className="answer-line">
                                          {t("reading:assignments.noQuestionsForReading")}
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
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
