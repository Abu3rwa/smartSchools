import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";
import {
  creditErrorMessage,
  isCreditError,
} from "../../../../../utils/aiCredit.js";
import {
  allStandardSelection,
  defaultStandardSelection,
  fromDateInput,
  initialLevelDraft,
  toDateInput,
  windowRange,
} from "../analysisPresentation.js";

const POLL_MS = 3000;
const ACTIVE_RUN = ["pending", "running"];

const evidenceRowOf = (analysis, standardId, draftId) =>
  (analysis?.standards || [])
    .find((row) => String(row.standard) === String(standardId))
    ?.pieces?.find((row) => String(row.draft) === String(draftId)) || null;

/**
 * The setup and review state machine. It never fetches anything until a class
 * and a student (or a writing task) are chosen.
 */
export function useWritingAnalysisData({
  projectId = "",
  classId = "",
  studentId = "",
  subjectId = "",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(["writing"]);

  const entryKey = projectId
    ? `project:${projectId}`
    : classId && studentId
      ? `student:${classId}:${studentId}:${subjectId}`
      : "";

  // Keyed by entry so a new student never shows the previous student's scope.
  const [scopeState, setScopeState] = useState({
    key: "",
    data: null,
    error: "",
    loading: false,
  });
  const scope = scopeState.key === entryKey ? scopeState.data : null;
  const scopeError = scopeState.key === entryKey ? scopeState.error : "";
  const scopeLoading =
    Boolean(entryKey) &&
    (scopeState.key !== entryKey || scopeState.loading);
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState("year");
  const [applied, setApplied] = useState(() => {
    const range = windowRange("year");
    return {
      from: range.from ? range.from.toISOString() : "",
      to: range.to ? range.to.toISOString() : "",
    };
  });
  const [customFrom, setCustomFrom] = useState(() =>
    toDateInput(windowRange("year").from),
  );
  const [customTo, setCustomTo] = useState("");

  const [selected, setSelected] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const touchedRef = useRef(false);

  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [levelDraft, setLevelDraft] = useState({
    analysisId: "",
    values: {},
  });
  const [busy, setBusy] = useState("");
  const [conflict, setConflict] = useState(null);
  const [publishPreview, setPublishPreview] = useState(null);
  const [lastEvidenceChange, setLastEvidenceChange] = useState(null);
  const loadedEntryRef = useRef("");
  const windowRef = useRef(`${applied.from}|${applied.to}`);

  const scopeParams = {
    projectId: projectId || undefined,
    classId: classId || undefined,
    studentId: studentId || undefined,
    subjectId: subjectId || undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
  };

  const resetSelection = useCallback((data) => {
    touchedRef.current = false;
    setAnalysis(null);
    setConflict(null);
    setPublishPreview(null);
    setLastEvidenceChange(null);
    setSelected(
      defaultStandardSelection(
        data.standards,
        data.assignedStandardIds,
        data.defaultStandardCount,
      ),
    );
    setSelectedDrafts((data.pieces || []).map((row) => String(row.draft)));
  }, []);

  useEffect(() => {
    if (!entryKey) {
      loadedEntryRef.current = "";
      setAnalysis(null);
      setSelected([]);
      setSelectedDrafts([]);
      touchedRef.current = false;
      return undefined;
    }

    let active = true;
    const entryChanged = loadedEntryRef.current !== entryKey;
    loadedEntryRef.current = entryKey;
    const windowKey = `${applied.from}|${applied.to}`;
    const windowChanged = windowRef.current !== windowKey;
    windowRef.current = windowKey;

    writingService
      .getAnalysisScope(scopeParams)
      .then((data) => {
        if (!active) return;
        setScopeState({ key: entryKey, data, error: "", loading: false });
        // A new student starts fresh; a new window keeps a hand-made
        // selection, but an untouched one follows the pieces it now shows.
        if (entryChanged || (windowChanged && !touchedRef.current)) {
          resetSelection(data);
          return;
        }
        const availableStandards = new Set(
          (data.standards || []).map((row) => String(row._id)),
        );
        setSelected((previous) =>
          previous.filter((id) => availableStandards.has(id)),
        );
        const availableDrafts = new Set(
          (data.pieces || []).map((row) => String(row.draft)),
        );
        setSelectedDrafts((previous) =>
          previous.filter((id) => availableDrafts.has(id)),
        );
      })
      .catch((error) => {
        if (!active) return;
        const message =
          error?.response?.data?.message ||
          t("writing:teacher.analysis.loadFailed");
        setScopeState((previous) =>
          previous.key === entryKey
            ? { ...previous, error: message, loading: false }
            : { key: entryKey, data: null, error: message, loading: false },
        );
      });
    return () => {
      active = false;
    };
    // scopeParams is derived from exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applied.from,
    applied.to,
    classId,
    entryKey,
    projectId,
    refreshKey,
    resetSelection,
    studentId,
    subjectId,
    t,
  ]);

  // The estimate is priced server-side. Toggling only reprices; it never
  // refetches the pieces or resets the teacher's selection.
  useEffect(() => {
    if (!entryKey || !touchedRef.current) return undefined;
    const timer = setTimeout(() => {
      writingService
        .getAnalysisScope({
          ...scopeParams,
          standardCount: selected.length || undefined,
          draftIds: selectedDrafts.join(",") || undefined,
        })
        .then((data) => {
          setScopeState((previous) =>
            previous.key === entryKey && previous.data
              ? {
                  ...previous,
                  data: { ...previous.data, estimate: data.estimate },
                }
              : previous,
          );
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.from, applied.to, entryKey, selected, selectedDrafts]);

  // A run reads in the background; poll until it settles.
  useEffect(() => {
    if (!analysis?._id || !ACTIVE_RUN.includes(analysis.status)) return undefined;
    let active = true;
    const timer = setInterval(() => {
      writingService
        .getAnalysis(analysis._id)
        .then((data) => {
          if (active) setAnalysis(data);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [analysis?._id, analysis?.status]);

  const values = useMemo(() => {
    if (!analysis?._id) return {};
    if (levelDraft.analysisId === String(analysis._id)) return levelDraft.values;
    return initialLevelDraft(analysis.standards);
  }, [analysis, levelDraft]);

  const setLevel = useCallback(
    (standardId, patch) => {
      setLevelDraft((previous) => {
        const key = String(analysis?._id || "");
        const current =
          previous.analysisId === key
            ? previous.values
            : initialLevelDraft(analysis?.standards);
        return {
          analysisId: key,
          values: {
            ...current,
            [standardId]: { ...(current[standardId] || {}), ...patch },
          },
        };
      });
    },
    [analysis],
  );

  /** Apply every real proposal; rows without one keep the teacher's choice. */
  const applyProposedLevels = useCallback(() => {
    const key = String(analysis?._id || "");
    const next = { ...values };
    for (const row of analysis?.standards || []) {
      if (row.proposedLevel === null || row.proposedLevel === undefined) continue;
      const id = String(row.standard);
      next[id] = { level: row.proposedLevel, note: values[id]?.note || "" };
    }
    setLevelDraft({ analysisId: key, values: next });
  }, [analysis, values]);

  const toggleStandard = useCallback((id) => {
    touchedRef.current = true;
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  }, []);
  const selectAll = useCallback(() => {
    touchedRef.current = true;
    // Same rule as the defaults: keep the parts, not the umbrella above them.
    setSelected(allStandardSelection(scope?.standards || []));
  }, [scope]);
  const clearAll = useCallback(() => {
    touchedRef.current = true;
    setSelected([]);
  }, []);

  const toggleDraft = useCallback((id) => {
    touchedRef.current = true;
    setSelectedDrafts((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  }, []);
  const selectAllDrafts = useCallback(() => {
    touchedRef.current = true;
    setSelectedDrafts((scope?.pieces || []).map((row) => String(row.draft)));
  }, [scope]);
  const clearAllDrafts = useCallback(() => {
    touchedRef.current = true;
    setSelectedDrafts([]);
  }, []);

  const chooseWindow = useCallback((nextPreset) => {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    const range = windowRange(nextPreset);
    setApplied({
      from: range.from ? range.from.toISOString() : "",
      to: range.to ? range.to.toISOString() : "",
    });
    setCustomFrom(toDateInput(range.from));
    setCustomTo(toDateInput(range.to));
  }, []);

  const applyCustomWindow = useCallback(() => {
    const from = fromDateInput(customFrom);
    const to = fromDateInput(customTo);
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      toast.error(t("writing:teacher.analysis.windowInvalid"));
      return;
    }
    setApplied({ from, to });
  }, [customFrom, customTo, t]);

  const run = useCallback(async () => {
    if (!scope) return null;
    if (!selected.length) {
      toast.error(t("writing:teacher.analysis.runHint"));
      return null;
    }
    if (!selectedDrafts.length) {
      toast.error(t("writing:teacher.analysis.runHintPieces"));
      return null;
    }
    setBusy("run");
    try {
      const data = await writingService.createAnalysis({
        projectId: projectId || undefined,
        classId: classId || undefined,
        studentId: studentId || undefined,
        subjectId: scope.subject?._id,
        standardIds: selected,
        draftIds: selectedDrafts,
        from: applied.from || null,
        to: applied.to || null,
      });
      setAnalysis(data);
      return data;
    } catch (error) {
      const payload = error?.response?.data;
      if (payload?.code === "WRITING_ANALYSIS_DISABLED") {
        toast.error(payload.message);
        setRefreshKey((value) => value + 1);
      } else {
        toast.error(
          creditErrorMessage(error, t) ||
            payload?.message ||
            t("writing:teacher.analysis.failedBody"),
        );
        if (isCreditError(error)) setRefreshKey((value) => value + 1);
      }
      return null;
    } finally {
      setBusy("");
    }
  }, [
    applied,
    classId,
    projectId,
    scope,
    selected,
    selectedDrafts,
    studentId,
    t,
  ]);

  const save = useCallback(
    async ({ silent = false } = {}) => {
      if (!analysis?._id) return null;
      const rows = (analysis.standards || []).flatMap((row) => {
        const draft = values[String(row.standard)] || {};
        const teacherLevel = draft.level ?? null;
        const teacherNote = String(draft.note || "").trim();
        // A cleared level still has to be sent, or the saved one survives.
        if (teacherLevel === null && !teacherNote && row.teacherLevel === null)
          return [];
        return [{ standard: row.standard, teacherLevel, teacherNote }];
      });
      if (!rows.length) {
        if (!silent) toast(t("writing:teacher.analysis.saveHint"));
        return null;
      }
      setBusy("save");
      try {
        const data = await writingService.updateAnalysis(analysis._id, {
          standards: rows,
        });
        setAnalysis(data);
        if (!silent) toast.success(t("writing:teacher.analysis.saved"));
        return data;
      } catch (error) {
        toast.error(
          error?.response?.data?.message ||
            t("writing:teacher.analysis.loadFailed"),
        );
        return null;
      } finally {
        setBusy("");
      }
    },
    [analysis, t, values],
  );

  const setOpportunity = useCallback(
    async ({ standard, draft, opportunity, judgment }) => {
      if (!analysis?._id) return null;
      const previous = evidenceRowOf(analysis, standard, draft);
      setBusy("evidence");
      try {
        const data = await writingService.updateAnalysis(analysis._id, {
          opportunity: [{ standard, draft, opportunity, judgment }],
        });
        setAnalysis(data);
        setLastEvidenceChange({
          standard,
          draft,
          opportunity: Boolean(previous?.opportunity),
          judgment: previous?.judgment || "none",
        });
        return data;
      } catch (error) {
        toast.error(
          error?.response?.data?.message ||
            t("writing:teacher.analysis.loadFailed"),
        );
        return null;
      } finally {
        setBusy("");
      }
    },
    [analysis, t],
  );

  const undoEvidence = useCallback(async () => {
    if (!lastEvidenceChange) return null;
    const data = await setOpportunity(lastEvidenceChange);
    if (data) setLastEvidenceChange(null);
    return data;
  }, [lastEvidenceChange, setOpportunity]);

  const preparePublish = useCallback(async () => {
    if (!analysis?._id) return null;
    const saved = await save({ silent: true });
    if (!saved) return null;
    const hasLevel = (saved.standards || []).some(
      (row) => row.teacherLevel !== null && row.teacherLevel !== undefined,
    );
    if (!hasLevel) {
      toast.error(t("writing:teacher.analysis.publishHint"));
      return null;
    }
    setBusy("preview");
    try {
      const preview = await writingService.getPublishPreview(analysis._id);
      setPublishPreview(preview);
      return preview;
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.analysis.failedBody"),
      );
      return null;
    } finally {
      setBusy("");
    }
  }, [analysis, save, t]);

  const publish = useCallback(
    async ({ confirmOverwrite = false, createMissingColumns = false } = {}) => {
      if (!analysis?._id) return null;
      setBusy("publish");
      try {
        const result = await writingService.publishAnalysis(analysis._id, {
          confirmOverwrite,
          createMissingColumns,
        });
        setAnalysis(result.analysis);
        setConflict(null);
        setPublishPreview(null);
        if ((result.skipped || []).length) {
          toast.success(
            t("writing:teacher.analysis.publishedPartial", {
              n: result.skipped.length,
            }),
          );
        } else {
          toast.success(t("writing:teacher.analysis.publishedTitle"));
        }
        return result;
      } catch (error) {
        const payload = error?.response?.data;
        if (payload?.code === "MANUAL_SCORE_CONFLICT") {
          setConflict(payload.conflicts || []);
        } else if (payload?.code === "NO_GRADEBOOK_COLUMNS") {
          toast.error(t("writing:teacher.analysis.noColumns"));
        } else {
          toast.error(
            payload?.message || t("writing:teacher.analysis.failedBody"),
          );
        }
        return null;
      } finally {
        setBusy("");
      }
    },
    [analysis, t],
  );

  const retry = useCallback(async () => {
    if (!analysis?._id) return null;
    setBusy("retry");
    try {
      const data = await writingService.retryAnalysis(analysis._id);
      setAnalysis(data);
      return data;
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.analysis.failedBody"),
      );
      return null;
    } finally {
      setBusy("");
    }
  }, [analysis, t]);

  const openAnalysis = useCallback(
    async (analysisId) => {
      setAnalysisLoading(true);
      try {
        const data = await writingService.getAnalysis(analysisId);
        setAnalysis(data);
        setConflict(null);
        setPublishPreview(null);
        setLastEvidenceChange(null);
      } catch (error) {
        toast.error(
          error?.response?.data?.message ||
            t("writing:teacher.analysis.loadFailed"),
        );
      } finally {
        setAnalysisLoading(false);
      }
    },
    [t],
  );

  const closeAnalysis = useCallback(() => {
    setAnalysis(null);
    setConflict(null);
    setPublishPreview(null);
    setLastEvidenceChange(null);
  }, []);
  const dismissConflict = useCallback(() => setConflict(null), []);
  const dismissPublishPreview = useCallback(() => setPublishPreview(null), []);

  return {
    analysis,
    analysisLoading,
    applyCustomWindow,
    applied,
    busy,
    chooseWindow,
    clearAll,
    clearAllDrafts,
    closeAnalysis,
    conflict,
    customFrom,
    customTo,
    dismissConflict,
    dismissPublishPreview,
    lastEvidenceChange,
    openAnalysis,
    preparePublish,
    preset,
    publish,
    publishPreview,
    refreshScope: () => setRefreshKey((value) => value + 1),
    retry,
    run,
    save,
    scope,
    scopeError,
    scopeLoading,
    selectAll,
    selectAllDrafts,
    selected,
    selectedDrafts,
    setCustomFrom,
    setCustomTo,
    setLevel,
    setOpportunity,
    toggleDraft,
    toggleStandard,
    undoEvidence,
    applyProposedLevels,
    values,
    onBack: () =>
      navigate(location.state?.from || "/portal/writing/assignments"),
  };
}
