import { useCallback, useEffect, useState } from "react";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { errorMessageKey } from "../inboxUi.js";

const PAGE_SIZE = 25;

export function useSent({ enabled, onError }) {
  const [items, setItems] = useState([]);
  const [state, setState] = useState("idle");
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [emptying, setEmptying] = useState(false);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    try {
      const data = await inboxAssistantService.listSent({ limit: PAGE_SIZE });
      setItems(Array.isArray(data?.sent) ? data.sent : []);
      setNextCursor(data?.nextCursor || null);
      setState("ready");
    } catch (error) {
      setState("error");
      onError?.(errorMessageKey(error, "sent.loadFailed"));
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

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await inboxAssistantService.listSent({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...(Array.isArray(data?.sent) ? data.sent : [])]);
      setNextCursor(data?.nextCursor || null);
    } catch (error) {
      onError?.(errorMessageKey(error, "sent.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, onError]);

  const remove = useCallback(async (sentId) => {
    if (!sentId || deletingId) return false;
    setDeletingId(sentId);
    try {
      await inboxAssistantService.deleteSent(sentId);
      setItems((current) => current.filter((item) => item.id !== sentId));
      return true;
    } catch (error) {
      onError?.(errorMessageKey(error, "sent.deleteFailed"));
      return false;
    } finally {
      setDeletingId("");
    }
  }, [deletingId, onError]);

  const empty = useCallback(async () => {
    if (emptying) return false;
    setEmptying(true);
    try {
      await inboxAssistantService.clearSent();
      setItems([]);
      setNextCursor(null);
      return true;
    } catch (error) {
      onError?.(errorMessageKey(error, "sent.emptyFailed"));
      return false;
    } finally {
      setEmptying(false);
    }
  }, [emptying, onError]);

  return {
    items,
    state,
    nextCursor,
    loadingMore,
    deletingId,
    emptying,
    reload,
    loadMore,
    remove,
    empty,
  };
}

export default useSent;
