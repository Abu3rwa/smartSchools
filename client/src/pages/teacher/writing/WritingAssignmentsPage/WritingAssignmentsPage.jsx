import { HiOutlineDocumentText, HiOutlinePencilAlt, HiOutlinePlus, HiOutlineSearch } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { stageTone } from "../../../../utils/writingWorkflow.js";
import { useWritingAssignmentsData } from "./hooks/useWritingAssignmentsData.js";
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
    loading,
    searchInput,
    totals,
    classNameFor,
    onSearch,
    onClass,
    openAssignment,
    editAssignment,
    newAssignment,
  } = useWritingAssignmentsData();

  const formatDate = (value) => (value
    ? new Date(value).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" })
    : "");

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
      <div className="wa-head">
        <div>
          <p className="wa-eyebrow">{t("writing:teacher.eyebrow")}</p>
          <h1>{t("writing:teacher.listTitle")}</h1>
          <p className="wa-sub">{t("writing:teacher.listSubtitle")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={newAssignment}>
          <HiOutlinePlus size={18} aria-hidden="true" />
          {t("writing:teacher.newAssignment")}
        </button>
      </div>

      <div className="wa-stats">
        {stats.map((stat) => (
          <div className="wa-stat" key={stat.key}>
            <span className="wa-stat-value">{stat.value}</span>
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

      {loading && assignments.length === 0 && (
        <div className="wa-loading" aria-live="polite">
          <div className="spinner" />
        </div>
      )}

      {!loading && assignments.length === 0 && (
        <div className="wa-empty">
          <HiOutlineDocumentText size={44} aria-hidden="true" />
          <h3>{t("writing:teacher.emptyTitle")}</h3>
          <p>{t("writing:teacher.emptyBody")}</p>
          <button type="button" className="btn btn-primary" onClick={newAssignment}>
            {t("writing:teacher.newAssignment")}
          </button>
        </div>
      )}

      {assignments.length > 0 && (
        <div className="wa-grid">
          {assignments.map((assignment) => {
            const counts = assignment.stageCounts || {};
            const bar = BAR_STAGES
              .map((stage) => ({ stage, count: counts[stage] || 0 }))
              .filter((row) => row.count > 0);
            return (
              <article className="wa-card" key={assignment._id}>
                <header className="wa-card-head">
                  <div>
                    <h3>{assignment.title}</h3>
                    <p className="wa-card-sub">
                      {classNameFor(assignment) || t("writing:teacher.selectedStudents")}
                      {assignment.dueDate && (
                        <> · {t("writing:teacher.due")} {formatDate(assignment.dueDate)}</>
                      )}
                    </p>
                  </div>
                  <span className="wa-chip">{t(`writing:teacher.types.${assignment.writingType}`)}</span>
                </header>

                <div className="wa-stages">
                  {bar.length === 0 && <span className="wa-bar-empty">{t("writing:teacher.nobodyStarted")}</span>}
                  {bar.map((row) => (
                    <span className={`wa-stage ${stageTone(row.stage)}`} key={row.stage}>
                      <em>{t(`writing:teacher.stages.${row.stage}`)}</em>
                      <b>{row.count}</b>
                    </span>
                  ))}
                </div>

                <p className="wa-card-note">
                  {t("writing:teacher.studentCount", { n: assignment.audienceSize || 0 })}
                  {" · "}
                  {t("writing:teacher.draftsIn", { n: assignment.draftCount || 0 })}
                  {" · "}
                  {t("writing:teacher.sectionCount", { n: (assignment.sections || []).length })}
                  {" · "}
                  {t("writing:teacher.totalPoints", { n: assignment.totalPoints || 0 })}
                </p>

                <footer className="wa-card-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openAssignment(assignment._id)}>
                    {t("writing:teacher.open")}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editAssignment(assignment._id)}>
                    <HiOutlinePencilAlt size={15} aria-hidden="true" />
                    {t("writing:teacher.edit")}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
