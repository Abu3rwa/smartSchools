import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { errorMessageKey } from "../inboxUi.js";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Proposed and confirmed deadlines for the signed-in teacher. */
export function useDeadlines({ enabled, onError }) {
  const { i18n } = useTranslation(["inboxAssistant"]);
  const [deadlines, setDeadlines] = useState([]);
  const [state, setState] = useState("idle");
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);

  const uiLanguage = String(i18n.language || "").startsWith("ar") ? "ar" : "en";

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    try {
      const data = await inboxAssistantService.listDeadlines({ state: "proposed,confirmed" });
      setDeadlines(Array.isArray(data?.deadlines) ? data.deadlines : []);
      setState("ready");
    } catch (error) {
      setState("error");
      onError?.(errorMessageKey(error, "deadlines.loadFailed"));
    }
  }, [onError]);

  useEffect(() => {
    if (!enabled || state !== "idle") return;
    void load();
  }, [enabled, state, load]);

  const reload = useCallback(async () => {
    setState("loading");
    await load();
  }, [load]);

  /** One write at a time, so a second click cannot race the first row's answer. */
  const run = useCallback(async (deadlineId, call, fallbackKey) => {
    if (savingId) return null;
    setSavingId(deadlineId);
    try {
      const updated = await call();
      setDeadlines((current) => current
        .map((deadline) => (deadline.id === updated.id ? updated : deadline))
        .filter((deadline) => deadline.state === "proposed" || deadline.state === "confirmed"));
      return updated;
    } catch (error) {
      onError?.(errorMessageKey(error, fallbackKey));
      return null;
    } finally {
      setSavingId("");
    }
  }, [onError, savingId]);

  const patch = useCallback(
    (deadlineId, body, fallbackKey) => run(
      deadlineId,
      () => inboxAssistantService.updateDeadline(deadlineId, body),
      fallbackKey,
    ),
    [run],
  );

  const confirm = useCallback(
    (deadlineId) => patch(
      deadlineId,
      { state: "confirmed", timeZone: timeZone(), uiLanguage },
      "deadlines.saveFailed",
    ),
    [patch, uiLanguage],
  );

  const dismiss = useCallback(
    (deadlineId) => patch(deadlineId, { state: "dismissed" }, "deadlines.saveFailed"),
    [patch],
  );

  const markDone = useCallback(
    (deadlineId) => patch(deadlineId, { state: "done" }, "deadlines.saveFailed"),
    [patch],
  );

  const updateDue = useCallback(
    (deadlineId, { dueAt, dueDateOnly }) => patch(
      deadlineId,
      { dueAt, dueDateOnly, timeZone: timeZone(), uiLanguage },
      "deadlines.saveFailed",
    ),
    [patch, uiLanguage],
  );

  const setReminder = useCallback(
    (deadlineId, remindAt) => patch(deadlineId, { remindAt }, "deadlines.saveFailed"),
    [patch],
  );

  const addToCalendar = useCallback(
    (deadlineId) => run(
      deadlineId,
      () => inboxAssistantService.addDeadlineToCalendar(deadlineId, { uiLanguage }),
      "calendar.addFailed",
    ),
    [run, uiLanguage],
  );

  /** Undo of an auto-add, and "Remove from calendar"; the app row always survives. */
  const removeFromCalendar = useCallback(
    (deadlineId, dismiss = false) => run(
      deadlineId,
      () => inboxAssistantService.removeDeadlineFromCalendar(deadlineId, dismiss),
      "calendar.removeFailed",
    ),
    [run],
  );

  const decideChange = useCallback(
    (deadlineId, decision) => run(
      deadlineId,
      () => inboxAssistantService.decideDeadlineChange(deadlineId, { decision }),
      "calendar.decideFailed",
    ),
    [run],
  );

  const add = useCallback(async (body) => {
    if (creating) return null;
    setCreating(true);
    try {
      const created = await inboxAssistantService.createDeadline({
        ...body,
        timeZone: timeZone(),
        uiLanguage,
      });
      setDeadlines((current) => [...current, created]);
      return created;
    } catch (error) {
      onError?.(errorMessageKey(error, "deadlines.addFailed"));
      return null;
    } finally {
      setCreating(false);
    }
  }, [creating, onError, uiLanguage]);

  return {
    deadlines,
    state,
    savingId,
    creating,
    reload,
    confirm,
    dismiss,
    markDone,
    updateDue,
    setReminder,
    addToCalendar,
    removeFromCalendar,
    decideChange,
    add,
  };
}

export default useDeadlines;
