import { useCallback, useEffect, useState } from "react";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { INBOX_GROUPS, errorMessageKey } from "../inboxUi.js";

const EMPTY_LIST = Object.freeze({ emails: [], nextCursor: null, state: "idle", errorKey: "" });
const emptyLists = () => ({ needs_reply: EMPTY_LIST, fyi: EMPTY_LIST, ignored: EMPTY_LIST });

/** Group lists live apart from settings so one scan does not reload the other. */
export function useInboxEmails({ enabled, onError }) {
  const [lists, setLists] = useState(emptyLists);
  const [activeGroup, setActiveGroup] = useState("needs_reply");
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  const loadGroup = useCallback(async (group, { quiet = false } = {}) => {
    if (!INBOX_GROUPS.includes(group)) return;
    setLists((current) => ({
      ...current,
      [group]: quiet && current[group].state === "ready"
        ? { ...current[group], errorKey: "" }
        : { ...current[group], state: "loading", errorKey: "" },
    }));
    try {
      const data = await inboxAssistantService.listEmails({ group, limit: 50 });
      setLists((current) => ({
        ...current,
        [group]: {
          emails: Array.isArray(data?.emails) ? data.emails : [],
          nextCursor: data?.nextCursor || null,
          state: "ready",
          errorKey: "",
        },
      }));
    } catch (error) {
      setLists((current) => ({
        ...current,
        [group]: { ...current[group], state: "error", errorKey: errorMessageKey(error) },
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadGroup(activeGroup);
  }, [enabled, activeGroup, loadGroup]);

  useEffect(() => {
    if (!enabled || !ignoredOpen) return;
    void loadGroup("ignored", { quiet: true });
  }, [enabled, ignoredOpen, loadGroup]);

  const refreshLists = useCallback(async () => {
    const groups = new Set([activeGroup]);
    if (ignoredOpen) groups.add("ignored");
    await Promise.all([...groups].map((group) => loadGroup(group, { quiet: true })));
  }, [activeGroup, ignoredOpen, loadGroup]);

  const markEmail = useCallback(async (emailId, nextStatus) => {
    try {
      await inboxAssistantService.updateEmail(emailId, { status: nextStatus });
      setLists((current) => Object.fromEntries(
        Object.entries(current).map(([group, list]) => [
          group,
          { ...list, emails: list.emails.filter((email) => email.id !== emailId) },
        ]),
      ));
      return true;
    } catch {
      onError("row.saveFailed");
      return false;
    }
  }, [onError]);

  const reset = useCallback(() => {
    setLists(emptyLists());
    setIgnoredOpen(false);
  }, []);

  return {
    lists,
    activeGroup,
    setActiveGroup,
    ignoredOpen,
    setIgnoredOpen,
    loadGroup,
    refreshLists,
    markEmail,
    reset,
  };
}
