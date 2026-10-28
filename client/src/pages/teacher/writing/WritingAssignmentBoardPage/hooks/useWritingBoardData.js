import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";

export function useWritingBoardData() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [batchPending, setBatchPending] = useState(false);
  const loadedBoard = useRef(false);
  const loadedHistory = useRef("");

  useEffect(() => {
    let active = true;
    if (!loadedBoard.current) setLoading(true);
    writingService.getBoard(assignmentId)
      .then((data) => {
        if (!active) return;
        loadedBoard.current = true;
        setBoard(data);
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || "Could not load this writing task.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [assignmentId, refreshKey]);

  useEffect(() => {
    if (!projectId) {
      setHistory(null);
      loadedHistory.current = "";
      return undefined;
    }
    let active = true;
    if (loadedHistory.current !== projectId) setHistoryLoading(true);
    writingService.getProjectHistory(projectId)
      .then((data) => {
        if (!active) return;
        loadedHistory.current = projectId;
        setHistory(data);
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || "Could not load that student.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [projectId, refreshKey]);

  const rows = useMemo(() => {
    const all = board?.rows || [];
    const term = search.trim().toLowerCase();
    return all.filter((row) => (
      (!stageFilter || row.stage === stageFilter)
      && (!term || row.name.toLowerCase().includes(term) || String(row.studentIdCode || "").toLowerCase().includes(term))
    ));
  }, [board, search, stageFilter]);

  const stagesPresent = useMemo(() => {
    const counts = new Map();
    for (const row of board?.rows || []) counts.set(row.stage, (counts.get(row.stage) || 0) + 1);
    return [...counts.entries()].map(([stage, count]) => ({ stage, count }));
  }, [board]);

  const openStudent = useCallback((id) => setProjectId(id || ""), []);
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  const assessWaiting = useCallback(async () => {
    setBatchPending(true);
    try {
      const result = await writingService.assessAssignment(assignmentId, { limit: 5 });
      if (!result?.attempted) {
        toast(t("writing:teacher.review.batchEmpty"));
      } else {
        toast.success(t("writing:teacher.review.batchDone", {
          assessed: result.assessed,
          failed: result.failed,
          remaining: result.remaining,
        }));
      }
      refresh();
      return result;
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:teacher.review.failed"));
      return null;
    } finally {
      setBatchPending(false);
    }
  }, [assignmentId, refresh, t]);

  return {
    assignment: board?.assignment || null,
    assessWaiting,
    batchPending,
    history,
    historyLoading,
    loading,
    openStudent,
    projectId,
    refresh,
    rows,
    search,
    setSearch,
    stageFilter,
    stagesPresent,
    onStage: setStageFilter,
    summary: board?.summary || null,
    onBack: () => navigate("/portal/writing/assignments"),
    onEdit: () => navigate(`/portal/writing/assignments/${assignmentId}/edit`),
  };
}
