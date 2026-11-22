import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineSparkles,
  HiOutlineXMark,
} from "react-icons/hi2";
import api from "../../../config/api";
import { fetchClasses, selectClasses } from "../../../store/slices/classSlice";
import { fetchSubjects, selectSubjects } from "../../../store/slices/subjectSlice";
import liveLessonBuilderService from "../../../services/liveLessonBuilderService";
import aiCreditService from "../../../services/aiCreditService";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import {
  allItemsReady,
  balanceCredits,
  buildSourceFormData,
  costCredits,
  createDefaultSetup,
  draftFromResponse,
  draftToSetup,
  errorCode,
  errorCopy,
  formatNumber,
  newOpKey,
  nextGenerationBatch,
  outlineCounts,
  progressStats,
  setupFormValues,
  setupPatchBody,
  sourceStats,
  stageFromDraft,
  subjectsForClass,
  validateFiles,
  validateSetup,
} from "./liveLessonBuilderForm";
import BuilderSourceStep from "./BuilderSourceStep.jsx";
import BuilderPlanStep from "./BuilderPlanStep.jsx";
import BuilderSlidesStep from "./BuilderSlidesStep.jsx";
import BuilderApproveStep from "./BuilderApproveStep.jsx";
import BuilderItemDialog from "./BuilderItemDialog.jsx";
import BuilderSlideDialog from "./BuilderSlideDialog.jsx";
import BuilderEnhanceDialog from "./BuilderEnhanceDialog.jsx";
import BuilderConfirmDialog from "./BuilderConfirmDialog.jsx";
import BuilderDialog from "./BuilderDialog.jsx";
import {
  readSourceCopy,
  removeSourceCopy,
  updateSourceCopy,
  writeSourceCopy,
} from "./liveLessonSourceCache";
import "./LiveLessonBuilderPage.css";

const STEP_KEYS = ["source", "plan", "slides", "approve"];

const BLOCKED_REASONS = {
  platform_disabled: "entry.disabledPlatform",
  role_not_allowed: "entry.disabledRole",
  school_disabled: "entry.disabledSchool",
  model_unpriced: "entry.disabledModel",
};

