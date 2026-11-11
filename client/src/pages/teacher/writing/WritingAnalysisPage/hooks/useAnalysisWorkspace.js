import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser, selectUserRoles } from "../../../../../store/slices/authSlice";
import classService from "../../../../../services/classService.js";
import studentService from "../../../../../services/studentService.js";

const listOf = (payload, key) => {
  const raw = payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  return raw?.[key] || [];
};

const userIdOf = (value) => String(value?._id || value || "");

/**
 * Class → subject → student, kept in the URL so a link can reopen the same
 * student. `seed` adopts the student resolved from a writing-task link without
 * dropping the link until the teacher picks somebody else.
 */
export function useAnalysisWorkspace() {
  const [params, setParams] = useSearchParams();
  const user = useSelector(selectUser);
  const roles = useSelector(selectUserRoles);

  const [selection, setSelection] = useState(() => ({
    classId: params.get("classId") || "",
    studentId: params.get("studentId") || "",
    subjectId: params.get("subjectId") || "",
    projectId: params.get("projectId") || "",
  }));
  const [classResult, setClassResult] = useState({ key: "", rows: [], failed: false });
  const [studentResult, setStudentResult] = useState({ key: "", rows: [], failed: false });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(selection)) {
      if (value) next.set(key, value);
    }
    setParams(next, { replace: true });
  }, [selection, setParams]);

  const classKey = String(retryKey);
  const studentKey = selection.classId
    ? `${selection.classId}:${retryKey}`
    : "";

  useEffect(() => {
    let active = true;
    classService
      .getClasses({ limit: "all" })
      .then((response) => {
        if (!active) return;
        setClassResult({ key: classKey, rows: listOf(response, "classes"), failed: false });
      })
      .catch(() => {
        if (!active) return;
        setClassResult({ key: classKey, rows: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, [classKey]);

  useEffect(() => {
    if (!studentKey) return undefined;
    let active = true;
    studentService
      .getStudentsByClass(selection.classId)
      .then((response) => {
        if (!active) return;
        setStudentResult({ key: studentKey, rows: listOf(response, "students"), failed: false });
      })
      .catch(() => {
        if (!active) return;
        setStudentResult({ key: studentKey, rows: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, [selection.classId, studentKey]);

  const classLoaded = classResult.key === classKey;
  const classes = useMemo(
    () => (classLoaded ? classResult.rows : []),
    [classLoaded, classResult.rows],
  );
  const classesState = classLoaded
    ? classResult.failed
      ? "failed"
      : "ready"
    : "loading";

  const studentLoaded = Boolean(studentKey) && studentResult.key === studentKey;
  const students = useMemo(
    () => (studentLoaded ? studentResult.rows : []),
    [studentLoaded, studentResult.rows],
  );
  const studentsState = !studentKey
    ? "idle"
    : studentLoaded
      ? studentResult.failed
        ? "failed"
        : "ready"
      : "loading";

  const selectedClass = useMemo(
    () =>
      classes.find((row) => String(row._id) === selection.classId) || null,
    [classes, selection.classId],
  );

  // Best-effort prefilter; the server decides who may analyse what.
  const subjectOptions = useMemo(() => {
    const rows = (selectedClass?.subjects || [])
      .map((row) => ({
        _id: userIdOf(row.subject),
        name: row.subject?.name || "",
        teacherUserId: userIdOf(row.teacher?.user || row.teacher),
      }))
      .filter((row) => row._id);
    const isAdmin = (roles || []).some((role) =>
      ["admin", "super_admin"].includes(String(role)),
    );
    const isClassTeacher =
      userIdOf(selectedClass?.classTeacher?.user || selectedClass?.classTeacher) ===
      userIdOf(user);
    if (isAdmin || isClassTeacher) return rows;
    const mine = rows.filter((row) => row.teacherUserId === userIdOf(user));
    return mine.length ? mine : rows;
  }, [roles, selectedClass, user]);

  const select = useCallback((patch) => {
    setSelection((previous) => ({ ...previous, ...patch }));
  }, []);
  const chooseClass = useCallback(
    (classId) =>
      select({ classId, studentId: "", subjectId: "", projectId: "" }),
    [select],
  );
  const chooseSubject = useCallback(
    (subjectId) => select({ subjectId, projectId: "" }),
    [select],
  );
  const chooseStudent = useCallback(
    (studentId) => select({ studentId, projectId: "" }),
    [select],
  );

  return {
    ...selection,
    classes,
    classesState,
    selectedClass,
    students,
    studentsState,
    subjectOptions,
    chooseClass,
    chooseSubject,
    chooseStudent,
    seed: select,
    retry: () => setRetryKey((value) => value + 1),
  };
}
