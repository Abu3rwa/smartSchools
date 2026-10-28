import { HiOutlinePencilAlt, HiOutlinePlus, HiOutlineSearch } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import TablePagination from "../../../../components/common/TablePagination.jsx";
import { stageTone } from "../../../../utils/writingWorkflow.js";
import { useWritingAssignmentsData } from "./hooks/useWritingAssignmentsData.js";
import CreditChip from "../components/CreditChip.jsx";
import "../writingShared.css";

const BAR_STAGES = [
  "not_started",
  "drafting",
  "submitted",
  "feedback_ready",
  "feedback_published",
  "revising",
  "compared",
  "ready_for_notebook",
  "awaiting_notebook_check",
  "completed",
];

export default function WritingAssignmentsPage() {
  const { t, i18n } = useTranslation(["writing"]);
  const {
    assignments,
    classes,
    classId,
    credit,
    loading,
    failed,
    searchInput,
    totals,
    page,
    pageSize,
    totalItems,
    totalPages,
    classNameFor,
    onSearch,
    onClass,
    onPage,
    onPageSize,
    retry,
    openAssignment,
    editAssignment,
    newAssignment,
  } = useWritingAssignmentsData();

  const formatDate = (value) => new Date(value).toLocaleDateString(i18n.language, {
    day: "2-digit", month: "short", year: "numeric",
  });
  const filtered = Boolean(classId || searchInput.trim());
  const stats = [
    { key: "assignments", value: totals.assignments },
    { key: "students", value: totals.students },
    { key: "drafts", value: totals.drafts },
    { key: "waiting", value: totals.waiting },
    { key: "revising", value: totals.revising },
    { key: "done", value: totals.done },
  ];

  return (
    <div className="wa-page wa-list-page">
      <header className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("writing:teacher.eyebrow")}</p>
          <h1>{t("writing:teacher.listTitle")}</h1>
          <p className="wa-sub">{t("writing:teacher.listSubtitle")}</p>
        </div>
        <div className="wa-head-actions">
          <CreditChip credit={credit} />
          <button type="button" className="btn btn-primary btn-sm" onClick={newAssignment}>
            <HiOutlinePlus size={16} aria-hidden="true" />
            {t("writing:teacher.newAssignment")}
          </button>
        </div>
      </header>

      <div className="wa-stats">
        {stats.map((stat) => (
          <div className="wa-stat" key={stat.key}>
            <span className="wa-stat-value">{loading || failed ? "—" : stat.value}</span>
            <span className="wa-stat-label">{t(`writing:teacher.stats.${stat.key}`)}</span>
          </div>
        ))}
      </div>

      <div className="wa-toolbar">
        <label className="wa-field">
          <span>{t("writing:teacher.filterClass")}</span>
          <select value={classId} onChange={(event) => onClass(event.target.value)}>
            <option value="">{t("writing:teacher.allClasses")}</option>
            {classes.map((item) => (
              <option key={item._id || item.id} value={item._id || item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="wa-search">
          <HiOutlineSearch size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t("writing:teacher.searchPlaceholder")}
            aria-label={t("writing:teacher.searchPlaceholder")}
          />
        </div>
      </div>

      <div className="wa-table-card wa-task-table-wrap" aria-busy={loading}>
        <table className="wa-table wa-task-table">
          <caption className="wa-sr-only">{t("writing:teacher.listTitle")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("writing:teacher.taskColumns.task")}</th>
              <th scope="col">{t("writing:teacher.taskColumns.classDue")}</th>
              <th scope="col" className="wa-cell-number">{t("writing:teacher.stats.students")}</th>
              <th scope="col" className="wa-cell-number">{t("writing:teacher.stats.drafts")}</th>
              <th scope="col">{t("writing:teacher.taskColumns.progress")}</th>
              <th scope="col">{t("writing:teacher.taskColumns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>
                  <div className="wa-task-table-message" role="status">
                    <div className="spinner" />
                    {t("writing:teacher.loading")}
                  </div>
                </td>
              </tr>
            )}
            {!loading && failed && (
              <tr>
                <td colSpan={6}>
                  <div className="wa-task-table-message" role="status">
                    <p>{t("writing:teacher.loadFailed")}</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
                      {t("writing:teacher.retry")}
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !failed && assignments.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="wa-task-table-message" role="status">
                    <strong>{t(filtered ? "writing:teacher.noMatches" : "writing:teacher.emptyTitle")}</strong>
                    <p>{t(filtered ? "writing:teacher.noMatchesHelp" : "writing:teacher.emptyBody")}</p>
                    {!filtered && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={newAssignment}>
                        {t("writing:teacher.newAssignment")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {assignments.map((assignment) => {
              const counts = assignment.stageCounts || {};
              const stages = BAR_STAGES.filter((stage) => counts[stage] > 0);
              return (
                <tr key={assignment._id}>
                  <td className="wa-task-title-cell">
                    <button type="button" className="wa-task-title" onClick={() => openAssignment(assignment._id)}>
                      {assignment.title}
                    </button>
                    <span className="wa-task-meta">
                      {t(`writing:teacher.types.${assignment.writingType}`)}
                      {" · "}
                      {t("writing:teacher.sectionCount", { n: (assignment.sections || []).length })}
                      {" · "}
                      {t("writing:teacher.totalPoints", { n: assignment.totalPoints || 0 })}
                    </span>
                  </td>
                  <td className="wa-task-class-cell">
                    <span>{classNameFor(assignment) || t("writing:teacher.selectedStudents")}</span>
                    <span className="wa-task-meta">
                      {assignment.dueDate
                        ? `${t("writing:teacher.due")} ${formatDate(assignment.dueDate)}`
                        : t("writing:teacher.noDue")}
                    </span>
                  </td>
                  <td className="wa-cell-number">{assignment.audienceSize || 0}</td>
                  <td className="wa-cell-number">{assignment.draftCount || 0}</td>
                  <td className="wa-task-progress-cell">
                    <div className="wa-stages">
                      {stages.length === 0 && <span className="wa-bar-empty">{t("writing:teacher.nobodyStarted")}</span>}
                      {stages.map((stage) => (
                        <span className={`wa-stage ${stageTone(stage)}`} key={stage}>
                          <b>{counts[stage]}</b>
                          <em>{t(`writing:teacher.stages.${stage}`)}</em>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="wa-task-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openAssignment(assignment._id)}>
                        {t("writing:teacher.open")}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => editAssignment(assignment._id)}>
                        <HiOutlinePencilAlt size={14} aria-hidden="true" />
                        {t("writing:teacher.edit")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && !failed && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={onPage}
          onPageSizeChange={onPageSize}
        />
      )}
    </div>
  );
}
