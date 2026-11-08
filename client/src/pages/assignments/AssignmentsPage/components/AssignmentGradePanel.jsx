import { HiOutlineCheckCircle } from "react-icons/hi";
import { useTranslation } from "react-i18next";

const AssignmentGradePanel = ({
  gradingAssignment,
  gradeStudents,
  gradeRows,
  onGradeChange,
  onToggleExcuse,
  excuseBusyStudentId,
  onClose,
  onSubmitGrades,
  submitting = false,
  showBehaviorAction = false,
  onOpenBehavior,
}) => {
  const { t } = useTranslation(["assignments"]);
  if (!gradingAssignment) return null;

  const linkedLessons = Array.isArray(gradingAssignment.lessonPlans)
    ? gradingAssignment.lessonPlans
    : [];

  return (
    <>
      <div
        className="grade-panel-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="grade-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-grade-title"
      >
        <div className="card-header">
          <h3 className="card-title" id="assignment-grade-title">
            {t("assignments:gradePanel.title", {
              title: gradingAssignment.title,
            })}
          </h3>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
          >
            {t("assignments:common.close")}
          </button>
        </div>

        {linkedLessons.length > 0 && (
          <div className="card-body">
            <strong>
              {t("assignments:gradePanel.linkedLessons", {
                defaultValue: "Linked lesson plans:",
              })}
            </strong>{" "}
            {linkedLessons.map((lesson) => lesson.title || lesson.id).join(", ")}
          </div>
        )}

        <div className="table-container grade-panel__table-wrap">
          <table className="assignment-table grade-panel__table">
            <thead>
              <tr>
                <th>{t("assignments:gradePanel.columns.student")}</th>
                <th>{t("assignments:gradePanel.columns.marks")}</th>
                <th>{t("assignments:gradePanel.columns.remarks")}</th>
                {showBehaviorAction && (
                  <th>{t("assignments:gradePanel.columns.behavior")}</th>
                )}
                <th>{t("assignments:gradePanel.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {gradeStudents.map((student) => {
                const row = gradeRows[student.id] || {};
                const isExcused = row.excused === true;
                const isBusy = excuseBusyStudentId === student.id;
                const hasMarks =
                  row.marks !== "" &&
                  row.marks !== null &&
                  row.marks !== undefined;
                const studentName =
                  student.fullName ||
                  `${student.firstName} ${student.lastName}`;

                return (
                  <tr
                    key={student.id}
                    className={isExcused ? "grade-row--excused" : undefined}
                  >
                    <td
                      data-label={t("assignments:gradePanel.columns.student")}
                      className="grade-panel__student"
                    >
                      {studentName}
                    </td>
                    <td data-label={t("assignments:gradePanel.columns.marks")}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={gradingAssignment.maxMarks}
                        value={row.marks ?? ""}
                        onChange={(event) =>
                          onGradeChange(student.id, "marks", event.target.value)
                        }
                        disabled={isExcused}
                        aria-label={`${t("assignments:gradePanel.columns.marks")}: ${studentName}`}
                      />
                    </td>
                    <td data-label={t("assignments:gradePanel.columns.remarks")}>
                      <input
                        type="text"
                        value={row.remarks ?? ""}
                        onChange={(event) =>
                          onGradeChange(student.id, "remarks", event.target.value)
                        }
                        placeholder={t("assignments:gradePanel.optional")}
                        disabled={isExcused}
                        aria-label={`${t("assignments:gradePanel.columns.remarks")}: ${studentName}`}
                      />
                    </td>
                    {showBehaviorAction && (
                      <td
                        data-label={t("assignments:gradePanel.columns.behavior")}
                      >
                        <button
                          type="button"
                          className="btn btn-outline btn-sm grade-panel__behavior"
                          onClick={() => onOpenBehavior(student)}
                          disabled={isExcused}
                        >
                          {t("assignments:gradePanel.scoreBehavior")}
                        </button>
                      </td>
                    )}
                    <td data-label={t("assignments:gradePanel.columns.status")}>
                      {isExcused ? (
                        <div className="grade-excused">
                          <span className="grade-excused__badge">
                            {t("assignments:gradePanel.excused")}
                          </span>
                          {onToggleExcuse && (
                            <button
                              type="button"
                              className="grade-excused__undo"
                              onClick={() => onToggleExcuse(student)}
                              disabled={isBusy}
                            >
                              {isBusy
                                ? t("assignments:gradePanel.saving")
                                : t("assignments:gradePanel.undoExcuse")}
                            </button>
                          )}
                        </div>
                      ) : hasMarks ? (
                        <HiOutlineCheckCircle className="status-icon success" />
                      ) : onToggleExcuse ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => onToggleExcuse(student)}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? t("assignments:gradePanel.saving")
                            : t("assignments:gradePanel.excuse")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {submitting && (
          <div
            className="assignment-grade-progress"
            role="status"
            aria-live="polite"
          >
            <span className="assignment-grade-progress__label">
              {t("assignments:gradePanel.savingProgress")}
            </span>
            <div
              className="assignment-grade-progress__track"
              role="progressbar"
              aria-label={t("assignments:gradePanel.savingProgress")}
            >
              <div className="assignment-grade-progress__bar" />
            </div>
          </div>
        )}

        <p className="assignment-grade-hint">
          {t("assignments:gradePanel.excuseHint")}
        </p>

        <div className="card-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitGrades}
            disabled={submitting}
          >
            {submitting
              ? t("assignments:gradePanel.saving", { defaultValue: "Saving…" })
              : t("assignments:gradePanel.save")}
          </button>
        </div>
      </div>
    </>
  );
};

export default AssignmentGradePanel;
