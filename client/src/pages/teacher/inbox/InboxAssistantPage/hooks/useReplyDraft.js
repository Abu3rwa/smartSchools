import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import inboxAssistantService from "../../../../../services/inboxAssistantService.js";
import {
  buildDraftPatch,
  errorMessageKey,
  extractPlaceholders,
  hasDraftPatch,
} from "../inboxUi.js";

const SAVE_DELAY_MS = 800;

const uiLanguage = (language) => (String(language || "").startsWith("ar") ? "ar" : "en");

/** One open reply at a time; the draft is PATCHed at most once per 800 ms of edits. */
export function useReplyDraft({ onSent }) {
  const { i18n } = useTranslation(["inboxAssistant"]);
  const [email, setEmail] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [replyTypes, setReplyTypes] = useState([]);
  const [customTypes, setCustomTypes] = useState([]);
  const [typesState, setTypesState] = useState("idle");
  const [estimateCents, setEstimateCents] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [gmailSaving, setGmailSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [errorKey, setErrorKey] = useState("");
  const [noticeKey, setNoticeKey] = useState("");

  const draftRef = useRef(null);
  const savedRef = useRef(null);
  const emailRef = useRef(null);
  const generationRef = useRef(null);
  const openTokenRef = useRef(0);
  const timerRef = useRef(null);
  const chainRef = useRef(Promise.resolve());
  const sendingRef = useRef(false);
  const generatingRef = useRef(false);
  const gmailSavingRef = useRef(false);
  const discardingRef = useRef(false);

  const applyDraft = useCallback((next) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const applySaved = useCallback((next) => {
    savedRef.current = next;
    setSaved(next);
  }, []);

  const persist = useCallback((patch) => {
    const draftId = draftRef.current?.id;
    if (!draftId || !hasDraftPatch(patch)) return Promise.resolve(true);
    const task = chainRef.current
      .then(() => inboxAssistantService.updateDraft(draftId, patch))
      .then((updated) => {
        if (draftRef.current?.id !== draftId) return true;
        applySaved({ ...(savedRef.current || {}), ...patch });
        if (patch.includeCc !== undefined) {
          applyDraft({ ...draftRef.current, to: updated?.to || [], cc: updated?.cc || [] });
        }
        setErrorKey("");
        return true;
      })
      .catch((error) => {
        setErrorKey(errorMessageKey(error, "reply.saveFailed"));
        return false;
      });
    chainRef.current = task;
    return task;
  }, [applyDraft, applySaved]);

  const flushPending = useCallback(() => {
    clearTimeout(timerRef.current);
    const current = draftRef.current;
    const known = savedRef.current;
    if (!current || !known || current.status !== "draft") return chainRef.current;
    return persist(buildDraftPatch(current, known));
  }, [persist]);

  useEffect(() => {
    if (!draft || !saved || draft.status !== "draft") return undefined;
    const patch = buildDraftPatch(draft, saved);
    // The Cc toggle saves itself at once; do not send the same change twice.
    if (patch.includeCc !== undefined && Object.keys(patch).length === 1) return undefined;
    if (!hasDraftPatch(patch)) return undefined;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(patch);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [draft, saved, persist]);

  const loadTypes = useCallback(async () => {
    setTypesState("loading");
    try {
      const data = await inboxAssistantService.getReplyTypes(uiLanguage(i18n.language));
      setReplyTypes(Array.isArray(data?.types) ? data.types : []);
      setCustomTypes(Array.isArray(data?.customTypes) ? data.customTypes : []);
      setTypesState("ready");
    } catch {
      setTypesState("error");
    }
  }, [i18n.language]);

  const loadDetail = useCallback(async (emailId) => {
    setDetailState("loading");
    try {
      const data = await inboxAssistantService.getEmail(emailId);
      setDetail(data);
      setDetailState("ready");
    } catch {
      setDetailState("error");
    }
  }, []);

  const open = useCallback(async (row) => {
    const token = openTokenRef.current + 1;
    openTokenRef.current = token;
    clearTimeout(timerRef.current);
    sendingRef.current = false;
    generatingRef.current = false;
    emailRef.current = row;
    setEmail(row);
    applyDraft(null);
    applySaved(null);
    setDetail(null);
    setDetailState("loading");
    generationRef.current = null;
    setEstimateCents(null);
    setErrorKey("");
    setNoticeKey("");
    setGenerating(false);
    setSending(false);
    setGmailSaving(false);
    setDiscarding(false);
    void loadTypes();

    try {
      const data = await inboxAssistantService.getEmail(row.id);
      if (openTokenRef.current === token) {
        setDetail(data);
        setDetailState("ready");
      }
    } catch {
      if (openTokenRef.current === token) setDetailState("error");
    }

    try {
      const estimate = await inboxAssistantService.estimateDraft(row.id);
      if (openTokenRef.current === token) {
        setEstimateCents(estimate?.estimateCents ?? null);
      }
    } catch {
      if (openTokenRef.current === token) setEstimateCents(null);
    }
  }, [applyDraft, applySaved, loadTypes]);

  const close = useCallback(({ flush = true } = {}) => {
    openTokenRef.current += 1;
    clearTimeout(timerRef.current);
    if (flush) void flushPending();
    emailRef.current = null;
    applyDraft(null);
    applySaved(null);
    setEmail(null);
    setDetail(null);
    setDetailState("idle");
    setErrorKey("");
    setNoticeKey("");
    setSending(false);
    setGenerating(false);
    sendingRef.current = false;
    generatingRef.current = false;
  }, [applyDraft, applySaved, flushPending]);

  const setField = useCallback((name, value) => {
    if (!draftRef.current || draftRef.current.status !== "draft") return;
    applyDraft({ ...draftRef.current, [name]: value });
  }, [applyDraft]);

  const setIncludeCc = useCallback((value) => {
    if (!draftRef.current || draftRef.current.status !== "draft") return;
    if (Boolean(draftRef.current.includeCc) === Boolean(value)) return;
    applyDraft({ ...draftRef.current, includeCc: Boolean(value) });
    void persist({ includeCc: Boolean(value) });
  }, [applyDraft, persist]);

  const writeDraft = useCallback(async (input, { note = "" } = {}) => {
    const target = emailRef.current;
    if (!target || generatingRef.current) return null;
    generatingRef.current = true;
    setGenerating(true);
    setErrorKey("");
    setNoticeKey("");
    try {
      const payload = {
        replyType: input.replyType,
        tone: input.tone,
        ...(note ? { note } : {}),
        ...(input.replyType === "custom" ? { customInstruction: input.customInstruction } : {}),
        ...(["en", "ar"].includes(input.language) ? { language: input.language } : {}),
      };
      const next = await inboxAssistantService.createDraft(target.id, payload);
      if (emailRef.current?.id !== target.id) return null;
      const includeCc = (next.cc || []).length > 0;
      applyDraft({ ...next, includeCc });
      applySaved({ ...next, includeCc });
      generationRef.current = input;
      try {
        const estimate = await inboxAssistantService.estimateDraft(target.id);
        setEstimateCents(estimate?.estimateCents ?? null);
      } catch {
        setEstimateCents(null);
      }
      return next;
    } catch (error) {
      setErrorKey(errorMessageKey(error, "reply.draftFailed"));
      return null;
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [applyDraft, applySaved]);

  const regenerate = useCallback(async (note) => {
    const input = generationRef.current;
    if (!input) return null;
    return writeDraft(input, { note: String(note || "").trim().slice(0, 500) });
  }, [writeDraft]);

  const saveToGmail = useCallback(async () => {
    const current = draftRef.current;
    if (!current || gmailSavingRef.current) return false;
    gmailSavingRef.current = true;
    setGmailSaving(true);
    setErrorKey("");
    setNoticeKey("");
    try {
      const savedFirst = await flushPending();
      if (!savedFirst) return false;
      await inboxAssistantService.saveDraftToGmail(current.id);
      setNoticeKey("reply.savedGmail");
      return true;
    } catch (error) {
      setErrorKey(errorMessageKey(error, "reply.saveGmailFailed"));
      return false;
    } finally {
      gmailSavingRef.current = false;
      setGmailSaving(false);
    }
  }, [flushPending]);

  const send = useCallback(async () => {
    const current = draftRef.current;
    if (!current || sendingRef.current) return false;
    if (extractPlaceholders(current.body).length) {
      setErrorKey("errors.placeholders");
      return false;
    }
    if (!String(current.subject || "").trim() || !String(current.body || "").trim()) {
      setErrorKey("reply.sendBlocked");
      return false;
    }
    sendingRef.current = true;
    setSending(true);
    setErrorKey("");
    try {
      const savedFirst = await flushPending();
      if (!savedFirst) {
        sendingRef.current = false;
        setSending(false);
        return false;
      }
      const latest = draftRef.current;
      await inboxAssistantService.sendDraft(latest.id, {
        confirm: true,
        includeCc: Boolean(latest.includeCc),
      });
      onSent?.();
      close({ flush: false });
      return true;
    } catch (error) {
      setErrorKey(errorMessageKey(error, "reply.sendFailed"));
      sendingRef.current = false;
      setSending(false);
      return false;
    }
  }, [close, flushPending, onSent]);

  const discard = useCallback(async () => {
    const current = draftRef.current;
    if (!current || discardingRef.current) return false;
    discardingRef.current = true;
    setDiscarding(true);
    setErrorKey("");
    try {
      await inboxAssistantService.discardDraft(current.id);
      close({ flush: false });
      return true;
    } catch (error) {
      setErrorKey(errorMessageKey(error, "reply.discardFailed"));
      setDiscarding(false);
      return false;
    } finally {
      discardingRef.current = false;
    }
  }, [close]);

  const saveAsType = useCallback(async ({ label, instruction }) => {
    try {
      const data = await inboxAssistantService.addReplyType({ label, instruction });
      const list = Array.isArray(data?.customReplyTypes) ? data.customReplyTypes : [];
      setCustomTypes(list);
      const added = [...list].reverse().find((type) => (
        type.label === label.trim() && type.instruction === instruction.trim()
      ));
      return added?.id || "";
    } catch (error) {
      setErrorKey(errorMessageKey(error, "reply.typeFailed"));
      return "";
    }
  }, []);

  const retryDetail = useCallback(() => {
    if (emailRef.current) void loadDetail(emailRef.current.id);
  }, [loadDetail]);

  const placeholders = extractPlaceholders(draft?.body);

  return {
    email,
    detail,
    detailState,
    draft,
    replyTypes,
    customTypes,
    typesState,
    estimateCents,
    generating,
    sending,
    gmailSaving,
    discarding,
    errorKey,
    noticeKey,
    placeholders,
    open,
    close,
    retryDetail,
    retryTypes: loadTypes,
    writeDraft,
    regenerate,
    setField,
    setIncludeCc,
    saveToGmail,
    send,
    discard,
    saveAsType,
  };
}

export default useReplyDraft;
