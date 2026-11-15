import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";
import aiCreditService from "../../../../../services/aiCreditService.js";
import classService from "../../../../../services/classService.js";
import { countLabel } from "../../../../../utils/countText.js";

const listFrom = (payload) => {
  const raw = payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  return raw?.classes || raw?.students || raw?.items || [];
};

export function useWritingAssignmentsData() {
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);

  const [result, setResult] = useState({ key: "", rows: [], failed: false });
  const [classes, setClasses] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [credit, setCredit] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = JSON.stringify([classId, search, retryKey]);
  const loading = result.key !== requestKey;

  useEffect(() => {
    let active = true;
    aiCreditService.getSummary()
      .then((summary) => { if (active) setCredit(summary); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Server-backed search: one request per pause, not per keystroke.
  useEffect(() => {
    if (searchInput.trim() === search) return undefined;
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

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
    writingService.listAssignments({
      classId: classId || undefined,
      search: search || undefined,
    })
      .then((rows) => {
        if (active) setResult({ key: requestKey, rows: Array.isArray(rows) ? rows : [], failed: false });
      })
      .catch(() => {
        if (active) setResult({ key: requestKey, rows: [], failed: true });
      });
    return () => { active = false; };
  }, [classId, search, requestKey]);

  const visible = useMemo(
    () => loading ? [] : result.rows.filter((row) => row.isActive !== false),
    [loading, result.rows],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
      try {
        await writingService.deactivateAssignment(assignmentId, false);
      } catch (error) {
        const body = error?.response?.data;
        if (body?.code !== "CONFIRM_DEACTIVATE") throw error;
        const sentWork = Number(body?.data?.sentWork) || 0;
        const confirmed = window.confirm(
          countLabel(t, "writing:teacher.closeTaskConfirm", sentWork),
        );
        if (!confirmed) return false;
        await writingService.deactivateAssignment(assignmentId, true);
      }
      setResult((current) => ({
        ...current,
        rows: current.rows.map((row) => (
          row._id === assignmentId ? { ...row, isActive: false } : row
        )),
      }));
      toast.success(t("writing:teacher.closeTaskDone"));
      return true;
    } catch (error) {
      toast.error(
        error?.response?.data?.message || t("writing:teacher.closeTaskFailed"),
      );
      return false;
    }
  }, [t]);

  return {
    assignments: paginated,
    classes,
    classId,
    credit,
    loading,
    failed: !loading && result.failed,
    searchInput,
    totals,
    page: currentPage,
    pageSize,
    totalItems: visible.length,
    totalPages,
    classNameFor,
    onSearch: (value) => { setSearchInput(value); setPage(1); },
    onClass: (value) => { setClassId(value); setPage(1); },
    onPage: setPage,
    onPageSize: (value) => { setPageSize(value); setPage(1); },
    retry: () => setRetryKey((key) => key + 1),
    openAssignment: (assignmentId) => navigate(`/portal/writing/assignments/${assignmentId}`),
    editAssignment: (assignmentId) => navigate(`/portal/writing/assignments/${assignmentId}/edit`),
    newAssignment: () => navigate("/portal/writing/new"),
    deactivate,
  };
}
