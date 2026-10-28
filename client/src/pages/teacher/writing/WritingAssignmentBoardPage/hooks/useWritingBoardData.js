import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";

export function useWritingBoardData() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    writingService.getBoard(assignmentId)
      .then((data) => {
        if (active) setBoard(data);
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || "Could not load this writing task.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [assignmentId]);

  useEffect(() => {
    if (!projectId) {
      setHistory(null);
      return undefined;
    }
    let active = true;
    setHistoryLoading(true);
    writingService.getProjectHistory(projectId)
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || "Could not load that student.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [projectId]);

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

  return {
    assignment: board?.assignment || null,
    history,
    historyLoading,
    loading,
    openStudent,
    projectId,
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
