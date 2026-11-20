import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";
import { creditErrorMessage } from "../../../../../utils/aiCredit.js";
import { sortBoardRows } from "../boardPresentation.js";

export function useWritingBoardData() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  // F5: the board opens on what needs the teacher first.
  const [sort, setSort] = useState("attention");
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [batchPending, setBatchPending] = useState(false);
  // F3: the queued batch, its confirmation preview and the run being watched.
  const [batchPrompt, setBatchPrompt] = useState(null);
  const [batchRun, setBatchRun] = useState(null);
  // F7: rows ticked for a class-wide publish, kept across a board refresh.
  const [selectedProjects, setSelectedProjects] = useState(() => new Set());
  const [bulkPrompt, setBulkPrompt] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkNotify, setBulkNotify] = useState({ student: true, parents: true });
  const watchedRun = useRef("");
  const notifiedRun = useRef("");
  const loadedBoard = useRef(false);
  const loadedHistory = useRef("");

  useEffect(() => {
    let active = true;
    if (loadedBoard.current !== assignmentId) {
      // A different task is a different board; the previous one must not stand in.
      setBoard(null);
      setProjectId("");
      setLoading(true);
      setBatchRun(null);
      setBatchPrompt(null);
    }
    writingService.getBoard(assignmentId)
      .then((data) => {
        if (!active) return;
        loadedBoard.current = assignmentId;
        setBoard(data);
        // A reloaded board picks the run back up; it may still be running.
        if (data?.batchRun) setBatchRun(data.batchRun);
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
    if (loadedHistory.current !== projectId) {
      // One student's feedback must never sit under another student's name.
      setHistory(null);
      setHistoryLoading(true);
    }
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
    const filtered = all.filter((row) => (
      (!stageFilter || row.stage === stageFilter)
      && (!term || row.name.toLowerCase().includes(term) || String(row.studentIdCode || "").toLowerCase().includes(term))
    ));
    return sortBoardRows(filtered, sort);
  }, [board, search, stageFilter, sort]);

  const stagesPresent = useMemo(() => {
    const counts = new Map();
    for (const row of board?.rows || []) counts.set(row.stage, (counts.get(row.stage) || 0) + 1);
    return [...counts.entries()].map(([stage, count]) => ({ stage, count }));
  }, [board]);

  // The server decides whether the Phase 5 teacher tools are on for this school.
  const teacherTools = board?.features?.teacherTools === true;

  const openStudent = useCallback((id) => setProjectId(id || ""), []);
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);
  const analyseStudent = useCallback(() => {
    if (!projectId) return;
    navigate(`/portal/writing/analysis?projectId=${encodeURIComponent(projectId)}`, {
      state: { from: `/portal/writing/assignments/${assignmentId}` },
    });
  }, [assignmentId, navigate, projectId]);

  // F13: the reason is part of the record, so an empty answer sends nothing.
  const returnSubmission = useCallback(async (targetId) => {
    const answer = window.prompt(t("writing:teacher.board.returnPrompt"));
    if (answer === null) return null;
    const reason = answer.trim();
    if (!reason) {
      toast.error(t("writing:teacher.board.returnReasonRequired"));
      return null;
    }
    try {
      const result = await writingService.returnDraftToStudent(targetId, reason);
      toast.success(t("writing:teacher.board.returned"));
      refresh();
      return result;
    } catch (error) {
      toast.error(
        error?.response?.data?.message || t("writing:teacher.board.returnFailed"),
      );
      return null;
    }
  }, [refresh, t]);

  const assessWaiting = useCallback(async () => {
    if (teacherTools) {
      // F3: show what the batch costs before anything starts.
      setBatchPending(true);
      try {
        const preview = await writingService.previewBatchAssessment(
          assignmentId,
          { limit: 10 },
        );
        if (!preview?.drafts) {
          toast(t("writing:teacher.review.batchEmpty"));
          return null;
        }
        setBatchPrompt(preview);
        return preview;
      } catch (error) {
        toast.error(
          creditErrorMessage(error, t) ||
            error?.response?.data?.message ||
            t("writing:teacher.review.failed"),
        );
        return null;
      } finally {
        setBatchPending(false);
      }
    }
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
      const prechecked = (result?.outcomes || []).filter(
        (row) => row.precheck,
      ).length;
      if (prechecked) {
        toast(
          t("writing:teacher.review.batchPrechecked", { n: prechecked }),
        );
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
  }, [assignmentId, refresh, t, teacherTools]);

  const confirmBatch = useCallback(async () => {
    setBatchPending(true);
    try {
      const run = await writingService.startBatchAssessment(assignmentId, {
        limit: 10,
      });
      setBatchPrompt(null);
      if (!run?.started) {
        toast(t("writing:teacher.review.batchEmpty"));
        refresh();
        return null;
      }
      setBatchRun(run);
      toast(t("writing:teacher.review.batchStarted"));
      return run;
    } catch (error) {
      toast.error(
        creditErrorMessage(error, t) ||
          error?.response?.data?.message ||
          t("writing:teacher.review.failed"),
      );
      return null;
    } finally {
      setBatchPending(false);
    }
  }, [assignmentId, refresh, t]);

  const dismissBatchPrompt = useCallback(() => setBatchPrompt(null), []);

  const cancelBatch = useCallback(async () => {
    if (!batchRun?.id) return;
    try {
      setBatchRun(await writingService.cancelBatchRun(batchRun.id));
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.review.batchCancelFailed"),
      );
    }
  }, [batchRun?.id, t]);

  const retryBatch = useCallback(async () => {
    if (!batchRun?.id) return;
    try {
      setBatchRun(await writingService.retryBatchRun(batchRun.id));
      toast(t("writing:teacher.review.batchResumed"));
    } catch (error) {
      toast.error(
        creditErrorMessage(error, t) ||
          error?.response?.data?.message ||
          t("writing:teacher.review.failed"),
      );
    }
  }, [batchRun?.id, t]);

  // A running batch updates itself here; the table behind it stays untouched.
  useEffect(() => {
    if (batchRun?.status !== "running") return undefined;
    watchedRun.current = batchRun.id;
    let active = true;
    const id = window.setInterval(async () => {
      try {
        const fresh = await writingService.getBatchRun(batchRun.id);
        if (active && fresh) setBatchRun(fresh);
      } catch {
        // Keep the last known state; the next poll may recover.
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [batchRun?.id, batchRun?.status]);

  // One toast per finished run, and only for a run this tab watched.
  useEffect(() => {
    if (!batchRun || batchRun.status === "running") return;
    if (watchedRun.current !== batchRun.id) return;
    const stamp = `${batchRun.id}:${batchRun.status}:${batchRun.finishedAt || ""}`;
    if (notifiedRun.current === stamp) return;
    notifiedRun.current = stamp;
    const { done, failed, skipped } = batchRun.totals;
    if (skipped) toast(t("writing:teacher.review.batchPrechecked", { n: skipped }));
    if (batchRun.status === "cancelled") {
      toast(t("writing:teacher.review.batchCancelled"));
    } else if (batchRun.stoppedReason === "credit") {
      toast.error(t("writing:teacher.review.batchStoppedCredit"));
    } else if (failed > 0) {
      toast(t("writing:teacher.review.batchFinishedFailed", { done, failed }));
    } else {
      toast.success(t("writing:teacher.review.batchFinished", { done }));
    }
    refresh();
  }, [batchRun, refresh, t]);

  /* F7: the class-wide publish. Selection is by project, and every action goes
     through the preview first so no row is published unseen. */

  const toggleSelect = useCallback((targetId) => {
    if (!targetId) return;
    setSelectedProjects((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }, []);

  const visibleProjectIds = useMemo(
    () => rows.map((row) => row.projectId).filter(Boolean),
    [rows],
  );

  const toggleSelectAll = useCallback(() => {
    setSelectedProjects((current) => {
      const all =
        visibleProjectIds.length > 0 &&
        visibleProjectIds.every((id) => current.has(id));
      return all ? new Set() : new Set(visibleProjectIds);
    });
  }, [visibleProjectIds]);

  const clearSelection = useCallback(() => setSelectedProjects(new Set()), []);

  const requestBulkPublish = useCallback(
    async (projectIds, notify = bulkNotify) => {
      const ids = (
        projectIds?.length ? projectIds : [...selectedProjects]
      ).filter((id) => id && visibleProjectIds.includes(id));
      if (!ids.length) {
        toast(t("writing:teacher.bulk.noneSelected"));
        return null;
      }
      setBulkPending(true);
      setBulkResult(null);
      try {
        const preview = await writingService.previewBulkPublish(assignmentId, {
          projectIds: ids,
          notify,
        });
        setBulkPrompt(preview);
        return preview;
      } catch (error) {
        toast.error(
          error?.response?.data?.message ||
            t("writing:teacher.bulk.previewFailed"),
        );
        return null;
      } finally {
        setBulkPending(false);
      }
    },
    [
      assignmentId,
      bulkNotify,
      selectedProjects,
      t,
      visibleProjectIds,
    ],
  );

  const confirmBulkPublish = useCallback(async () => {
    if (!bulkPrompt?.rows?.length) return null;
    setBulkPending(true);
    try {
      // The preview's own channel list is what the teacher confirmed.
      const result = await writingService.bulkPublish(assignmentId, {
        projectIds: bulkPrompt.rows.map((row) => row.projectId),
        notify: bulkPrompt.channels,
      });
      setBulkPrompt(null);
      setBulkResult(result);
      setSelectedProjects(new Set());
      const { published, already, failed, blocked } = result.summary;
      if (failed) {
        toast.error(
          t("writing:teacher.bulk.doneFailed", { published, failed, blocked }),
        );
      } else {
        toast.success(
          t("writing:teacher.bulk.done", { published, already, blocked }),
        );
      }
      refresh();
      return result;
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.bulk.publishFailed"),
      );
      // A failed request may still have published some rows: never leave the
      // board showing yesterday's stages.
      refresh();
      return null;
    } finally {
      setBulkPending(false);
    }
  }, [assignmentId, bulkPrompt, refresh, t]);

  const dismissBulkPublish = useCallback(() => {
    setBulkPrompt(null);
    setBulkResult(null);
  }, []);

  return {
    assignment: board?.assignment || null,
    assessWaiting,
    analyseStudent,
    batchCancel: cancelBatch,
    batchConfirm: confirmBatch,
    batchDismiss: dismissBatchPrompt,
    batchPending,
    batchPrompt,
    batchRetry: retryBatch,
    batchRun,
    bulkClear: clearSelection,
    bulkConfirm: confirmBulkPublish,
    bulkDismiss: dismissBulkPublish,
    bulkNotify,
    bulkPending,
    bulkPrompt,
    bulkRequest: requestBulkPublish,
    bulkResult,
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
    returnSubmission,
    rows,
    search,
    selectedProjects,
    setBulkNotify,
    setSearch,
    sort,
    onSort: setSort,
    stageFilter,
    stagesPresent,
    toggleSelect,
    toggleSelectAll,
    onStage: setStageFilter,
    summary: board?.summary || null,
    teacherTools,
    onBack: () => navigate("/portal/writing/assignments"),
    onEdit: () => navigate(`/portal/writing/assignments/${assignmentId}/edit`),
  };
}
