import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";
import classService from "../../../../../services/classService.js";

const listFrom = (payload) => {
  const raw = payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  return raw?.classes || raw?.students || raw?.items || [];
};

export function useWritingAssignmentsData() {
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");

  // Server-backed search: one request per pause, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    classService.getClasses()
      .then((response) => {
        if (active) setClasses(listFrom(response));
      })
      .catch(() => {
        if (active) setClasses([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    writingService.listAssignments({
      classId: classId || undefined,
      search: search || undefined,
    })
      .then((rows) => {
        if (active) setAssignments(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        if (active) {
          toast.error(error?.response?.data?.message || "Could not load writing tasks.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [classId, search]);

  const visible = useMemo(() => assignments.filter((row) => row.isActive !== false), [assignments]);

  const totals = useMemo(() => visible.reduce((acc, row) => ({
    assignments: acc.assignments + 1,
    students: acc.students + (row.audienceSize || 0),
    drafts: acc.drafts + (row.draftCount || 0),
    waiting: acc.waiting + ((row.stageCounts?.submitted || 0) + (row.stageCounts?.feedback_ready || 0)),
    revising: acc.revising + ((row.stageCounts?.revising || 0) + (row.stageCounts?.compared || 0)),
    done: acc.done + (row.stageCounts?.completed || 0),
  }), { assignments: 0, students: 0, drafts: 0, waiting: 0, revising: 0, done: 0 }), [visible]);

  const classNamesById = useMemo(() => new Map(
    classes.map((item) => [String(item._id || item.id), item.name])
  ), [classes]);

  const classNameFor = useCallback(
    (row) => classNamesById.get(String(row.class)) || "",
    [classNamesById],
  );

  const deactivate = useCallback(async (assignmentId) => {
    try {
      await writingService.deactivateAssignment(assignmentId);
      setAssignments((current) => current.map((row) => (
        row._id === assignmentId ? { ...row, isActive: false } : row
      )));
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not close that writing task.");
      return false;
    }
  }, []);

  return {
    assignments: visible,
    classes,
    classId,
    loading,
    searchInput,
    totals,
    classNameFor,
    onSearch: setSearchInput,
    onClass: setClassId,
    openAssignment: (assignmentId) => navigate(`/portal/writing/assignments/${assignmentId}`),
    editAssignment: (assignmentId) => navigate(`/portal/writing/assignments/${assignmentId}/edit`),
    newAssignment: () => navigate("/portal/writing/new"),
    deactivate,
  };
}
