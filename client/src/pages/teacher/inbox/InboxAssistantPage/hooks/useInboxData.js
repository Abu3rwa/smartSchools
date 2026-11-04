import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import { errorMessageKey, formatEstimate } from "../inboxUi.js";
import { useInboxEmails } from "./useInboxEmails.js";

export function useInboxData() {
  const { i18n } = useTranslation(["inboxAssistant"]);
  const [status, setStatus] = useState(null);
  const [statusState, setStatusState] = useState("loading");
  const [statusErrorKey, setStatusErrorKey] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [notice, setNotice] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const optedIn = Boolean(status?.optedIn);
  const reportListError = useCallback((key) => setNotice({ key, tone: "error" }), []);
  const emails = useInboxEmails({ enabled: optedIn, onError: reportListError });

  const loadStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatusState((current) => (current === "ready" ? current : "loading"));
    try {
      const data = await inboxAssistantService.getStatus();
      setStatus(data);
      setStatusState("ready");
      setStatusErrorKey("");
      return data;
    } catch (error) {
      setStatusState("error");
      setStatusErrorKey(errorMessageKey(error));
      return null;
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const mergeSettings = useCallback((saved) => {
    setStatus((current) => (current ? {
      ...current,
      optedIn: saved.optedIn,
      lastScanAt: saved.lastScanAt ?? null,
      settings: { ...current.settings, ...saved },
    } : current));
  }, []);

  const saveSettings = useCallback(async (patch, { announce = false } = {}) => {
    setSaving(true);
    try {
      mergeSettings(await inboxAssistantService.updateSettings(patch));
      if (announce) setNotice({ key: "settings.saved", tone: "ok" });
      return true;
    } catch (error) {
      setNotice({ key: errorMessageKey(error), tone: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [mergeSettings]);

  const optIn = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      mergeSettings(await inboxAssistantService.updateSettings({ optedIn: true }));
      return true;
    } catch (error) {
      setNotice({ key: errorMessageKey(error), tone: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [mergeSettings]);

  const requestEstimate = useCallback(async (mode = "refresh", reanalyze = false) => {
    setEstimate(null);
    setNotice(null);
    setEstimating(true);
    try {
      const data = await inboxAssistantService.estimateScan({ mode });
      const entry = { ...data, mode, reanalyze };
      setEstimate(entry);
      return entry;
    } catch (error) {
      setNotice({ key: errorMessageKey(error), tone: "error" });
      return null;
    } finally {
      setEstimating(false);
    }
  }, []);

  const scan = useCallback(async () => {
    if (!estimate) return { outcome: "failed" };
    setScanning(true);
    setNotice(null);
    try {
      const result = await inboxAssistantService.startScan({
        mode: estimate.mode,
        reanalyze: estimate.reanalyze,
        acceptedEstimateCents: estimate.estimateCents,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uiLanguage: String(i18n.language || "").startsWith("ar") ? "ar" : "en",
      });
      setEstimate(null);
      setNotice({
        key: result.charged ? "scan.done" : "scan.doneFree",
        params: { n: result.newCount, cost: formatEstimate(result.estimateCents, i18n.language) },
        tone: "ok",
      });
      await loadStatus({ silent: true });
      await emails.refreshLists();
      return { outcome: "done", result };
    } catch (error) {
      if (error?.response?.data?.code === "ESTIMATE_CHANGED") {
        const data = error.response?.data?.data || {};
        setEstimate((current) => (current ? {
          ...current,
          estimateCents: data.estimateCents ?? current.estimateCents,
          newCount: data.newCount ?? current.newCount,
          skippedCount: data.skippedCount ?? current.skippedCount,
          changed: true,
        } : current));
        return { outcome: "changed" };
      }
      setEstimate(null);
      setNotice({ key: errorMessageKey(error), tone: "error" });
      return { outcome: "failed" };
    } finally {
      setScanning(false);
    }
  }, [estimate, i18n.language, loadStatus, emails]);

  const deleteData = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      await inboxAssistantService.deleteData(true);
      emails.reset();
      setEstimate(null);
      await loadStatus({ silent: true });
      return true;
    } catch (error) {
      setNotice({ key: errorMessageKey(error), tone: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [emails, loadStatus]);

  const connectGoogle = useCallback(async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const authUrl = await inboxAssistantService.googleAuthUrl("inbox");
      if (!authUrl) throw new Error("missing auth url");
      window.location.assign(authUrl);
      return true;
    } catch {
      setNotice({ key: "connect.failed", tone: "error" });
      setConnecting(false);
      return false;
    }
  }, []);

  const credit = useMemo(
    () => ({ balanceCents: status?.creditBalanceCents ?? 0 }),
    [status?.creditBalanceCents],
  );

  return {
    ...emails,
    status,
    statusState,
    statusErrorKey,
    credit,
    optedIn,
    estimate,
    notice,
    setNotice,
    scanning,
    estimating,
    saving,
    connecting,
    loadStatus,
    saveSettings,
    optIn,
    requestEstimate,
    scan,
    deleteData,
    connectGoogle,
  };
}
