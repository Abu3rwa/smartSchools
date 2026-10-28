import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../../services/writingService.js";

const EMPTY = { project: null, assignment: null, drafts: [], feedback: [], tracker: [], nextAction: null };

export function useWritingWorkspaceData() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["writing"]);

  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState([]);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const dirty = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    writingService.getProject(projectId)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setWorking(payload.project.autosave.sections);
        setTitle(payload.project.autosave.title || "");
        setSavedAt(payload.project.autosave.savedAt);
        setSaveState("idle");
      })
      .catch((error) => {
        if (active) {
          toast.error(error?.response?.data?.message || t("writing:student.loadFailed"));
          navigate("/portal/writing");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt, navigate, projectId, t]);

  const readOnly = useMemo(() => {
    const stage = data.project?.stage;
    return stage === "submitted"
      || stage === "feedback_ready"
      || stage === "ready_for_notebook"
      || stage === "awaiting_notebook_check"
      || stage === "completed";
  }, [data.project?.stage]);

  // What the next save sends; kept in an effect so leaving the page can still flush it.
  const payload = useRef({ title: "", sections: [] });
  useEffect(() => {
    payload.current = { title, sections: working };
  }, [title, working]);

  // Autosave: one request 1200ms after the student stops typing, and only for real changes.
  useEffect(() => {
    if (!dirty.current || readOnly || loading) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      setSaveState("saving");
      try {
        const result = await writingService.autosave(projectId, payload.current);
        setSavedAt(result.savedAt);
        setSaveState("saved");
        setData((current) => ({
          ...current,
          project: { ...current.project, stage: result.stage, wordCount: result.wordCount },
        }));
      } catch (error) {
        setSaveState("idle");
        toast.error(error?.response?.data?.message || t("writing:student.saveFailed"));
      }
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loading, projectId, readOnly, t, title, working]);

  // Navigating away inside the debounce window must not swallow the last keystrokes.
  useEffect(() => () => {
    if (!dirty.current) return;
    dirty.current = false;
    writingService.autosave(projectId, payload.current).catch(() => {});
  }, [projectId]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setSaveState("pending");
  }, []);

  const editSection = useCallback((id, text) => {
    setWorking((current) => current.map((row) => (
      `${row.key}:${row.index}` === id ? { ...row, text } : row
    )));
    markDirty();
  }, [markDirty]);

  const editTitle = useCallback((value) => {
    setTitle(value);
    markDirty();
  }, [markDirty]);

  const addSlot = useCallback((definition) => {
    setWorking((current) => {
      const used = current.filter((row) => row.key === definition.key)
        .map((row) => Number(row.index) || 0);
      const next = used.length ? Math.max(...used) + 1 : 0;
      return [...current, { key: definition.key, index: next, text: "" }];
    });
    markDirty();
  }, [markDirty]);

  const removeSlot = useCallback((id) => {
    setWorking((current) => current.filter((row) => `${row.key}:${row.index}` !== id));
    markDirty();
  }, [markDirty]);

  const submit = useCallback(async () => {
    dirty.current = false;
    if (timer.current) clearTimeout(timer.current);
    setSaveState("idle");
    try {
      return await writingService.submit(projectId, { title, sections: working });
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:student.submitFailed"));
      return null;
    }
  }, [projectId, t, title, working]);

  const markNotebook = useCallback(async () => {
    try {
      await writingService.markNotebookWritten(projectId);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:student.notebookFailed"));
      return false;
    }
  }, [projectId, t]);

  const latestDraft = data.drafts[data.drafts.length - 1] || null;
  const feedback = useMemo(
    () => data.feedback.find((row) => latestDraft && row.draftId === latestDraft.id) || null,
    [data.feedback, latestDraft],
  );

  return {
    addSlot,
    data,
    editSection,
    editTitle,
    feedback,
    latestDraft,
    loading,
    markNotebook,
    onBack: () => navigate("/portal/writing"),
    readOnly,
    reload: () => setAttempt((current) => current + 1),
    removeSlot,
    saveState,
    savedAt,
    submit,
    title,
    working,
  };
}