const PENDING_KEY = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const LiveLessonBuilderPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { draftId: routeDraftId } = useParams();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const { t, i18n } = useFeatureNamespaces("liveLessonBuilder");
  const locale = i18n.language || "en";
  const tRef = useRef(t);
  tRef.current = t;

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [aiBuilder, setAiBuilder] = useState({
    available: true,
    reason: null,
  });
  const [palettes, setPalettes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [setup, setSetup] = useState(createDefaultSetup);
  const [pastedText, setPastedText] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [step, setStep] = useState("source");
  const [quote, setQuote] = useState(null);
  const [balanceCents, setBalanceCents] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generatingIds, setGeneratingIds] = useState([]);
  const [stopRequested, setStopRequested] = useState(false);
  const [regeneratingItemId, setRegeneratingItemId] = useState("");
  const [approvedLessonId, setApprovedLessonId] = useState("");
  const [approveForm, setApproveForm] = useState({
    classId: "",
    subjectId: "",
    title: "",
    description: "",
    answersChecked: false,
  });
  const [suggestingTitle, setSuggestingTitle] = useState(false);
  const [titleSuggested, setTitleSuggested] = useState(false);
  const [titleSuggestionError, setTitleSuggestionError] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(Boolean(routeDraftId));
  const [sourceRestored, setSourceRestored] = useState(false);

  const draftRef = useRef(null);
  const setupRef = useRef(setup);
  const pastedRef = useRef("");
  const pendingRef = useRef([]);
  const mountedRef = useRef(true);
  const writeChainRef = useRef(Promise.resolve());
  const lastSavedSetupRef = useRef("");
  const lastSavedTextRef = useRef("");
  const generatingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const currentOpRef = useRef("");

  const queueWrite = useCallback((task) => {
    const run = writeChainRef.current.then(task, task);
    writeChainRef.current = run.catch(() => {});
    return run;
  }, []);

  const updateSetup = useCallback((changes) => {
    setSetup((current) => {
      const next =
        typeof changes === "function" ? changes(current) : { ...current, ...changes };
      setupRef.current = next;
      return next;
    });
  }, []);

  const updatePastedText = useCallback((text) => {
    pastedRef.current = text;
    setPastedText(text);
  }, []);

  const updatePendingFiles = useCallback((updater) => {
    setPendingFiles((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      pendingRef.current = next;
      return next;
    });
  }, []);

  const applyResponse = useCallback(
    (data) => {
      if (!data?.draft) return;
      draftRef.current = data.draft;
      setDraft(data.draft);
      setActiveIndex((index) =>
        Math.min(index, Math.max(0, (data.draft.items?.length || 1) - 1)),
      );
      if (data.suggestedTitle && !setupRef.current.title) {
        updateSetup({ title: data.suggestedTitle });
        setTitleSuggested(true);
      }
      if (data.draft.status === "approved" && data.draft.resultLessonId) {
        setApprovedLessonId(String(data.draft.resultLessonId));
      }
    },
    [updateSetup],
  );

  const applyCreated = useCallback(
    (data) => {
      if (!data?.draft?._id) return null;
      applyResponse(data);
      lastSavedSetupRef.current = JSON.stringify(setupFormValues(setupRef.current));
      lastSavedTextRef.current = pastedRef.current;
      navigate(`/portal/live-lessons/ai-builder/${data.draft._id}`, { replace: true });
      return data.draft;
    },
    [applyResponse, navigate],
  );

  const refreshQuote = useCallback(async (view) => {
    const id = view?._id || draftRef.current?._id;
    if (!id) return;
    try {
      const data = await liveLessonBuilderService.quote(id, {});
      if (mountedRef.current) setQuote(data.quote || null);
    } catch {
      // The quote is advisory; the server still prices every charge.
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const summary = await aiCreditService.getSummary();
      if (mountedRef.current && summary) {
        setBalanceCents(Number(summary.balanceCents) || 0);
      }
    } catch {
      // An unknown balance shows as a neutral chip, never as a fake zero.
    }
  }, []);

  // The API holds the extracted text in memory only. A browser copy with the
  // same fingerprint can put it back after a restart; the server enforces the
  // match, so a stale copy is refused instead of becoming a different lesson.
  const restoreCachedSource = useCallback(async (view, { force = false } = {}) => {
    const draftId = String(view?._id || "");
    const meta = view?.setup || {};
    if (!draftId || (!force && meta.hasSource)) return false;
    if (!meta.sourceHash) return false;
    if (!(Number(meta.pastedChars) > 0 || (meta.files?.length || 0) > 0)) return false;
    const copy = readSourceCopy(draftId);
    if (!copy || copy.textHash !== meta.sourceHash) return false;
    try {
      await liveLessonBuilderService.restoreSource(draftId, {
        pastedText: copy.pastedText,
        files: copy.files,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const syncRestoredDraft = useCallback(
    async (draftId) => {
      if (mountedRef.current) setSourceRestored(true);
      try {
        const response = await liveLessonBuilderService.getDraft(draftId);
        if (response?.draft && mountedRef.current) applyResponse(response);
      } catch {
        // The source is back; the next save refreshes the rest of the view.
      }
    },
    [applyResponse],
  );

  const callWithSourceRestore = useCallback(
    async (run) => {
      try {
        return await run();
      } catch (requestError) {
        if (errorCode(requestError) !== "SOURCE_UNAVAILABLE") throw requestError;
        const current = draftRef.current;
        if (!current) throw requestError;
        const restored = await restoreCachedSource(current, { force: true });
        if (!restored) throw requestError;
        await syncRestoredDraft(current._id);
        return run();
      }
    },
    [restoreCachedSource, syncRestoredDraft],
  );

  const cacheSourceFromServer = useCallback(async (draftId) => {
    if (!draftId) return;
    try {
      const source = await liveLessonBuilderService.getSource(draftId);
      writeSourceCopy({
        draftId: String(draftId),
        textHash: source.textHash || draftRef.current?.setup?.sourceHash || "",
        pastedText: source.pastedText || "",
        files: (source.files || []).map((file) => ({
          fileId: String(file.fileId || ""),
          text: file.text || "",
        })),
      });
    } catch {
      // A missing copy only costs a re-upload after a restart; generation still works.
    }
  }, []);

  const patchSourceCopyFromDraft = useCallback(
    (view) => {
      const draftId = String(view?._id || "");
      const textHash = String(view?.setup?.sourceHash || "");
      if (!draftId || !textHash) return;
      const existing = readSourceCopy(draftId);
      if (!existing) {
        void cacheSourceFromServer(draftId);
        return;
      }
      updateSourceCopy(draftId, { textHash, pastedText: pastedRef.current });
    },
    [cacheSourceFromServer],
  );

  const ensureDraft = useCallback(async () => {
    if (draftRef.current) return draftRef.current;
    const text = pastedRef.current;
    if (!text.trim()) return null;
    const data = await liveLessonBuilderService.createDraft(
      buildSourceFormData({
        setup: setupRef.current,
        pastedText: text,
        includeSetup: true,
      }),
    );
    return applyCreated(data);
  }, [applyCreated]);

  // Settings own the entry gate; the server repeats every check on each call.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api.get("/live/settings");
        const data = response.data?.data || {};
        if (!active) return;
        setAiBuilder(
          data.aiBuilder || { available: false, reason: "platform_disabled" },
        );
        setPalettes(Array.isArray(data.palettes) ? data.palettes : []);
      } catch (requestError) {
        if (!active) return;
        setAiBuilder({ available: false, reason: "platform_disabled" });
        setError(
          requestError.response?.data?.message ||
            tRef.current("entry.disabledPlatform"),
        );
      } finally {
        if (active) setSettingsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    dispatch(fetchClasses({ limit: "all" }));
    dispatch(fetchSubjects({ limit: "all" }));
    void refreshBalance();
  }, [dispatch, refreshBalance]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded || !aiBuilder.available) return;
    if (routeDraftId && draftRef.current?._id === routeDraftId) {
      setLoadingDraft(false);
      return;
    }
    if (!routeDraftId) {
      setLoadingDraft(false);
      return;
    }
    let active = true;
    setLoadingDraft(true);
    (async () => {
      try {
        const response = await liveLessonBuilderService.getDraft(routeDraftId);
        const loaded = draftFromResponse(response);
        if (!active || !mountedRef.current) return;
        if (!loaded || loaded.status === "discarded") {
          setError(tRef.current("errors.DRAFT_NOT_FOUND"));
          navigate("/portal/live-lessons/ai-builder", { replace: true });
          return;
        }
        draftRef.current = loaded;
        setDraft(loaded);
        const loadedSetup = draftToSetup(loaded);
        setupRef.current = loadedSetup;
        setSetup(loadedSetup);
        lastSavedSetupRef.current = JSON.stringify(
          setupFormValues(loadedSetup),
        );
        setActiveIndex(0);
        setApprovedLessonId(
          loaded.status === "approved" && loaded.resultLessonId
            ? String(loaded.resultLessonId)
            : "",
        );
        setStep(stageFromDraft(loaded));
        void refreshQuote(loaded);
        const expectsSource =
          loaded.setup?.hasSource === false &&
          (Number(loaded.setup?.pastedChars) > 0 ||
            (loaded.setup?.files?.length || 0) > 0);
        if (expectsSource && (await restoreCachedSource(loaded))) {
          if (!active || !mountedRef.current) return;
          setSourceRestored(true);
          try {
            const freshResponse = await liveLessonBuilderService.getDraft(routeDraftId);
            if (active && mountedRef.current && freshResponse?.draft) {
              applyResponse(freshResponse);
            }
          } catch {
            // The restored text is usable even if the view refresh fails.
          }
        }
        try {
          const source = await liveLessonBuilderService.getSource(routeDraftId);
          if (!active || !mountedRef.current) return;
          pastedRef.current = source.pastedText || "";
          lastSavedTextRef.current = source.pastedText || "";
          setPastedText(source.pastedText || "");
          writeSourceCopy({
            draftId: routeDraftId,
            textHash: source.textHash || loaded.setup?.sourceHash || "",
            pastedText: source.pastedText || "",
            files: (source.files || []).map((file) => ({
              fileId: String(file.fileId || ""),
              text: file.text || "",
            })),
          });
        } catch {
          // A source that cannot be read leaves the paste box empty; files
          // still appear from the draft view.
        }
      } catch (requestError) {
        if (!active || !mountedRef.current) return;
        setError(errorCopy(tRef.current, requestError));
        draftRef.current = null;
        setDraft(null);
        setStep("source");
        navigate("/portal/live-lessons/ai-builder", { replace: true });
      } finally {
        if (active && mountedRef.current) setLoadingDraft(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    settingsLoaded,
    aiBuilder.available,
    routeDraftId,
    navigate,
    refreshQuote,
    restoreCachedSource,
    applyResponse,
  ]);

  const sourceLocked = Boolean(
    draft && (draft.items?.length > 0 || draft.status !== "setup"),
  );

  // Setup edits are saved in one queue with the source writes, so two requests
  // can never race for the same draft version.
  useEffect(() => {
    if (!settingsLoaded || !aiBuilder.available) return undefined;
    if (sourceLocked || busyAction) return undefined;
    const values = JSON.stringify(setupFormValues(setup));
    if (!draftRef.current || values === lastSavedSetupRef.current) return undefined;
    const timer = window.setTimeout(() => {
      void queueWrite(async () => {
        const current = draftRef.current;
        if (!current || current.items?.length || current.status !== "setup") return;
        setSaveState("saving");
        const data = await liveLessonBuilderService.updateSetup(
          current._id,
          setupPatchBody(setupRef.current, current.version),
        );
        applyResponse(data);
        lastSavedSetupRef.current = JSON.stringify(
          setupFormValues(setupRef.current),
        );
        if (mountedRef.current) setSaveState("saved");
        await refreshQuote(draftRef.current);
      }).catch((requestError) => {
        if (!mountedRef.current) return;
        setSaveState("error");
        setError(errorCopy(t, requestError));
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    setup,
    settingsLoaded,
    aiBuilder.available,
    sourceLocked,
    busyAction,
    queueWrite,
    applyResponse,
    refreshQuote,
    t,
  ]);

  useEffect(() => {
    if (!settingsLoaded || !aiBuilder.available) return undefined;
    if (sourceLocked || busyAction) return undefined;
    if (pastedText === lastSavedTextRef.current) return undefined;
    const draftExists = Boolean(draftRef.current);
    if (!draftExists && !pastedText.trim()) return undefined;
    const timer = window.setTimeout(() => {
      void queueWrite(async () => {
        if (!draftRef.current) {
          const data = await liveLessonBuilderService.createDraft(
            buildSourceFormData({
              setup: setupRef.current,
              pastedText: pastedRef.current,
              includeSetup: true,
            }),
          );
          const created = applyCreated(data);
          void cacheSourceFromServer(created?._id);
          return;
        }
        if (draftRef.current.items?.length || draftRef.current.status !== "setup") {
          return;
        }
        setSaveState("saving");
        const data = await liveLessonBuilderService.appendSource(
          draftRef.current._id,
          buildSourceFormData({
            setup: setupRef.current,
            pastedText: pastedRef.current,
            includeSetup: false,
          }),
        );
        applyResponse(data);
        lastSavedTextRef.current = pastedRef.current;
        patchSourceCopyFromDraft(draftRef.current);
        if (mountedRef.current) setSaveState("saved");
        await refreshQuote(draftRef.current);
      }).catch((requestError) => {
        if (!mountedRef.current) return;
        setSaveState("error");
        setError(errorCopy(t, requestError));
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    pastedText,
    settingsLoaded,
    aiBuilder.available,
    sourceLocked,
    busyAction,
    queueWrite,
    applyCreated,
    applyResponse,
    refreshQuote,
    cacheSourceFromServer,
    patchSourceCopyFromDraft,
    t,
  ]);

  const handleSetupChange = (changes) => {
    setTitleSuggestionError("");
    updateSetup(changes);
  };

  const handleBack = () => {
    const hasWork = Boolean(
      draft || pastedRef.current.trim() || pendingRef.current.length,
    );
    if (!hasWork || approvedLessonId) {
      navigate("/portal/live-lessons");
      return;
    }
    setDialog({ type: "confirm", variant: "leave" });
  };

  const handlePlan = async (replace = false) => {
    if (busyAction) return;
    if (sourceLocked) {
      setStep("plan");
      return;
    }
    const validation = validateSetup(setupRef.current);
    if (validation) {
      setError(t(`errors.${validation}`));
      return;
    }
    if (!setupRef.current.title.trim()) {
      setError(t("errors.validation.titleRequired"));
      return;
    }
    if (!setupRef.current.attestationNoStudentData) {
      setError(t("errors.ATTESTATION_REQUIRED"));
      return;
    }
    if (
      !pastedRef.current.trim() &&
      !pendingRef.current.length &&
      !draftRef.current?.setup?.hasSource
    ) {
      setError(t("errors.validation.sourceRequired"));
      return;
    }
    setError("");
    setBusyAction(replace ? "plan-replace" : "plan");
    try {
      await queueWrite(async () => {
        const view = await ensureDraft();
        if (!view) throw new Error("SOURCE_REQUIRED");
        if (pastedRef.current !== lastSavedTextRef.current) {
          setSaveState("saving");
          const sourceData = await liveLessonBuilderService.appendSource(
            draftRef.current._id,
            buildSourceFormData({
              setup: setupRef.current,
              pastedText: pastedRef.current,
              includeSetup: false,
            }),
          );
          applyResponse(sourceData);
          lastSavedTextRef.current = pastedRef.current;
          patchSourceCopyFromDraft(draftRef.current);
        }
        if (
          JSON.stringify(setupFormValues(setupRef.current)) !==
          lastSavedSetupRef.current
        ) {
          setSaveState("saving");
          const setupData = await liveLessonBuilderService.updateSetup(
            draftRef.current._id,
            setupPatchBody(setupRef.current, draftRef.current.version),
          );
          applyResponse(setupData);
          lastSavedSetupRef.current = JSON.stringify(
            setupFormValues(setupRef.current),
          );
        }
        const data = await callWithSourceRestore(() =>
          liveLessonBuilderService.generatePlan(draftRef.current._id, {
            opKey: newOpKey("plan"),
            version: draftRef.current.version,
            confirmReplace: replace || Boolean(draftRef.current.items?.length),
          }),
        );
        applyResponse(data);
        if (mountedRef.current) {
          setSaveState("saved");
          setStep("plan");
          setActiveIndex(0);
        }
      });
      await refreshQuote(draftRef.current);
      await refreshBalance();
    } catch (requestError) {
      if (requestError?.message === "SOURCE_REQUIRED") {
        setError(t("errors.validation.sourceRequired"));
      } else {
        setError(errorCopy(t, requestError));
      }
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const startGeneration = async () => {
    if (generatingRef.current) return;
    const current = draftRef.current;
    if (!current?.items?.length) {
      setError(t("errors.validation.noPlan"));
      return;
    }
    setStep("slides");
    if (!current.items.some((item) => item.status !== "ready")) return;
    generatingRef.current = true;
    stopRequestedRef.current = false;
    setGenerating(true);
    setStopRequested(false);
    setBusyAction("generate");
    setError("");
    const attempted = new Set();
    try {
      await queueWrite(async () => {
        for (;;) {
          if (stopRequestedRef.current || !mountedRef.current) break;
          const live = draftRef.current;
          if (!live) break;
          const chunk = nextGenerationBatch(live, attempted);
          if (!chunk.length) break;
          if (mountedRef.current) setGeneratingIds(chunk);
          const opKey = newOpKey("gen");
          currentOpRef.current = opKey;
          let data = null;
          try {
            data = await callWithSourceRestore(() =>
              liveLessonBuilderService.generateContent(live._id, {
                itemIds: chunk,
                opKey,
                version: live.version,
              }),
            );
          } catch (requestError) {
            chunk.forEach((itemId) => attempted.add(itemId));
            if (mountedRef.current) setError(errorCopy(t, requestError));
            if (
              [
                "AI_CREDIT_REQUIRED",
                "OPERATION_IN_PROGRESS",
                "VERSION_CONFLICT",
                "AI_BUILDER_DISABLED",
                "FEATURE_DISABLED",
                "MODEL_UNPRICED",
                "DRAFT_NOT_FOUND",
              ].includes(errorCode(requestError))
            ) {
              break;
            }
            continue;
          }
          applyResponse(data);
          const results = Array.isArray(data?.results) ? data.results : [];
          for (const itemId of chunk) {
            const row = results.find((entry) => entry.itemId === itemId);
            if (!row || !row.ok) attempted.add(itemId);
          }
          if (mountedRef.current) setGeneratingIds([]);
          await refreshQuote(draftRef.current);
        }
      });
    } finally {
      generatingRef.current = false;
      currentOpRef.current = "";
      if (mountedRef.current) {
        setGenerating(false);
        setGeneratingIds([]);
        setStopRequested(false);
        setBusyAction("");
      }
      void refreshBalance();
    }
  };

  const handleStop = () => {
    if (!generatingRef.current) return;
    stopRequestedRef.current = true;
    setStopRequested(true);
    const opKey = currentOpRef.current;
    if (opKey && draftRef.current) {
      liveLessonBuilderService
        .cancelOperation(draftRef.current._id, opKey)
        .catch(() => {});
    }
  };

  const handleSuggestTitle = async () => {
    if (suggestingTitle || sourceLocked) return;
    if (
      !pastedRef.current.trim() &&
      !pendingRef.current.length &&
      !draftRef.current?.setup?.hasSource
    ) {
      setTitleSuggestionError(t("source.suggestEmpty"));
      return;
    }
    setSuggestingTitle(true);
    setTitleSuggestionError("");
    try {
      await queueWrite(async () => {
        const view = await ensureDraft();
        if (!view) throw new Error("SOURCE_REQUIRED");
        const data = await callWithSourceRestore(() =>
          liveLessonBuilderService.suggestTitle(view._id),
        );
        if (data?.title) {
          updateSetup({ title: data.title });
          if (mountedRef.current) setTitleSuggested(true);
        } else if (mountedRef.current) {
          setTitleSuggestionError(t("source.suggestEmpty"));
        }
      });
    } catch (requestError) {
      if (mountedRef.current) {
        setTitleSuggestionError(
          requestError?.message === "SOURCE_REQUIRED"
            ? t("source.suggestEmpty")
            : errorCopy(t, requestError),
        );
      }
    } finally {
      if (mountedRef.current) setSuggestingTitle(false);
    }
  };

  const handleFilesPicked = async (files) => {
    if (sourceLocked || busyAction === "source") return;
    const existing =
      (draftRef.current?.setup?.files?.length || 0) + pendingRef.current.length;
    const { accepted, errors } = validateFiles(files, existing);
    if (errors.length) {
      setError(errors.map((entry) => t(`errors.${entry.key}`, entry.params)).join(" "));
    }
    if (!accepted.length) return;
    const entries = accepted.map((file) => ({
      key: PENDING_KEY(),
      file,
      error: "",
    }));
    updatePendingFiles((current) => [...current, ...entries]);
    setBusyAction("source");
    setError("");
    try {
      await queueWrite(async () => {
        setSaveState("saving");
        let data;
        if (!draftRef.current) {
          data = await liveLessonBuilderService.createDraft(
            buildSourceFormData({
              setup: setupRef.current,
              pastedText: pastedRef.current,
              files: accepted,
              includeSetup: true,
            }),
          );
          applyCreated(data);
          lastSavedTextRef.current = pastedRef.current;
        } else {
          data = await liveLessonBuilderService.appendSource(
            draftRef.current._id,
            buildSourceFormData({
              setup: setupRef.current,
              files: accepted,
              includeSetup: false,
            }),
          );
          applyResponse(data);
        }
        const keys = new Set(entries.map((entry) => entry.key));
        updatePendingFiles((current) =>
          current.filter((entry) => !keys.has(entry.key)),
        );
        void cacheSourceFromServer(draftRef.current?._id);
        if (mountedRef.current) setSaveState("saved");
        await refreshQuote(draftRef.current);
      });
    } catch (requestError) {
      const message = errorCopy(t, requestError);
      const keys = new Set(entries.map((entry) => entry.key));
      updatePendingFiles((current) =>
        current.map((entry) =>
          keys.has(entry.key) ? { ...entry, error: message } : entry,
        ),
      );
      if (mountedRef.current) {
        setSaveState("error");
        setError(message);
      }
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const removeServerFile = async (fileId) => {
    if (!draftRef.current || sourceLocked || busyAction) return;
    setBusyAction("source");
    setError("");
    try {
      await queueWrite(async () => {
        setSaveState("saving");
        const data = await liveLessonBuilderService.removeSourceFile(
          draftRef.current._id,
          fileId,
        );
        applyResponse(data);
        void cacheSourceFromServer(draftRef.current?._id);
        if (mountedRef.current) setSaveState("saved");
        await refreshQuote(draftRef.current);
      });
    } catch (requestError) {
      if (mountedRef.current) {
        setSaveState("error");
        setError(errorCopy(t, requestError));
      }
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const removePendingFile = (key) => {
    updatePendingFiles((current) => current.filter((entry) => entry.key !== key));
  };

  const runItemOps = async (ops) => {
    if (!draftRef.current || busyAction) return;
    setBusyAction("items");
    setError("");
    try {
      await queueWrite(async () => {
        const data = await liveLessonBuilderService.updateItems(
          draftRef.current._id,
          { version: draftRef.current.version, ops },
        );
        applyResponse(data);
      });
    } catch (requestError) {
      if (mountedRef.current) setError(errorCopy(t, requestError));
      throw requestError;
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const moveItem = (itemId, toIndex) => {
    const items = draftRef.current?.items || [];
    if (toIndex < 0 || toIndex >= items.length) return;
    void runItemOps([{ op: "move", itemId, toIndex }]).catch(() => {});
  };

  const saveItemDialog = async (values) => {
    const current = dialog?.item || null;
    const ops = [];
    if (!current) {
      ops.push({
        op: "add",
        kind: values.kind,
        slideType: values.slideType,
        questionKind: values.questionKind,
        title: values.title,
        brief: values.brief,
        toIndex: dialog?.toIndex ?? (draftRef.current?.items?.length || 0),
      });
    } else {
      ops.push({
        op: "retitle",
        itemId: current.itemId,
        title: values.title,
        brief: values.brief,
      });
      if (values.kind === "slide" && values.slideType !== current.slideType) {
        ops.push({
          op: "retype",
          itemId: current.itemId,
          slideType: values.slideType,
        });
      }
      if (
        values.kind === "question" &&
        values.questionKind !== current.questionKind
      ) {
        ops.push({
          op: "retype",
          itemId: current.itemId,
          questionKind: values.questionKind,
        });
      }
    }
    await runItemOps(ops);
    setDialog(null);
  };

  const saveSlideContent = async (content) => {
    const item = dialog?.item;
    if (!item || !draftRef.current) return;
    setBusyAction("item-save");
    setError("");
    try {
      await queueWrite(async () => {
        const data = await liveLessonBuilderService.updateItem(
          draftRef.current._id,
          item.itemId,
          { rev: item.rev, content },
        );
        applyResponse(data);
      });
      setDialog(null);
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const saveSlideTexts = async (texts) => {
    const item = dialog?.item;
    if (!item || !draftRef.current) return;
    setBusyAction("item-save");
    setError("");
    try {
      await queueWrite(async () => {
        const data = await liveLessonBuilderService.updateItemTexts(
          draftRef.current._id,
          item.itemId,
          { rev: item.rev, texts },
        );
        applyResponse(data);
      });
      setDialog(null);
    } catch (requestError) {
      // Another tab saved this slide first: reload the draft and reopen the
      // editor on the stored revision instead of retrying over it.
      if (errorCode(requestError) === "REV_CONFLICT" && draftRef.current) {
        try {
          const freshResponse = await liveLessonBuilderService.getDraft(
            draftRef.current._id,
          );
          const fresh = draftFromResponse(freshResponse);
          if (fresh) {
            applyResponse(freshResponse);
            const row = fresh.items?.find((entry) => entry.itemId === item.itemId);
            if (row) setDialog({ type: "slide", item: row });
          }
        } catch {
          // The page banner already explains the conflict; the draft stays open.
        }
      }
      if (mountedRef.current) setError(errorCopy(t, requestError));
      throw requestError;
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const submitEnhance = async ({ instruction, presets, keepText }) => {
    const item = dialog?.item;
    if (!item || !draftRef.current) return;
    setDialog(null);
    setBusyAction("regen");
    setRegeneratingItemId(item.itemId);
    setError("");
    try {
      await queueWrite(async () => {
        const data = await callWithSourceRestore(() =>
          liveLessonBuilderService.regenerateItem(
            draftRef.current._id,
            item.itemId,
            {
              opKey: newOpKey("regen"),
              instruction,
              presets,
              keepText,
            },
          ),
        );
        applyResponse(data);
      });
      await refreshQuote(draftRef.current);
      await refreshBalance();
    } catch (requestError) {
      if (mountedRef.current) setError(errorCopy(t, requestError));
    } finally {
      if (mountedRef.current) {
        setBusyAction("");
        setRegeneratingItemId("");
      }
    }
  };

  const undoItem = (item) => {
    if (!item || busyAction) return;
    setBusyAction("undo");
    setError("");
    void queueWrite(async () => {
      const data = await liveLessonBuilderService.undoItem(
        draftRef.current._id,
        item.itemId,
      );
      applyResponse(data);
    })
      .catch((requestError) => {
        if (mountedRef.current) setError(errorCopy(t, requestError));
      })
      .finally(() => {
        if (mountedRef.current) setBusyAction("");
      });
  };

  const openApprove = () => {
    if (!draft || !allItemsReady(draft.items || [])) {
      setError(t("approve.notReady"));
      return;
    }
    setError("");
    setStep("approve");
  };

  const subjectOptions = useMemo(() => {
    const classItem = classes.find(
      (entry) => String(entry._id) === String(approveForm.classId),
    );
    return subjectsForClass(classItem, subjects);
  }, [classes, subjects, approveForm.classId]);

  useEffect(() => {
    if (step !== "approve" || approvedLessonId) return;
    setApproveForm((current) => {
      if (current.classId) {
        return current.title === setup.title
          ? current
          : { ...current, title: current.title || setup.title };
      }
      const firstClass = classes[0];
      const options = subjectsForClass(firstClass, subjects);
      return {
        classId: String(firstClass?._id || ""),
        subjectId: String(options[0]?._id || ""),
        title: setup.title,
        description: "",
        answersChecked: false,
      };
    });
  }, [step, approvedLessonId, classes, subjects, setup.title]);

  const changeApproveForm = (changes) => {
    if (Object.prototype.hasOwnProperty.call(changes, "classId")) {
      const classItem = classes.find(
        (entry) => String(entry._id) === String(changes.classId),
      );
      const options = subjectsForClass(classItem, subjects);
      setApproveForm((current) => ({
        ...current,
        classId: changes.classId,
        subjectId: String(options[0]?._id || ""),
      }));
      return;
    }
    setApproveForm((current) => ({ ...current, ...changes }));
  };

  const submitApprove = async () => {
    if (!draftRef.current || busyAction) return;
    if (!approveForm.answersChecked) {
      setError(t("approve.needChecked"));
      return;
    }
    if (!approveForm.classId || !approveForm.subjectId) {
      setError(t("approve.needClass"));
      return;
    }
    setBusyAction("approve");
    setError("");
    try {
      const data = await liveLessonBuilderService.approveDraft(
        draftRef.current._id,
        {
          version: draftRef.current.version,
          answersChecked: true,
          classId: approveForm.classId,
          subjectId: approveForm.subjectId,
          title: approveForm.title.trim() || draftRef.current.setup?.title || "",
          description: approveForm.description.trim(),
          opKey: newOpKey("approve"),
        },
      );
      setApprovedLessonId(String(data.lessonId));
      removeSourceCopy(String(draftRef.current._id));
      draftRef.current = {
        ...draftRef.current,
        status: "approved",
        resultLessonId: data.lessonId,
      };
      setDraft(draftRef.current);
    } catch (requestError) {
      if (mountedRef.current) setError(errorCopy(t, requestError));
    } finally {
      if (mountedRef.current) setBusyAction("");
    }
  };

  const resetBuilder = () => {
    const next = createDefaultSetup();
    setupRef.current = next;
    setSetup(next);
    pastedRef.current = "";
    setPastedText("");
    pendingRef.current = [];
    setPendingFiles([]);
    draftRef.current = null;
    setDraft(null);
    lastSavedSetupRef.current = "";
    lastSavedTextRef.current = "";
    setStep("source");
    setQuote(null);
    setActiveIndex(0);
    setApprovedLessonId("");
    setApproveForm({
      classId: "",
      subjectId: "",
      title: "",
      description: "",
      answersChecked: false,
    });
    setTitleSuggested(false);
    setTitleSuggestionError("");
    setError("");
    navigate("/portal/live-lessons/ai-builder", { replace: true });
  };

  const stats = sourceStats({ draft, pendingFiles, pastedText });
  const progress = progressStats(draft?.items || []);
  const planCost = quote?.plan?.chargedCents;
  const generationCost = quote?.content?.chargedCents;
  const regenCost = quote?.regenerate?.chargedCents;
  const planCounts = outlineCounts(draft?.items || []);
  const stepComplete = {
    source: Boolean(draft?.setup?.hasSource),
    plan: Boolean(draft?.items?.length),
    slides: progress.total > 0 && progress.remaining === 0,
    approve: Boolean(approvedLessonId),
  };
  const stepAvailability = {
    source: true,
    plan: Boolean(draft?.items?.length),
    slides: Boolean(draft?.items?.length),
    approve: allItemsReady(draft?.items || []),
  };
  const currentStepIndex = STEP_KEYS.indexOf(step);
  const stepStateLabel = (key) => {
    if (stepComplete[key] && key !== step) return t("steps.complete");
    if (key === "slides" && progress.total > 0) {
      return t("steps.mobileState", {
        ready: formatNumber(progress.ready, locale),
        total: formatNumber(progress.total, locale),
      });
    }
    return t(`steps.${key}.state`);
  };
  const saveLabel =
    saveState === "saving"
      ? t("topbar.saving")
      : saveState === "error"
        ? t("topbar.saveFailed")
        : t("topbar.saved");
  const saveDotClass =
    saveState === "saving"
      ? "llb-saved-dot is-saving"
      : saveState === "error"
        ? "llb-saved-dot is-error"
        : "llb-saved-dot";
  const blockedKey = BLOCKED_REASONS[aiBuilder.reason] || "entry.disabledPlatform";

  const confirmCopy = (variant) => {
    if (variant === "plan") {
      return {
        title: t("dialogs.confirm.planTitle"),
        body: t("dialogs.confirm.planBody"),
        confirm: t("dialogs.confirm.planSubmit"),
        danger: true,
      };
    }
    if (variant === "leave") {
      return {
        title: t("dialogs.confirm.leaveTitle"),
        body: t("dialogs.confirm.leaveBody"),
        confirm: t("dialogs.confirm.leaveSubmit"),
        danger: false,
      };
    }
    return {
      title: t("dialogs.confirm.discardTitle"),
      body: t("dialogs.confirm.discardBody"),
      confirm: t("dialogs.confirm.discardSubmit"),
      danger: true,
    };
  };

  const confirmAction = () => {
    const variant = dialog?.variant;
    setDialog(null);
    if (variant === "plan") {
      void handlePlan(true);
      return;
    }
    if (variant === "discard") {
      const draftId = draftRef.current?._id;
      if (!draftId) return;
      void liveLessonBuilderService
        .discardDraft(draftId)
        .then(() => removeSourceCopy(String(draftId)))
        .catch((requestError) => setError(errorCopy(t, requestError)))
        .finally(() => navigate("/portal/live-lessons", { replace: true }));
      return;
    }
    navigate("/portal/live-lessons");
  };

  return (
    <div className="llb-page">
      <header className="llb-topbar">
        <div className="llb-breadcrumb">
          <button type="button" onClick={handleBack}>
            <HiOutlineArrowLeft className="llb-ic-sm llb-arrow" aria-hidden="true" />
            {t("topbar.back")}
          </button>
          <span className="llb-slash" aria-hidden="true">
            /
          </span>
          <span className="llb-current">{t("topbar.current")}</span>
        </div>
        <div className="llb-topbar-actions">
          <span className="llb-quiet-chip">
            <span className={saveDotClass} aria-hidden="true" />
            {saveLabel}
          </span>
          <span className="llb-credit-chip">
            {balanceCents === null
              ? t("topbar.creditsUnknown")
              : t("topbar.credits", {
                  credits: formatNumber(balanceCredits(balanceCents), locale),
                })}
          </span>
          <button
            type="button"
            className="llb-icon-button"
            aria-label={t("topbar.help")}
            title={t("topbar.help")}
            onClick={() => setDialog({ type: "help" })}
          >
            <HiOutlineQuestionMarkCircle className="llb-ic-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="llb-icon-button"
            aria-label={t("topbar.close")}
            title={t("topbar.close")}
            onClick={handleBack}
          >
            <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="llb-head">
        <div>
          <p className="llb-eyebrow">{t("head.eyebrow")}</p>
          <div className="llb-title-row">
            <h1 dir="auto">{setup.title || t("head.untitled")}</h1>
            <span className="llb-draft-pill">
              {approvedLessonId ? t("head.approved") : t("head.draft")}
            </span>
          </div>
          <div className="llb-meta">
            {setup.grade && <span>{setup.grade}</span>}
            {setup.grade && setup.subjectText && (
              <span className="llb-meta-dot" aria-hidden="true" />
            )}
            {setup.subjectText && <span>{setup.subjectText}</span>}
            {(setup.grade || setup.subjectText) && (
              <span className="llb-meta-dot" aria-hidden="true" />
            )}
            <span>
              {setup.language === "ar"
                ? t("source.languageAr")
                : t("source.languageEn")}
            </span>
            <span className="llb-meta-dot" aria-hidden="true" />
            <span>
              {t("head.metaItems", {
                slides: formatNumber(setup.slideCount, locale),
                questions: formatNumber(setup.questionCount, locale),
              })}
            </span>
          </div>
        </div>
        <div className="llb-utility">
          <span className="llb-soft-chip">{t("head.utility")}</span>
        </div>
      </div>

      {aiBuilder.available && (
        <nav className="llb-stepper" aria-label={t("topbar.current")}>
          {STEP_KEYS.map((key, index) => {
            const enabled = stepAvailability[key];
            const active = step === key;
            const complete = stepComplete[key];
            return (
              <button
                key={key}
                type="button"
                className={[
                  "llb-step",
                  active ? "is-active" : "",
                  complete && !active ? "is-complete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!enabled}
                aria-current={active ? "step" : undefined}
                onClick={() => enabled && setStep(key)}
              >
                <span className="llb-step-number" aria-hidden="true">
                  {complete && !active ? (
                    <HiOutlineCheck className="llb-ic-sm" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="llb-step-copy">
                  <span className="llb-step-label">
                    {t(`steps.${key}.label`)}
                  </span>
                  <span className="llb-step-state">
                    {stepStateLabel(key)}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {aiBuilder.available && (
        <div className="llb-mobile-step">
          <strong>
            {t("steps.mobile", {
              current: currentStepIndex + 1,
              total: STEP_KEYS.length,
              label: t(`steps.${step}.label`),
            })}
          </strong>
          <span>{stepStateLabel(step)}</span>
        </div>
      )}

      {error && (
        <div className="llb-banner is-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            {t("page.dismiss")}
          </button>
        </div>
      )}

      {sourceRestored && (
        <div className="llb-banner is-notice" role="status">
          <span>{t("page.sourceRestored")}</span>
          <button type="button" onClick={() => setSourceRestored(false)}>
            {t("page.dismiss")}
          </button>
        </div>
      )}

      {!settingsLoaded || loadingDraft ? (
        <div className="llb-loading" role="status">
          <span className="llb-spinner" aria-hidden="true" />
          {t("page.loading")}
        </div>
      ) : !aiBuilder.available ? (
        <div className="llb-blocked">
          <strong>{t("entry.unavailable")}</strong>
          <p>{t(blockedKey)}</p>
          <button
            type="button"
            className="llb-btn llb-btn-secondary"
            onClick={() => navigate("/portal/live-lessons")}
          >
            <HiOutlineArrowLeft className="llb-ic-sm llb-arrow" aria-hidden="true" />
            {t("topbar.back")}
          </button>
        </div>
      ) : (
        <>
          {step === "source" && (
            <BuilderSourceStep
              draft={draft}
              setup={setup}
              onSetupChange={handleSetupChange}
              pastedText={pastedText}
              onPastedTextChange={updatePastedText}
              pendingFiles={pendingFiles}
              onFilesPicked={(files) => void handleFilesPicked(files)}
              onRemoveServerFile={(fileId) => void removeServerFile(fileId)}
              onRemovePendingFile={removePendingFile}
              onSuggestTitle={() => void handleSuggestTitle()}
              suggestingTitle={suggestingTitle}
              titleSuggested={titleSuggested}
              titleSuggestionError={titleSuggestionError}
              stats={stats}
              quote={quote}
              locked={sourceLocked || busyAction === "source"}
              subjects={subjects}
              palettes={palettes}
              t={t}
              locale={locale}
            />
          )}

          {step === "plan" && (
            <BuilderPlanStep
              items={draft?.items || []}
              setup={setup}
              onMove={moveItem}
              onEdit={(item) => setDialog({ type: "item", item })}
              onAdd={(kind, toIndex) =>
                setDialog({ type: "item", item: null, initialKind: kind, toIndex })
              }
              onRegenerate={() => setDialog({ type: "confirm", variant: "plan" })}
              busy={Boolean(busyAction) || generating}
              t={t}
              locale={locale}
            />
          )}

          {step === "slides" && (
            <BuilderSlidesStep
              draft={draft}
              setup={setup}
              items={draft?.items || []}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
              onMove={moveItem}
              onEdit={(item) => setDialog({ type: "slide", item })}
              onEnhance={(item, preset) =>
                setDialog({ type: "enhance", item, preset })
              }
              onRegenerate={(item) =>
                setDialog({ type: "enhance", item, preset: "" })
              }
              onUndo={undoItem}
              onStop={handleStop}
              onApprove={openApprove}
              onOpenPlan={() => setStep("plan")}
              onGenerate={() => void startGeneration()}
              onRetryItem={() => void startGeneration()}
              generatingIds={generatingIds}
              generating={generating}
              stopRequested={stopRequested}
              busy={Boolean(busyAction) && busyAction !== "generate"}
              regeneratingItemId={regeneratingItemId}
              quote={quote}
              maxRegens={draft?.regenLimit || 0}
              t={t}
              locale={locale}
            />
          )}

          {step === "approve" && (
            <BuilderApproveStep
              items={draft?.items || []}
              classes={classes}
              subjectOptions={subjectOptions}
              form={approveForm}
              onChange={changeApproveForm}
              onSubmit={() => void submitApprove()}
              onBack={() => setStep("slides")}
              busy={busyAction === "approve"}
              approvedLessonId={approvedLessonId}
              onOpenLibrary={() => navigate("/portal/live-lessons")}
              onBuildAnother={resetBuilder}
              t={t}
              locale={locale}
            />
          )}

          {step === "source" && (
            <footer className="llb-footer">
              <div className="llb-footer-context">
                <div className="llb-footer-line">
                  <HiOutlineCheck className="llb-ic-sm llb-footer-check" aria-hidden="true" />
                  <strong>{t("footer.sourceLine")}</strong>
                  <span>· {t("footer.sourceBody")}</span>
                </div>
                <div className="llb-footer-hint">{t("footer.sourceHint")}</div>
              </div>
              <div className="llb-footer-actions">
                <button
                  type="button"
                  className="llb-btn llb-btn-ghost llb-footer-back"
                  disabled={busyAction === "plan"}
                  onClick={handleBack}
                >
                  {t("footer.back")}
                </button>
                <button
                  type="button"
                  className="llb-btn llb-btn-primary"
                  disabled={busyAction === "plan" || busyAction === "source"}
                  onClick={() => void handlePlan(false)}
                >
                  {busyAction === "plan"
                    ? t("footer.busyPlan")
                    : draft?.items?.length
                      ? t("footer.next")
                      : t("footer.planPrimary")}
                  {!draft?.items?.length &&
                    planCost !== null &&
                    planCost !== undefined &&
                    Number.isFinite(Number(planCost)) && (
                      <span className="llb-cost-inline">
                        {" "}
                        ·{" "}
                        {t("footer.planCost", {
                          credits: formatNumber(costCredits(planCost), locale),
                        })}
                      </span>
                    )}
                  <HiOutlineArrowRight className="llb-ic-sm llb-arrow" aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}

          {step === "plan" && (
            <footer className="llb-footer">
              <div className="llb-footer-context">
                <div className="llb-footer-line">
                  <HiOutlineCheck className="llb-ic-sm llb-footer-check" aria-hidden="true" />
                  <strong>{t("footer.planLine")}</strong>
                  <span>
                    ·{" "}
                    {t("footer.planBody", {
                      slides: formatNumber(planCounts.slides, locale),
                      questions: formatNumber(planCounts.questions, locale),
                    })}
                  </span>
                </div>
                <div className="llb-footer-hint">{t("footer.planHint")}</div>
              </div>
              <div className="llb-footer-actions">
                <button
                  type="button"
                  className="llb-btn llb-btn-ghost llb-footer-back"
                  disabled={Boolean(busyAction)}
                  onClick={() => setStep("source")}
                >
                  {t("footer.back")}
                </button>
                <button
                  type="button"
                  className="llb-btn llb-btn-secondary llb-footer-regen"
                  disabled={Boolean(busyAction)}
                  onClick={() => setDialog({ type: "confirm", variant: "plan" })}
                >
                  <HiOutlineSparkles className="llb-ic-sm" aria-hidden="true" />
                  {t("plan.regenerate")}
                </button>
                <button
                  type="button"
                  className="llb-btn llb-btn-primary"
                  disabled={Boolean(busyAction) || !draft?.items?.length}
                  onClick={() => void startGeneration()}
                >
                  {busyAction === "generate"
                    ? t("footer.busyGenerate")
                    : t("footer.planGenerate")}
                  {generationCost !== null &&
                    generationCost !== undefined &&
                    Number.isFinite(Number(generationCost)) && (
                      <span className="llb-cost-inline">
                        {" "}
                        ·{" "}
                        {t("footer.generateCost", {
                          credits: formatNumber(costCredits(generationCost), locale),
                        })}
                      </span>
                    )}
                  <HiOutlineArrowRight className="llb-ic-sm llb-arrow" aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
        </>
      )}

      {dialog?.type === "help" && (
        <BuilderDialog
          title={t("help.title")}
          onClose={() => setDialog(null)}
          footer={
            <button
              type="button"
              className="llb-btn llb-btn-primary"
              onClick={() => setDialog(null)}
            >
              {t("help.close")}
            </button>
          }
        >
          <p className="llb-dialog-copy">{t("help.body1")}</p>
          <p className="llb-dialog-copy">{t("help.body2")}</p>
          <p className="llb-dialog-copy">{t("help.body3")}</p>
          <p className="llb-dialog-copy">{t("help.body4")}</p>
        </BuilderDialog>
      )}

      {dialog?.type === "confirm" && (
        <BuilderConfirmDialog
          title={confirmCopy(dialog.variant).title}
          body={confirmCopy(dialog.variant).body}
          confirmLabel={confirmCopy(dialog.variant).confirm}
          cancelLabel={t("dialogs.confirm.cancel")}
          danger={confirmCopy(dialog.variant).danger}
          busy={busyAction === "plan-replace"}
          onCancel={() => setDialog(null)}
          onConfirm={confirmAction}
        />
      )}

      {dialog?.type === "item" && (
        <BuilderItemDialog
          mode={dialog.item ? "edit" : "add"}
          initialKind={dialog.initialKind || "slide"}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSave={saveItemDialog}
        />
      )}

      {dialog?.type === "slide" && dialog.item && (
        <BuilderSlideDialog
          key={`${dialog.item.itemId}:${dialog.item.rev}`}
          item={dialog.item}
          previewQuestion={
            draft?.previewSlides?.[
              draft.items.findIndex(
                (row) => row.itemId === dialog.item.itemId,
              )
            ]?.question || null
          }
          onClose={() => setDialog(null)}
          onSave={saveSlideContent}
          onSaveTexts={saveSlideTexts}
        />
      )}

      {dialog?.type === "enhance" && dialog.item && (
        <BuilderEnhanceDialog
          item={dialog.item}
          costCents={regenCost}
          maxRegens={draft?.regenLimit || 0}
          initialPreset={dialog.preset || ""}
          busy={busyAction === "regen"}
          onClose={() => setDialog(null)}
          onSave={submitEnhance}
        />
      )}
    </div>
  );
};

export default LiveLessonBuilderPage;
