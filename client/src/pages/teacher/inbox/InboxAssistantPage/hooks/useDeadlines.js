import { useCallback, useEffect, useState } from "react";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { errorMessageKey } from "../inboxUi.js";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Proposed and confirmed deadlines for the signed-in teacher. */
export function useDeadlines({ enabled, onError }) {
  const [deadlines, setDeadlines] = useState([]);
  const [state, setState] = useState("idle");
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);

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

  const patch = useCallback(async (deadlineId, body, fallbackKey) => {
    if (savingId) return null;
    setSavingId(deadlineId);
    try {
      const updated = await inboxAssistantService.updateDeadline(deadlineId, body);
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

  const confirm = useCallback(
    (deadlineId) => patch(deadlineId, { state: "confirmed", timeZone: timeZone() }, "deadlines.saveFailed"),
    [patch],
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
      { dueAt, dueDateOnly, timeZone: timeZone() },
      "deadlines.saveFailed",
    ),
    [patch],
  );

  const setReminder = useCallback(
    (deadlineId, remindAt) => patch(deadlineId, { remindAt }, "deadlines.saveFailed"),
    [patch],
  );

  const add = useCallback(async (body) => {
    if (creating) return null;
    setCreating(true);
    try {
      const created = await inboxAssistantService.createDeadline({ ...body, timeZone: timeZone() });
      setDeadlines((current) => [...current, created]);
      return created;
    } catch (error) {
      onError?.(errorMessageKey(error, "deadlines.addFailed"));
      return null;
    } finally {
      setCreating(false);
    }
  }, [creating, onError]);

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
    add,
  };
}

export default useDeadlines;
