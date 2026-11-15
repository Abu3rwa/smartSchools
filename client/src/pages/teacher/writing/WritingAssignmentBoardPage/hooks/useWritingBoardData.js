import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";
import { creditErrorMessage } from "../../../../../utils/aiCredit.js";

export function useWritingBoardData() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
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
        setFailed(false);
      })
      .catch(() => {
        // A failed board is not an empty class list; the page says so and offers a retry.
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [assignmentId, refreshKey]);

  useEffect(() => {
    if (!projectId) {
      setHistory(null);
      setHistoryFailed(false);
      loadedHistory.current = "";
      return undefined;
    }
    let active = true;
    if (loadedHistory.current !== projectId) setHistoryLoading(true);
    setHistoryFailed(false);
    writingService.getProjectHistory(projectId)
      .then((data) => {
        if (!active) return;
        loadedHistory.current = projectId;
        setHistory(data);
      })
      .catch(() => {
        // Without this the modal fell back to a spinner that never stops.
        if (active) setHistoryFailed(true);
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
  const analyseStudent = useCallback(() => {
    if (!projectId) return;
    navigate(`/portal/writing/analysis?projectId=${encodeURIComponent(projectId)}`, {
      state: { from: `/portal/writing/assignments/${assignmentId}` },
    });
  }, [assignmentId, navigate, projectId]);

  const assessWaiting = useCallback(async () => {
    setBatchPending(true);
    try {
      const result = await writingService.assessAssignment(assignmentId, { limit: 5 });
      if (!result?.attempted && !result?.creditStopped) {
        toast(t("writing:teacher.review.batchEmpty"));
      } else if (result?.attempted) {
        toast.success(t("writing:teacher.review.batchDone", {
          assessed: result.assessed,
          failed: result.failed,
          remaining: result.remaining,
        }));
      }
      if (result?.creditStopped) toast.error(t("writing:common.batchStopped"));
      if (result?.budgetExhausted && result?.remaining > 0) {
        toast(
          t("writing:teacher.review.batchBudget", {
            remaining: result.remaining,
          }),
        );
      }
      refresh();
      return result;
    } catch (error) {
      toast.error(creditErrorMessage(error, t) || error?.response?.data?.message || t("writing:teacher.review.failed"));
      // A timeout does not mean nothing was assessed: always re-read the board.
      refresh();
      return null;
    } finally {
      setBatchPending(false);
    }
  }, [assignmentId, refresh, t]);

  return {
    assignment: board?.assignment || null,
    assessWaiting,
    analyseStudent,
    batchPending,
    credit: board?.credit || null,
    emailDelivery: board?.emailDelivery || null,
    failed,
    history,
    historyFailed,
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
