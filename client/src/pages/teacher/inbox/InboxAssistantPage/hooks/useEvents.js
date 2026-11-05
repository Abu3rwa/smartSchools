import { useCallback, useEffect, useState } from "react";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { errorMessageKey } from "../inboxUi.js";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const OPEN = (event) => event.state === "proposed" || event.state === "confirmed";

/** Meetings and events the assistant found, plus the ones the teacher adds by hand. */
export function useEvents({ enabled, onError }) {
  const [events, setEvents] = useState([]);
  const [state, setState] = useState("idle");
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    try {
      const data = await inboxAssistantService.listEvents({
        state: "proposed,confirmed",
        timeZone: timeZone(),
      });
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setState("ready");
    } catch (error) {
      setState("error");
      onError?.(errorMessageKey(error, "events.loadFailed"));
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
  const run = useCallback(async (eventId, call, fallbackKey) => {
    if (savingId) return null;
    setSavingId(eventId);
    try {
      const updated = await call();
      setEvents((current) => current
        .map((event) => (event.id === updated.id ? updated : event))
        .filter(OPEN));
      return updated;
    } catch (error) {
      onError?.(errorMessageKey(error, fallbackKey));
      return null;
    } finally {
      setSavingId("");
    }
  }, [onError, savingId]);

  const patch = useCallback(
    (eventId, body, fallbackKey) => run(
      eventId,
      () => inboxAssistantService.updateEvent(eventId, body),
      fallbackKey,
    ),
    [run],
  );

  const confirm = useCallback(
    (eventId) => patch(eventId, { state: "confirmed" }, "events.saveFailed"),
    [patch],
  );

  const dismiss = useCallback(
    (eventId) => patch(eventId, { state: "dismissed" }, "events.saveFailed"),
    [patch],
  );

  const update = useCallback(
    (eventId, body) => patch(eventId, { ...body, timeZone: timeZone() }, "events.saveFailed"),
    [patch],
  );

  const addToCalendar = useCallback(
    (eventId) => run(
      eventId,
      () => inboxAssistantService.addEventToCalendar(eventId),
      "calendar.addFailed",
    ),
    [run],
  );

  /** Undo of an auto-add, and "Remove from calendar"; the app row always survives. */
  const removeFromCalendar = useCallback(
    (eventId, dismissToo = false) => run(
      eventId,
      () => inboxAssistantService.removeEventFromCalendar(eventId, dismissToo),
      "calendar.removeFailed",
    ),
    [run],
  );

  const decideChange = useCallback(
    (eventId, decision) => run(
      eventId,
      () => inboxAssistantService.decideEventChange(eventId, { decision }),
      "calendar.decideFailed",
    ),
    [run],
  );

  const add = useCallback(async (body) => {
    if (creating) return null;
    setCreating(true);
    try {
      const created = await inboxAssistantService.createEvent({ ...body, timeZone: timeZone() });
      setEvents((current) => [...current, created]);
      return created;
    } catch (error) {
      onError?.(errorMessageKey(error, "events.addFailed"));
      return null;
    } finally {
      setCreating(false);
    }
  }, [creating, onError]);

  return {
    events,
    state,
    savingId,
    creating,
    reload,
    confirm,
    dismiss,
    update,
    addToCalendar,
    removeFromCalendar,
    decideChange,
    add,
  };
}

export default useEvents;
