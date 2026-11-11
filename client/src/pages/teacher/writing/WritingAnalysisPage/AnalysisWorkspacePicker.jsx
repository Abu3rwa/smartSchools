import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const idOf = (row) => String(row?._id || row || "");

const classNameOf = (row) => {
  if (!row) return "";
  const name = row.name || `Grade ${row.grade}`;
  return row.section ? `${name} · ${row.section}` : name;
};

/**
 * Class → subject → student. The values fall back to the student a writing
 * task link resolved, so the picker never looks empty after the board shortcut.
 */
export default function AnalysisWorkspacePicker({ workspace, scope }) {
  const { t } = useTranslation(["writing"]);
  const {
    classes,
    classesState,
    chooseClass,
    chooseStudent,
    chooseSubject,
    selectedClass,
    students,
    studentsState,
    subjectOptions,
  } = workspace;

  const classId = workspace.classId || idOf(scope?.class);
  const studentId = workspace.studentId || idOf(scope?.student);
  const subjectId = workspace.subjectId || idOf(scope?.subject);
  const classYear = selectedClass?.academicYear || scope?.academicYear || "";

  const subjectChoices = useMemo(() => {
    const rows = [...(subjectOptions || [])];
    if (scope?.subject && !rows.some((row) => idOf(row) === idOf(scope.subject))) {
      rows.push({ _id: idOf(scope.subject), name: scope.subject.name || "" });
    }
    return rows;
  }, [scope, subjectOptions]);

  const studentChoices = useMemo(() => {
    const rows = [...(students || [])];
    if (scope?.student && !rows.some((row) => idOf(row) === idOf(scope.student))) {
      rows.unshift({
        _id: idOf(scope.student),
        firstName: scope.student.name || "",
        lastName: "",
      });
    }
    return rows;
  }, [scope, students]);

  const loadingClassList = classesState === "loading";
  const classesFailed = classesState === "failed";
  const loadingStudents = studentsState === "loading";
  const studentsFailed = studentsState === "failed";
  const noSubjects = Boolean(classId) && subjectChoices.length === 0;

  return (
    <section className="wa-card wa-ana-picker">
      <div className="wa-card-head">
        <div>
          <h2>{t("writing:teacher.analysis.pickerTitle")}</h2>
          <p className="wa-card-sub">
            {t("writing:teacher.analysis.pickerHint")}
          </p>
        </div>
        {workspace.projectId && (
          <span className="wa-chip">
            {t("writing:teacher.analysis.pickerFromTask")}
          </span>
        )}
      </div>

      <div className="wa-analysis-controls">
        <label className="wa-field">
          {t("writing:teacher.analysis.pickerClass")}
          <select
            value={classId}
            disabled={loadingClassList || classesFailed}
            onChange={(event) => chooseClass(event.target.value)}
          >
            <option value="">
              {t("writing:teacher.analysis.pickerClassPlaceholder")}
            </option>
            {(classes || []).map((row) => (
              <option key={idOf(row)} value={idOf(row)}>
                {classNameOf(row)}
              </option>
            ))}
          </select>
          {classYear && <span className="wa-hint">{classYear}</span>}
        </label>

        <label className="wa-field">
          {t("writing:teacher.analysis.pickerSubject")}
          <select
            value={subjectId}
            disabled={!classId || noSubjects}
            onChange={(event) => chooseSubject(event.target.value)}
          >
            <option value="">
              {t("writing:teacher.analysis.pickerSubjectPlaceholder")}
            </option>
            {subjectChoices.map((row) => (
              <option key={idOf(row)} value={idOf(row)}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="wa-field">
          {t("writing:teacher.analysis.pickerStudent")}
          <select
            value={studentId}
            disabled={!classId || loadingStudents || studentsFailed}
            onChange={(event) => chooseStudent(event.target.value)}
          >
            <option value="">
              {t("writing:teacher.analysis.pickerStudentPlaceholder")}
            </option>
            {studentChoices.map((row) => {
              const name = [row.firstName, row.lastName]
                .filter(Boolean)
                .join(" ")
                .trim();
              return (
                <option key={idOf(row)} value={idOf(row)}>
                  {name || t("writing:teacher.analysis.pickerUnnamedStudent")}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <p className="wa-hint wa-ana-picker-note">
        {t("writing:teacher.analysis.pickerSubjectNote")}
      </p>

      {classesFailed && (
        <p className="wa-ana-picker-alert">
          {t("writing:teacher.analysis.pickerClassesFailed")}{" "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={workspace.retry}
          >
            {t("writing:teacher.analysis.pickerRetry")}
          </button>
        </p>
      )}
      {!classesFailed && classesState === "ready" && classes.length === 0 && (
        <p className="wa-ana-picker-alert">
          {t("writing:teacher.analysis.pickerNoClasses")}
        </p>
      )}
      {studentsFailed && (
        <p className="wa-ana-picker-alert">
          {t("writing:teacher.analysis.pickerStudentsFailed")}{" "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={workspace.retry}
          >
            {t("writing:teacher.analysis.pickerRetry")}
          </button>
        </p>
      )}
      {!studentsFailed && studentsState === "ready" && students.length === 0 && (
        <p className="wa-ana-picker-alert">
          {t("writing:teacher.analysis.pickerNoStudents")}
        </p>
      )}
      {noSubjects && (
        <p className="wa-ana-picker-alert">
          {t("writing:teacher.analysis.pickerNoSubjects")}
        </p>
      )}
      {!classId && (
        <p className="wa-hint">
          {t("writing:teacher.analysis.pickerStart")}
        </p>
      )}
    </section>
  );
}
