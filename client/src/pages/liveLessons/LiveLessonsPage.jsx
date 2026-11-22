import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import { fetchClasses, selectClasses } from "../../store/slices/classSlice";
import { fetchSubjects, selectSubjects } from "../../store/slices/subjectSlice";
import {
  createLiveQuestion,
  linkLiveLessonLevels,
} from "../../utils/liveLessonQuestionDraft.js";
import { LIVE_LESSON_AI_PROMPT } from "./liveLessonAiPrompt";
import liveLessonBuilderService from "../../services/liveLessonBuilderService";
import { useFeatureNamespaces } from "../../i18n/useFeatureNamespaces";
import LiveLessonsHeader from "./components/LiveLessonsHeader";
import AiDraftsStrip from "./components/AiDraftsStrip";
import SettingsPanel from "./components/SettingsPanel";
import SelectionBar from "./components/SelectionBar";
import ShareInvitations from "./components/ShareInvitations";
import LibraryEmptyState from "./components/LibraryEmptyState";
import LibraryToolbar from "./components/LibraryToolbar";
import LibraryBreadcrumbs from "./components/LibraryBreadcrumbs";
import FolderActions from "./components/FolderActions";
import FolderGrid from "./components/FolderGrid";
import LessonsListView from "./components/LessonsListView";
import SessionHistory from "./components/SessionHistory";
import PreviewDialog from "./components/PreviewDialog";
import SessionDialog from "./components/SessionDialog";
import FolderDialog from "./components/FolderDialog";
import OrganizeDialog from "./components/OrganizeDialog";
import PositionDialog from "./components/PositionDialog";
import ShareDialog from "./components/ShareDialog";
import MoveDialog from "./components/MoveDialog";
import ImportEditorDialog from "./components/ImportEditorDialog";
import {
  defaultListState,
  downloadLessonCsv,
  downloadTemplate,
  emptyForm,
  localDateTimeValue,
  readListPreferences,
  toEditorSlide,
  toStoredSlide,
  unlinkedLevelMessage,
} from "./utils/liveLessonPageUtils";
import "./LiveLessonsPage.css";

const LiveLessonsPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const user = useSelector(selectUser);
  const { t: builderT, i18n: builderI18n } =
    useFeatureNamespaces("liveLessonBuilder");
  const builderLocale = builderI18n.language || "en";
  const [lessons, setLessons] = useState([]);
  const [folders, setFolders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tab, setTab] = useState("lessons");
  const [importOpen, setImportOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editingLessonId, setEditingLessonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState("");
  const [exportingLessonId, setExportingLessonId] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [incomingShares, setIncomingShares] = useState([]);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [selectedIncomingShareIds, setSelectedIncomingShareIds] = useState([]);
  const [shareLessons, setShareLessons] = useState([]);
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [moveLessonTarget, setMoveLessonTarget] = useState(null);
  const [moveLessonClassId, setMoveLessonClassId] = useState("");
  const [moveLessonSaving, setMoveLessonSaving] = useState(false);
  const [moveLessonError, setMoveLessonError] = useState("");
  const [moveLessonOptions, setMoveLessonOptions] = useState(null);
  const [moveLessonLoading, setMoveLessonLoading] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [bulkDeletingLessons, setBulkDeletingLessons] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDialog, setFolderDialog] = useState(null);
  const [folderCounts, setFolderCounts] = useState({
    totalLessons: 0,
    unfiled: 0,
  });
  const [folderSort, setFolderSort] = useState("order");
  const [reorderMode, setReorderMode] = useState(false);
  const [lessonSearchInput, setLessonSearchInput] = useState("");
  const [organizeDialog, setOrganizeDialog] = useState(null);
  const [organizeSaving, setOrganizeSaving] = useState(false);
  const [positionDialog, setPositionDialog] = useState(null);
  const [positionSaving, setPositionSaving] = useState(false);
  const [bulkRespondingToShares, setBulkRespondingToShares] = useState(false);
  const [previewLesson, setPreviewLesson] = useState(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [lessonGroups, setLessonGroups] = useState([]);
  const [endingSessionId, setEndingSessionId] = useState("");
  const [deletingFinishedSessions, setDeletingFinishedSessions] =
    useState(false);
  const [sessionDraft, setSessionDraft] = useState(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiHtmlReviewEnabled, setAiHtmlReviewEnabled] = useState(false);
  const [savingHtmlReviewSetting, setSavingHtmlReviewSetting] = useState(false);
  const [markDraftEnabled, setMarkDraftEnabled] = useState(false);
  const [savingMarkDraftSetting, setSavingMarkDraftSetting] = useState(false);
  const [aiBuilderEnabled, setAiBuilderEnabled] = useState(false);
  const [savingAiBuilderSetting, setSavingAiBuilderSetting] = useState(false);
  const [aiBuilder, setAiBuilder] = useState({
    available: false,
    reason: "platform_disabled",
  });
  const [aiDrafts, setAiDrafts] = useState([]);
  const [discardingDraftId, setDiscardingDraftId] = useState("");
  const [lessonListState, setLessonListState] = useState(defaultListState);
  const [sessionListState, setSessionListState] = useState(defaultListState);
  const [sessionSearchInput, setSessionSearchInput] = useState("");
  const [lessonPagination, setLessonPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    pages: 1,
    libraryTotal: 0,
  });
  const [lessonLoading, setLessonLoading] = useState(false);
  const lessonRequestRef = useRef(0);
  const [lessonSummaries, setLessonSummaries] = useState({});
  const [selectingAllLessons, setSelectingAllLessons] = useState(false);
  const [filteredSelectionActive, setFilteredSelectionActive] = useState(false);
  const [sessionPagination, setSessionPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    pages: 0,
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const preferencesKey = `liveLessonLists:${user?.school?._id || user?.schoolId || "school"}:${user?._id || user?.id || "user"}`;

  const exportLesson = async (lesson) => {
    setExportingLessonId(String(lesson._id));
    setError("");
    setNotice("");
    try {
      await downloadLessonCsv(lesson);
      setNotice(`Exported “${lesson.title}” as a portable Live Lesson CSV.`);
    } catch (requestError) {
      let message = requestError.message || "Could not export this lesson.";
      if (requestError.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await requestError.response.data.text());
          message = payload.message || message;
        } catch {
          message = "Could not export this lesson.";
        }
      } else if (requestError.response?.data?.message) {
        message = requestError.response.data.message;
      }
      setError(message);
    } finally {
      setExportingLessonId("");
    }
  };

  const [lessonActionMenu, setLessonActionMenu] = useState(null);
  const lessonActionMenuRef = useRef(null);

  // The row lives inside a horizontally scrolling table, which would clip an
  // absolutely positioned panel, so the menu is portaled and anchored to the button.
  const toggleLessonActionMenu = (event, lesson) => {
    if (lessonActionMenu?.lessonId === String(lesson._id)) {
      setLessonActionMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = 280;
    const openUpward = rect.bottom + 8 + estimatedHeight > window.innerHeight;
    setLessonActionMenu({
      lessonId: String(lesson._id),
      lesson,
      top: openUpward ? Math.max(8, rect.top - estimatedHeight - 8) : rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!lessonActionMenu) return undefined;
    const close = () => setLessonActionMenu(null);
    const handlePointerDown = (event) => {
      if (lessonActionMenuRef.current?.contains(event.target)) return;
      if (event.target.closest?.(".live-lesson-actions-trigger")) return;
      close();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    const handleScroll = (event) => {
      if (lessonActionMenuRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [lessonActionMenu]);

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LIVE_LESSON_AI_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2200);
    } catch (copyError) {
      setError(
        copyError.message ||
          "Could not copy the AI prompt. Check clipboard permissions and try again.",
      );
    }
  };

  // The library is paged and filtered by the server, so a teacher with a large
  // library downloads one page instead of every lesson they ever wrote. The
  // folders home loads no lesson rows at all.
  const loadLessons = useCallback(async () => {
    if (lessonListState.view === "home") {
      setLessonLoading(false);
      return;
    }
    const requestId = lessonRequestRef.current + 1;
    lessonRequestRef.current = requestId;
    setLessonLoading(true);
    try {
      const response = await api.get("/live/lessons", {
        params: {
          page: lessonListState.page,
          limit: lessonListState.pageSize,
          order: lessonListState.order === "az" ? "az" : lessonListState.order,
          ...(lessonListState.view === "folder" && lessonListState.folderId
            ? { folderId: lessonListState.folderId }
            : {}),
          ...(lessonListState.view === "unfiled" ? { unfiled: "true" } : {}),
          ...(lessonListState.search
            ? { search: lessonListState.search }
            : {}),
          ...(lessonListState.subject
            ? { subjectId: lessonListState.subject }
            : {}),
        },
      });
      if (lessonRequestRef.current !== requestId) return;
      const data = response.data?.data || {};
      const rows = data.lessons || [];
      const pagination = data.pagination || {};
      setLessons(rows);
      setLessonPagination({
        page: pagination.page || 1,
        limit: pagination.limit || lessonListState.pageSize,
        total: pagination.total || 0,
        pages: Math.max(1, pagination.pages || 1),
        libraryTotal: pagination.libraryTotal || 0,
      });
      setLessonSummaries((current) => {
        const next = { ...current };
        for (const row of rows) {
          next[String(row._id)] = {
            _id: String(row._id),
            title: row.title || "",
          };
        }
        return next;
      });
    } catch (requestError) {
      if (lessonRequestRef.current !== requestId) return;
      setError(
        requestError.response?.data?.message || "Could not load live lessons.",
      );
    } finally {
      if (lessonRequestRef.current === requestId) setLessonLoading(false);
    }
  }, [
    lessonListState.folderId,
    lessonListState.order,
    lessonListState.page,
    lessonListState.pageSize,
    lessonListState.search,
    lessonListState.subject,
    lessonListState.view,
  ]);

  // Refreshing folders after a move or a rename keeps the current view on
  // screen; only the first load takes over the page with the loader.
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [settingsResponse, folderResponse] = await Promise.all([
        api.get("/live/settings"),
        api.get("/live/lessons/folders"),
      ]);
      setFolders(folderResponse.data?.data?.folders || []);
      setFolderCounts(
        folderResponse.data?.data?.counts || { totalLessons: 0, unfiled: 0 },
      );
      setFoldersLoaded(true);
      setAiHtmlReviewEnabled(
        settingsResponse.data?.data?.aiHtmlReviewEnabled === true,
      );
      setMarkDraftEnabled(
        settingsResponse.data?.data?.aiMarkDraftEnabled === true,
      );
      setAiBuilderEnabled(
        settingsResponse.data?.data?.aiBuilderEnabled === true,
      );
      setAiBuilder(
        settingsResponse.data?.data?.aiBuilder || {
          available: false,
          reason: "platform_disabled",
        },
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not load live lessons.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const reloadLibrary = useCallback(async () => {
    await Promise.all([loadData(), loadLessons()]);
  }, [loadData, loadLessons]);

  const loadSessions = useCallback(async () => {
    try {
      const response = await api.get("/live/sessions", {
        params: {
          page: sessionListState.page,
          limit: sessionListState.pageSize,
          ...(sessionListState.classId
            ? { classId: sessionListState.classId }
            : {}),
          ...(sessionListState.subject
            ? { subject: sessionListState.subject }
            : {}),
          ...(sessionListState.search
            ? { search: sessionListState.search }
            : {}),
          ...(sessionListState.dateFrom
            ? { dateFrom: sessionListState.dateFrom }
            : {}),
          ...(sessionListState.dateTo
            ? { dateTo: sessionListState.dateTo }
            : {}),
          ...(sessionListState.status
            ? { status: sessionListState.status }
            : {}),
        },
      });
      setSessions(response.data?.data?.sessions || []);
      setSessionPagination(
        response.data?.data?.pagination || {
          page: 1,
          limit: sessionListState.pageSize,
          total: 0,
          pages: 0,
        },
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load session history.",
      );
    }
  }, [sessionListState]);

  useEffect(() => {
    setPreferencesLoaded(false);
    const saved = readListPreferences(preferencesKey);
    setLessonListState(saved.lessons);
    setSessionListState(saved.sessions);
    setSessionSearchInput(saved.sessions.search || "");
    setLessonSearchInput(saved.lessons.search || "");
    setPreferencesLoaded(true);
  }, [preferencesKey]);

  // The list state drives the request, so the search box waits for a pause
  // before it lands there. Typing a word costs one request, not one per letter.
  useEffect(() => {
    if (!preferencesLoaded) return undefined;
    const timer = window.setTimeout(() => {
      setSessionListState((current) =>
        current.search === sessionSearchInput
          ? current
          : { ...current, search: sessionSearchInput, page: 1 },
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [sessionSearchInput, preferencesLoaded]);

  // Library search covers every folder. Typing lands on the search view after a
  // pause; clearing the box returns to the folder home.
  useEffect(() => {
    if (!preferencesLoaded) return undefined;
    const timer = window.setTimeout(() => {
      const term = lessonSearchInput.trim();
      setLessonListState((current) => {
        if (term === current.search &&
          (term ? current.view === "search" : current.view !== "search")) {
          return current;
        }
        return term
          ? {
              ...current,
              view: "search",
              folderId: "",
              search: term,
              order: current.order === "teaching" ? "recent" : current.order,
              page: 1,
            }
          : { ...current, view: "home", folderId: "", search: "", page: 1 };
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [lessonSearchInput, preferencesLoaded]);

  // Ordering controls belong to one list. Leaving the list ends reorder mode
  // and closes the position prompt instead of carrying them to another view.
  useEffect(() => {
    setReorderMode(false);
    setPositionDialog(null);
    if (lessonListState.view !== "folder" && lessonListState.order === "teaching") {
      setLessonListState((current) => ({ ...current, order: "recent" }));
    }
  }, [
    lessonListState.view,
    lessonListState.folderId,
    lessonListState.order,
    lessonListState.search,
    folderSort,
  ]);

  useEffect(() => {
    if (preferencesLoaded) {
      window.localStorage.setItem(
        preferencesKey,
        JSON.stringify({
          lessons: lessonListState,
          sessions: sessionListState,
        }),
      );
    }
  }, [lessonListState, sessionListState, preferencesKey, preferencesLoaded]);

  const updateMarkDraftSetting = async (enabled) => {
    setSavingMarkDraftSetting(true);
    setError("");
    try {
      const response = await api.patch("/live/settings", {
        aiMarkDraftEnabled: enabled,
      });
      setMarkDraftEnabled(response.data?.data?.aiMarkDraftEnabled === true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update the suggested marks setting.",
      );
    } finally {
      setSavingMarkDraftSetting(false);
    }
  };

  const updateAiHtmlReviewSetting = async (enabled) => {
    setSavingHtmlReviewSetting(true);
    setError("");
    try {
      const response = await api.patch("/live/settings", {
        aiHtmlReviewEnabled: enabled,
      });
      setAiHtmlReviewEnabled(response.data?.data?.aiHtmlReviewEnabled === true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update the AI HTML safety review setting.",
      );
    } finally {
      setSavingHtmlReviewSetting(false);
    }
  };

  const updateAiBuilderSetting = async (enabled) => {
    setSavingAiBuilderSetting(true);
    setError("");
    try {
      const response = await api.patch("/live/settings", {
        aiBuilderEnabled: enabled,
      });
      setAiBuilderEnabled(response.data?.data?.aiBuilderEnabled === true);
      setAiBuilder(
        response.data?.data?.aiBuilder || {
          available: false,
          reason: "school_disabled",
        },
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update the AI lesson builder setting.",
      );
    } finally {
      setSavingAiBuilderSetting(false);
    }
  };

  const loadAiDrafts = useCallback(async () => {
    try {
      const data = await liveLessonBuilderService.listDrafts();
      setAiDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
    } catch (requestError) {
      setAiDrafts([]);
      setError(
        requestError.response?.data?.message || builderT("drafts.error"),
      );
    }
  }, [builderT]);

  const resumeAiDraft = (draft) => {
    navigate(`/portal/live-lessons/ai-builder/${draft._id}`);
  };

  const discardAiDraft = async (draft) => {
    const title = draft.title?.trim() || builderT("head.untitled");
    const confirmed = window.confirm(
      `${builderT("drafts.confirmDeleteTitle")}\n\n${builderT(
        "drafts.confirmDeleteBody",
        { title },
      )}`,
    );
    if (!confirmed) return;
    setDiscardingDraftId(String(draft._id));
    setError("");
    try {
      await liveLessonBuilderService.discardDraft(draft._id);
      setAiDrafts((current) =>
        current.filter((row) => String(row._id) !== String(draft._id)),
      );
    } catch (requestError) {
      setError(requestError.response?.data?.message || builderT("drafts.error"));
    } finally {
      setDiscardingDraftId("");
    }
  };

  useEffect(() => {
    if (!aiBuilder.available || tab !== "lessons") return;
    void loadAiDrafts();
  }, [aiBuilder.available, tab, loadAiDrafts]);

  useEffect(() => {
    let active = true;
    dispatch(fetchClasses({ limit: "all" }))
      .unwrap()
      .then(() => {
        if (active) setClassesLoaded(true);
      })
      .catch((requestError) => {
        if (active) setError(requestError || "Could not load your classes.");
      });
    dispatch(fetchSubjects({ limit: "all" }))
      .unwrap()
      .then(() => {
        if (active) setSubjectsLoaded(true);
      })
      .catch((requestError) => {
        if (active) setError(requestError || "Could not load subjects.");
      });
    loadData();
    return () => {
      active = false;
    };
  }, [dispatch, loadData]);

  const loadShares = useCallback(async () => {
    if (!["teacher", "admin"].includes(user?.role)) return;
    try {
      const [incomingResponse, outgoingResponse] = await Promise.all([
        api.get("/live/shares/incoming"),
        api.get("/live/shares/outgoing"),
      ]);
      const invitations = incomingResponse.data?.data?.invitations || [];
      setIncomingShares(invitations);
      const pendingIds = new Set(
        invitations.map((invitation) => String(invitation._id)),
      );
      setSelectedIncomingShareIds((current) =>
        current.filter((id) => pendingIds.has(String(id))),
      );
      setOutgoingShares(outgoingResponse.data?.data?.invitations || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load lesson-sharing invitations.",
      );
    }
  }, [user?.role]);

  // Session history is its own tab and is only fetched when a teacher opens it.
  useEffect(() => {
    if (tab !== "sessions" || !preferencesLoaded) return;
    void loadSessions();
    // The filter object is the request, so a filter change re-fetches only here.
  }, [tab, loadSessions, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded || !classesLoaded || !subjectsLoaded || !foldersLoaded) return;
    const knownClassIds = new Set(
      classes.map((classItem) => String(classItem._id)),
    );
    const validSubject = (value, isSession) =>
      !value ||
      (isSession && value === "__unknown__") ||
      subjects.some(
        (subject) => String(subject._id) === value || subject.name === value,
      );
    const sanitize = (state, isSession) => {
      const classId =
        state.classId && knownClassIds.has(state.classId) ? state.classId : "";
      const selectedClass = classId
        ? classes.find((classItem) => String(classItem._id) === classId)
        : null;
      const assignedIds = (selectedClass?.subjects || [])
        .map((entry) => entry.subject?._id || entry.subject)
        .filter(Boolean)
        .map(String);
      const assignedSubjectMatches =
        !classId ||
        (assignedIds.length > 0 &&
          subjects.some(
            (entry) =>
              assignedIds.includes(String(entry._id)) &&
              (String(entry._id) === state.subject ||
                entry.name === state.subject),
          ));
      const resolvedSubject = subjects.find(
        (entry) => entry.name === state.subject,
      );
      const subject =
        validSubject(state.subject, isSession) && assignedSubjectMatches
          ? resolvedSubject?._id
            ? String(resolvedSubject._id)
            : state.subject
          : "";
      if (classId === state.classId && subject === state.subject) return state;
      return { ...state, classId, subject, page: 1 };
    };
    setSessionListState((current) => sanitize(current, true));
    setLessonListState((current) => {
      const nextSubject = validSubject(current.subject, false)
        ? current.subject
        : "";
      if (current.view !== "folder") {
        return nextSubject === current.subject
          ? current
          : { ...current, subject: nextSubject, page: 1 };
      }
      const validFolder = folders.some(
        (folder) => String(folder._id) === current.folderId,
      );
      if (validFolder && nextSubject === current.subject) return current;
      return {
        ...current,
        view: validFolder ? current.view : "home",
        folderId: validFolder ? current.folderId : "",
        subject: nextSubject,
        page: 1,
      };
    });
  }, [preferencesLoaded, classesLoaded, subjectsLoaded, foldersLoaded, classes, subjects, folders]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void loadLessons();
  }, [loadLessons, preferencesLoaded]);

  useEffect(() => {
    if (lessonListState.page > lessonPagination.pages) {
      setLessonListState((current) => ({
        ...current,
        page: lessonPagination.pages,
      }));
    }
  }, [lessonListState.page, lessonPagination.pages]);

  useEffect(() => {
    setFilteredSelectionActive(false);
  }, [
    lessonListState.folderId,
    lessonListState.search,
    lessonListState.subject,
    lessonListState.view,
  ]);

  useEffect(() => {
    if (
      sessionPagination.pages > 0 &&
      sessionListState.page > sessionPagination.pages
    ) {
      setSessionListState((current) => ({
        ...current,
        page: sessionPagination.pages,
      }));
    }
  }, [sessionListState.page, sessionPagination.pages]);

  useEffect(() => {
    if (!["teacher", "admin"].includes(user?.role)) return;
    let active = true;
    api
      .get("/live/shares/teachers")
      .then((response) => {
        if (active) setTeachers(response.data?.data?.teachers || []);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ||
              "Could not load your teacher directory.",
          );
      });
    loadShares();
    return () => {
      active = false;
    };
  }, [loadShares, user?.role]);

  // Groups are no longer edited here, but a CSV may still name one in a levelled question, and that
  // name only means something once it is matched to this class, so the list is read quietly.
  const loadLessonGroups = useCallback(async (classId) => {
    if (!classId) {
      setLessonGroups([]);
      return;
    }
    try {
      const response = await api.get("/live/groups", { params: { classId } });
      setLessonGroups(response.data?.data?.groups || []);
    } catch {
      setLessonGroups([]);
    }
  }, []);

  useEffect(() => {
    if (!importOpen) return;
    loadLessonGroups(form.classId);
  }, [importOpen, form.classId, loadLessonGroups]);

  useEffect(() => {
    if (!importOpen || !lessonGroups.length) return;
    setForm((previous) => {
      const slides = linkLiveLessonLevels(previous.slides, lessonGroups);
      return slides === previous.slides ? previous : { ...previous, slides };
    });
  }, [importOpen, lessonGroups]);

  const handleSelectFile = async (event) => {
    const file = event.target.files?.[0];
    setErrors([]);
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors([{ row: 1, field: "file", message: "Choose a .csv file." }]);
      return;
    }
    try {
      const csv = await file.text();
      const response = await api.post("/live/lessons/preview", csv, {
        headers: { "Content-Type": "text/csv" },
      });
      const importedLesson = response.data.data.lesson;
      const classNameHint = String(importedLesson.importHints?.assignedClass || "").trim().toLocaleLowerCase();
      const subjectNameHint = String(importedLesson.importHints?.assignedSubject || "").trim().toLocaleLowerCase();
      const suggestedClass = classNameHint
        ? classes.find((classItem) => String(classItem.name || "").trim().toLocaleLowerCase() === classNameHint)
        : null;
      const assignedSubjectIds = (suggestedClass?.subjects || [])
        .map((entry) => String(entry.subject?._id || entry.subject || ""))
        .filter(Boolean);
      const suggestedSubject = suggestedClass && subjectNameHint
        ? subjects.find((subject) =>
          String(subject.name || "").trim().toLocaleLowerCase() === subjectNameHint &&
          (!assignedSubjectIds.length || assignedSubjectIds.includes(String(subject._id))))
        : null;
      setForm({
        ...importedLesson,
        slides: (importedLesson.slides || []).map(toEditorSlide),
        classId: suggestedClass?._id || "",
        subjectId: suggestedSubject?._id || "",
        subject: suggestedSubject?.name || importedLesson.subject || "",
      });
      setSelectedSlideIndex(0);
      setFileName(file.name);
      setSelectedFile(csv);
    } catch (requestError) {
      setErrors(
        requestError.response?.data?.errors || [
          {
            row: 1,
            field: "file",
            message:
              requestError.response?.data?.message || "CSV preview failed.",
          },
        ],
      );
    } finally {
      event.target.value = "";
    }
  };

  const openLessonEditor = async (lessonId) => {
    setError("");
    setErrors([]);
    setEditorMode("edit");
    setEditingLessonId(lessonId);
    setImportOpen(true);
    setSaving(true);
    try {
      const response = await api.get(`/live/lessons/${lessonId}`);
      const lesson = response.data?.data?.lesson;
      setForm({
        title: lesson.title,
        description: lesson.description || "",
        subject: lesson.subject || "",
        classId: String(lesson.classId?._id || lesson.classId || ""),
        subjectId: String(lesson.subjectId?._id || lesson.subjectId || ""),
        grade: lesson.grade || "",
        language: lesson.language || "en",
        slides: (lesson.slides || []).map(toEditorSlide),
      });
      setSelectedSlideIndex(0);
      setFileName("");
      setSelectedFile("");
    } catch (requestError) {
      closeEditor(true);
      setError(
        requestError.response?.data?.message ||
          "Could not open this lesson for editing.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openLessonPreview = async (lessonId) => {
    setPreviewLesson(null);
    setPreviewSlideIndex(0);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const response = await api.get(`/live/lessons/${lessonId}`);
      setPreviewLesson(response.data?.data?.lesson || null);
      if (!response.data?.data?.lesson) {
        setPreviewError("This lesson could not be loaded.");
      }
    } catch (requestError) {
      setPreviewError(
        requestError.response?.data?.message ||
          "Could not preview this lesson.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const updateSlide = (slideIndex, change) => {
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.map((slide, index) =>
        index === slideIndex ? { ...slide, ...change } : slide,
      ),
    }));
  };

  const changeSlideType = (slideIndex, type) => {
    const currentSlide = form.slides[slideIndex];
    if (type !== "question") {
      // Only question slides may carry a question or levels, so both go with the type.
      updateSlide(slideIndex, { type, question: undefined, variants: [] });
      return;
    }
    updateSlide(slideIndex, {
      type,
      question: currentSlide.question || createLiveQuestion("mcq"),
      variants: currentSlide.variants || [],
    });
  };

  const addSlide = () => {
    const nextSlide = {
      type: "content",
      title: "New slide",
      body: "",
      examples: [],
      imageUrl: "",
      speakerNotes: "",
    };
    setForm((previous) => ({
      ...previous,
      slides: [...previous.slides, nextSlide],
    }));
    setSelectedSlideIndex(form.slides.length);
  };

  const deleteSelectedSlide = () => {
    if (form.slides.length <= 1) return;
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.filter(
        (_, index) => index !== selectedSlideIndex,
      ),
    }));
    setSelectedSlideIndex((index) =>
      Math.max(0, Math.min(index, form.slides.length - 2)),
    );
  };

  const closeEditor = (force = false) => {
    if (saving && !force) return;
    setImportOpen(false);
    setEditorMode("create");
    setEditingLessonId("");
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    setFileName("");
    setErrors([]);
  };

  const openImportEditor = () => {
    setEditorMode("create");
    setEditingLessonId("");
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    setFileName("");
    setErrors([]);
    setImportOpen(true);
  };

  const saveImportedLesson = async () => {
    if (editorMode === "create" && !selectedFile) return;
    const orphanLevel = unlinkedLevelMessage(form.slides);
    if (orphanLevel) {
      setErrors([{ row: 1, field: "levels", message: orphanLevel }]);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const lessonData = {
        title: form.title,
        description: form.description,
        subject: form.subject || "",
        classId: form.classId || null,
        subjectId: form.subjectId || null,
        grade: form.grade || "",
        language: form.language || "en",
        ...(editorMode === "create" ? { isDone: form.isDone === true } : {}),
        slides: form.slides.map(toStoredSlide),
      };
      if (editorMode === "edit") {
        await api.put(`/live/lessons/${editingLessonId}`, lessonData);
      } else {
        const created = await api.post("/live/lessons", lessonData);
        const createdLessonId = String(created.data?.data?.lesson?._id || "");
        // A lesson imported while a folder is open lands in that folder, so the
        // teacher does not have to organize it a second time.
        if (createdLessonId && lessonListState.view === "folder" && lessonListState.folderId) {
          await api.post(
            `/live/lessons/folders/${lessonListState.folderId}/lessons/${createdLessonId}`,
          );
        }
      }
      closeEditor(true);
      await reloadLibrary();
    } catch (requestError) {
      setErrors(
        requestError.response?.data?.errors || [
          {
            row: 1,
            field: "import",
            message:
              requestError.response?.data?.message ||
              (editorMode === "edit"
                ? "Could not update this lesson."
                : "Could not import this lesson."),
          },
        ],
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteLesson = async (lessonId) => {
    if (
      !window.confirm(
        "Permanently delete this lesson and ALL associated session history, answers, reports, and timelines? This cannot be undone.",
      )
    )
      return;
    try {
      await api.delete(`/live/lessons/${lessonId}`);
      setSelectedLessonIds((current) =>
        current.filter((id) => String(id) !== String(lessonId)),
      );
      await reloadLibrary();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not delete lesson.",
      );
    }
  };

  const deleteSelectedLessons = async () => {
    const lessonIds = [...new Set(selectedLessonIds.map(String))];
    if (!lessonIds.length || bulkDeletingLessons) return;
    if (
      !window.confirm(
        `Permanently delete ${lessonIds.length} selected lesson${lessonIds.length === 1 ? "" : "s"} and all deletable associated session history? Lessons with a live session or Gradebook-linked history will be kept.`,
      )
    )
      return;

    setBulkDeletingLessons(true);
    setError("");
    setNotice("");
    const deletedIds = [];
    const failures = [];
    try {
      for (let index = 0; index < lessonIds.length; index += 100) {
        const batch = lessonIds.slice(index, index + 100);
        const response = await api.post("/live/lessons/bulk-delete", {
          lessonIds: batch,
        });
        const data = response.data?.data || {};
        deletedIds.push(...(data.deletedIds || []));
        failures.push(...(data.failures || []));
      }
      const deletedSet = new Set(deletedIds.map(String));
      setSelectedLessonIds((current) =>
        current.filter((id) => !deletedSet.has(String(id))),
      );
      setNotice(
        `${deletedIds.length} lesson${deletedIds.length === 1 ? "" : "s"} deleted.${failures.length ? ` ${failures.length} could not be deleted: ${failures.map((failure) => failure.message).join("; ")}` : ""}`,
      );
      await reloadLibrary();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          `Bulk delete stopped after deleting ${deletedIds.length} lessons. Reload the list and try again for the remaining selections.`,
      );
      if (deletedIds.length) {
        const deletedSet = new Set(deletedIds.map(String));
        setSelectedLessonIds((current) =>
          current.filter((id) => !deletedSet.has(String(id))),
        );
        await reloadLibrary();
      }
    } finally {
      setBulkDeletingLessons(false);
    }
  };

  const shareLessonWithTeacher = async () => {
    if (!shareLessons.length || !shareRecipient) return;
    setShareSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post("/live/shares/bulk", {
        lessonIds: shareLessons.map((lesson) => lesson._id),
        recipientId: shareRecipient,
      });
      const { invitations = [], failures = [] } = response.data?.data || {};
      const sharedIds = new Set(
        invitations.map((invitation) => String(invitation.sourceLessonId)),
      );
      const lessonTitles = new Map(
        shareLessons.map((lesson) => [String(lesson._id), lesson.title]),
      );
      setSelectedLessonIds((current) =>
        current.filter((id) => !sharedIds.has(String(id))),
      );
      const failureDetails = failures
        .map(
          ({ lessonId, message }) =>
            `${lessonTitles.get(String(lessonId)) || lessonId}: ${message}`,
        )
        .join("; ");
      setNotice(
        `${invitations.length} lesson${invitations.length === 1 ? "" : "s"} shared with ${getTeacherName(teachers.find((teacher) => String(teacher._id) === shareRecipient))}.${failureDetails ? ` Could not share: ${failureDetails}. Failed lessons remain selected.` : ""}`,
      );
      setShareLessons([]);
      setShareRecipient("");
      await loadShares();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not share these lessons.",
      );
    } finally {
      setShareSaving(false);
    }
  };

  const respondToShare = async (invitationId, action) => {
    try {
      await api.post(`/live/shares/${invitationId}/${action}`);
      await Promise.all([loadShares(), reloadLibrary()]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          `Could not ${action} this lesson invitation.`,
      );
    }
  };

  const respondToSelectedShares = async (
    action,
    invitationIds = selectedIncomingShareIds,
  ) => {
    const ids = [...new Set(invitationIds.map(String))];
    if (!ids.length || bulkRespondingToShares) return;
    if (
      action === "decline" &&
      !window.confirm(
        `Decline ${ids.length} lesson invitation${ids.length === 1 ? "" : "s"}?`,
      )
    )
      return;

    setBulkRespondingToShares(true);
    setError("");
    setNotice("");
    const completedIds = [];
    const failures = [];
    try {
      for (let index = 0; index < ids.length; index += 100) {
        const batch = ids.slice(index, index + 100);
        const response = await api.post("/live/shares/bulk-respond", {
          invitationIds: batch,
          action,
        });
        const data = response.data?.data || {};
        completedIds.push(...(data.completedIds || []));
        failures.push(...(data.failures || []));
      }
      const completedSet = new Set(completedIds.map(String));
      setSelectedIncomingShareIds((current) =>
        current.filter((id) => !completedSet.has(String(id))),
      );
      setNotice(
        `${completedIds.length} invitation${completedIds.length === 1 ? "" : "s"} ${action === "accept" ? "accepted" : "declined"}.${failures.length ? ` ${failures.length} could not be processed: ${failures.map((failure) => failure.message).join("; ")}` : ""}`,
      );
      await Promise.all([loadShares(), reloadLibrary()]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          `Bulk ${action} stopped after processing ${completedIds.length} invitations. Reload invitations and try again for the remaining selections.`,
      );
      if (completedIds.length) {
        const completedSet = new Set(completedIds.map(String));
        setSelectedIncomingShareIds((current) =>
          current.filter((id) => !completedSet.has(String(id))),
        );
        await Promise.all([loadShares(), reloadLibrary()]);
      }
    } finally {
      setBulkRespondingToShares(false);
    }
  };

  const revokeShare = async (invitationId) => {
    try {
      await api.delete(`/live/shares/${invitationId}`);
      await loadShares();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not revoke this lesson invitation.",
      );
    }
  };

  const getSessionClassId = (lesson) => {
    const availableClassIds = new Set(
      classes.map((classItem) => String(classItem._id)),
    );
    const assignedClassId = String(lesson.classId?._id || lesson.classId || "");
    if (assignedClassId && availableClassIds.has(assignedClassId)) {
      return assignedClassId;
    }
    return String(classes[0]?._id || "");
  };

  const openSessionDialog = (lesson, scheduled) => {
    const classId = getSessionClassId(lesson);
    if (!classId) {
      setError("Choose a class before starting a live lesson.");
      return;
    }
    setError("");
    setSessionDraft({
      lesson,
      classId: String(classId),
      scheduled,
      scheduledAt: scheduled
        ? localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
        : "",
      timerDurationMinutes: 45,
      meetingUrl: "",
      sendInvitationEmail: false,
    });
  };

  const createSession = async () => {
    if (!sessionDraft?.classId) return;
    const scheduleDate = sessionDraft.scheduled
      ? new Date(sessionDraft.scheduledAt)
      : null;
    if (
      sessionDraft.scheduled &&
      (!sessionDraft.scheduledAt ||
        Number.isNaN(scheduleDate.getTime()) ||
        scheduleDate <= new Date())
    ) {
      setError("Choose a scheduled time in the future.");
      return;
    }
    setCreatingSession(true);
    try {
      const response = await api.post("/live/sessions", {
        lessonId: sessionDraft.lesson._id,
        classId: sessionDraft.classId,
        timerDurationMinutes: Number(sessionDraft.timerDurationMinutes),
        meetingUrl: sessionDraft.meetingUrl.trim(),
        sendInvitationEmail: sessionDraft.sendInvitationEmail,
        ...(sessionDraft.scheduled
          ? { scheduledAt: scheduleDate.toISOString() }
          : {}),
      });
      const sessionId = response.data.data.session._id;
      const isScheduled = sessionDraft.scheduled;
      const invitationEmail = response.data.data.invitationEmail;
      const invitationNotice = invitationEmail
        ? invitationEmail.error
          ? `The session was created, but invitation emails could not be sent: ${invitationEmail.error}`
          : `Invitation emails: ${invitationEmail.sent} sent, ${invitationEmail.failed} failed${invitationEmail.skipped ? `, ${invitationEmail.skipped} skipped (no student email address)` : ""}.`
        : "";
      setSessionDraft(null);
      if (isScheduled) {
        setSessionListState({ ...defaultListState, status: "waiting" });
        setTab("sessions");
        setNotice(
          `“${response.data.data.session.lessonTitle}” is scheduled. Open the waiting session and start it when the class is ready.${invitationNotice ? ` ${invitationNotice}` : ""}`,
        );
      } else {
        navigate(`/portal/live-lessons/sessions/${sessionId}`, {
          state: invitationNotice ? { invitationNotice } : undefined,
        });
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not create the lesson session.",
      );
    } finally {
      setCreatingSession(false);
    }
  };

  const deleteSession = async (session) => {
    const title = session.lessonSnapshot?.title || "this lesson session";
    if (
      !window.confirm(
        `Permanently delete the session history for "${title}"? Its report, replay, answers, and timeline will be removed. Any gradebook scores will be kept but no longer linked to this session. The lesson itself will not be deleted.`,
      )
    )
      return;
    try {
      await api.delete(`/live/sessions/${session._id}`);
      await Promise.all([loadData(), loadSessions()]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not delete this session history.",
      );
    }
  };

  const deleteFinishedSessions = async () => {
    if (
      !window.confirm(
        "Permanently delete all of your finished live-session histories? Reports, replays, answers, and timelines will be removed. Gradebook scores will be kept but unlinked from their sessions.",
      )
    )
      return;
    setDeletingFinishedSessions(true);
    setError("");
    setNotice("");
    try {
      const response = await api.delete("/live/sessions/finished");
      const { deletedCount = 0, unlinkedGradebookCount = 0 } =
        response.data?.data || {};
      const gradebookNotice = unlinkedGradebookCount
        ? ` Gradebook scores linked to ${unlinkedGradebookCount} session${unlinkedGradebookCount === 1 ? "" : "s"} were kept and unlinked.`
        : "";
      setNotice(
        `${deletedCount} finished session${deletedCount === 1 ? "" : "s"} deleted.${gradebookNotice}`,
      );
      await loadSessions();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not delete finished session histories.",
      );
    } finally {
      setDeletingFinishedSessions(false);
    }
  };

  const setLessonDone = async (lesson) => {
    setError("");
    setNotice("");
    try {
      const isDone = !lesson.isDone;
      await api.patch(`/live/lessons/${lesson._id}/done`, { isDone });
      // With "Show done lessons" off the row has to leave this page; the server
      // owns the filter and the count, so ask it for the corrected page.
      await loadLessons();
      setNotice(`“${lesson.title}” marked as ${isDone ? "done" : "not done"}.`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update lesson status.",
      );
    }
  };

  const openMoveDialog = async (lesson) => {
    setMoveLessonTarget(lesson);
    setMoveLessonClassId("");
    setMoveLessonError("");
    setMoveLessonOptions(null);
    setMoveLessonLoading(true);
    try {
      const response = await api.get(`/live/lessons/${lesson._id}/move-targets`);
      setMoveLessonOptions(response.data?.data || null);
    } catch (requestError) {
      setMoveLessonError(
        requestError.response?.data?.message
          || "Could not load the classes you can move this lesson into.",
      );
    } finally {
      setMoveLessonLoading(false);
    }
  };

  const closeMoveDialog = () => {
    setMoveLessonTarget(null);
    setMoveLessonClassId("");
    setMoveLessonError("");
    setMoveLessonOptions(null);
    setMoveLessonLoading(false);
  };

  const moveLessonToClass = async () => {
    const lesson = moveLessonTarget;
    if (!lesson || !moveLessonClassId || moveLessonSaving) return;
    const selected = (moveLessonOptions?.targets || []).find(
      (target) => String(target._id) === String(moveLessonClassId),
    );
    setMoveLessonSaving(true);
    setMoveLessonError("");
    try {
      const response = await api.post(
        `/live/lessons/${lesson._id}/move-year`,
        { classId: moveLessonClassId },
      );
      const moved = response.data?.data?.lesson || {};
      setLessons((current) =>
        current.map((item) =>
          String(item._id) === String(lesson._id)
            ? {
                ...item,
                classId: moved.classId || item.classId,
                subjectId: moved.subjectId ?? item.subjectId,
                academicYear: moved.academicYear || item.academicYear,
              }
            : item,
        ),
      );
      setNotice(
        response.data?.message
          || `“${lesson.title}” moved to ${selected?.name || "the selected class"}.`,
      );
      closeMoveDialog();
      void loadSessions();
    } catch (requestError) {
      setMoveLessonError(
        requestError.response?.data?.message
          || "Could not move this lesson to another year.",
      );
    } finally {
      setMoveLessonSaving(false);
    }
  };

  const selectedMoveTarget = (moveLessonOptions?.targets || []).find(
    (target) => String(target._id) === String(moveLessonClassId),
  ) || null;

  // The picker groups by each class's own year, so it never depends on the summary list the server sends beside it.
  const moveLessonYears = [
    ...new Set(
      (moveLessonOptions?.targets || [])
        .map((target) => target.academicYear)
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse();

  const navigateLibrary = (view, folderId = "") => {
    setLessonSearchInput("");
    setReorderMode(false);
    setSelectedLessonIds([]);
    setOrganizeDialog(null);
    setLessonListState((current) => ({
      ...current,
      view,
      folderId,
      search: "",
      page: 1,
      order: view === "folder" ? "teaching" : "recent",
    }));
  };

  const createFolder = (parentId = null) => {
    setFolderDialog({ mode: "create", parentId, name: "" });
  };

  const renameFolder = (folder) => {
    setFolderDialog({
      mode: "rename",
      folder,
      name: folder.name,
    });
  };

  const saveFolderDialog = async (event) => {
    event.preventDefault();
    const name = folderDialog?.name.trim();
    if (!name || folderSaving) return;
    setFolderSaving(true);
    setError("");
    try {
      if (folderDialog.mode === "rename") {
        const response = await api.patch(
          `/live/lessons/folders/${folderDialog.folder._id}`,
          { name },
        );
        const updatedFolder = response.data?.data?.folder;
        setFolders((current) =>
          current.map((folder) =>
            String(folder._id) === String(updatedFolder._id)
              ? { ...folder, name: updatedFolder.name }
              : folder,
          ),
        );
        setNotice(`Folder renamed to “${updatedFolder.name}”.`);
      } else {
        const response = await api.post("/live/lessons/folders", {
          name,
          parentId: folderDialog.parentId,
        });
        const folder = response.data?.data?.folder;
        setFolders((current) => [...current, folder]);
        setNotice(`Folder “${folder.name}” created. Add lessons from All lessons or Unfiled.`);
        navigateLibrary("folder", String(folder._id));
      }
      setFolderDialog(null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          `Could not ${folderDialog.mode === "rename" ? "rename" : "create"} folder.`,
      );
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(`Delete the empty folder “${folder.name}”? Lessons and lesson history are never deleted by this action.`)) return;
    setFolderSaving(true);
    setError("");
    try {
      await api.delete(`/live/lessons/folders/${folder._id}`);
      setFolders((current) => current.filter((item) => String(item._id) !== String(folder._id)));
      if (String(lessonListState.folderId) === String(folder._id)) {
        navigateLibrary(folder.parentId ? "folder" : "home", folder.parentId ? String(folder.parentId) : "");
      }
      setNotice(`Empty folder “${folder.name}” deleted.`);
      await loadData({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete folder.");
    } finally {
      setFolderSaving(false);
    }
  };

  const toggleFolderPin = async (folder) => {
    if (folderSaving) return;
    setFolderSaving(true);
    setError("");
    try {
      const response = await api.patch(
        `/live/lessons/folders/${folder._id}`,
        { pinned: !folder.pinned },
      );
      const updated = response.data?.data?.folder;
      setFolders((current) =>
        current.map((item) =>
          String(item._id) === String(folder._id)
            ? { ...item, pinned: updated?.pinned === true }
            : item,
        ),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not update this folder.",
      );
    } finally {
      setFolderSaving(false);
    }
  };

  const removeLessonShortcut = async (lesson, folder) => {
    setFolderSaving(true);
    setError("");
    try {
      await api.delete(`/live/lessons/folders/${folder._id}/lessons/${lesson._id}`);
      setFolders((current) =>
        current.map((item) =>
          String(item._id) === String(folder._id)
            ? {
                ...item,
                lessonIds: item.lessonIds.filter(
                  (id) => String(id) !== String(lesson._id),
                ),
              }
            : item,
        ),
      );
      setNotice(`Shortcut removed from “${folder.name}”. The lesson and its history remain.`);
      void loadLessons();
      await loadData({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not remove lesson shortcut.");
    } finally {
      setFolderSaving(false);
    }
  };

  const reorderFolderLessons = async (folder, lessonId, direction) => {
    const lessonIds = folder.lessonIds.map(String);
    const index = lessonIds.indexOf(String(lessonId));
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= lessonIds.length) return;
    [lessonIds[index], lessonIds[targetIndex]] = [lessonIds[targetIndex], lessonIds[index]];
    setFolderSaving(true);
    setError("");
    try {
      await api.patch(`/live/lessons/folders/${folder._id}/lessons/order`, { lessonIds });
      setFolders((current) =>
        current.map((item) =>
          String(item._id) === String(folder._id)
            ? { ...item, lessonIds }
            : item,
        ),
      );
      void loadLessons();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not reorder folder lessons.");
    } finally {
      setFolderSaving(false);
    }
  };

  const moveLessonToPosition = async () => {
    const folder = folders.find(
      (item) => String(item._id) === String(lessonListState.folderId),
    );
    const position = Number(positionDialog?.position);
    if (!folder || !positionDialog) return;
    const lessonIds = folder.lessonIds.map(String);
    const from = lessonIds.indexOf(String(positionDialog.lessonId));
    if (!Number.isInteger(position) || position < 1 || position > lessonIds.length) {
      setError(`Enter a whole number from 1 to ${lessonIds.length}.`);
      return;
    }
    if (from < 0) return;
    const next = [...lessonIds];
    next.splice(position - 1, 0, next.splice(from, 1)[0]);
    setPositionSaving(true);
    setError("");
    try {
      await api.patch(`/live/lessons/folders/${folder._id}/lessons/order`, {
        lessonIds: next,
      });
      setFolders((current) =>
        current.map((item) =>
          String(item._id) === String(folder._id)
            ? { ...item, lessonIds: next }
            : item,
        ),
      );
      setPositionDialog(null);
      setLessonListState((current) => ({
        ...current,
        page: Math.max(1, Math.ceil(position / current.pageSize)),
      }));
      void loadLessons();
      setNotice(`Lesson moved to position ${position} in “${folder.name}”.`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not move this lesson in the folder.",
      );
    } finally {
      setPositionSaving(false);
    }
  };

  const openOrganizeDialog = (lessonIds) => {
    const ids = [...new Set(lessonIds.map(String))];
    if (!ids.length) return;
    setOrganizeDialog({
      lessonIds: ids,
      mode: "move",
      destination: "",
    });
  };

  const applyOrganize = async () => {
    const lessonIds = organizeDialog?.lessonIds || [];
    if (!lessonIds.length || organizeSaving) return;
    const mode = organizeDialog.mode;
    const destination = organizeDialog.destination;
    if (!destination) {
      setError("Choose where these lessons should go first.");
      return;
    }
    const addFolderId = destination !== "unfiled" ? destination : "";
    if (
      mode === "move" &&
      !addFolderId &&
      lessonListState.view === "unfiled"
    ) {
      return;
    }
    setOrganizeSaving(true);
    setError("");
    setNotice("");
    try {
      if (addFolderId) {
        await api.post(`/live/lessons/folders/${addFolderId}/lessons/bulk`, {
          lessonIds,
        });
      }
      if (mode === "move") {
        // From one folder the source is that folder; from All or search the
        // lesson leaves every folder it sat in, which is a true move.
        const sourceFolderIds = lessonListState.view === "folder" && lessonListState.folderId
          ? [String(lessonListState.folderId)]
          : folders
              .filter((folder) =>
                folder.lessonIds.some((id) => lessonIds.includes(String(id))),
              )
              .map((folder) => String(folder._id));
        const removeFolderIds = sourceFolderIds.filter((id) => id !== addFolderId);
        if (removeFolderIds.length) {
          await api.post("/live/lessons/folders/remove-shortcuts", {
            folderIds: removeFolderIds,
            lessonIds,
          });
        }
      }
      const destinationName = addFolderId
        ? folders.find((folder) => String(folder._id) === addFolderId)?.name ||
          "the folder"
        : "Unfiled";
      setNotice(
        mode === "move"
          ? `Moved ${lessonIds.length} lesson${lessonIds.length === 1 ? "" : "s"} to ${destinationName}. Lessons, slides and history were not copied or deleted.`
          : `Added shortcuts to ${lessonIds.length} lesson${lessonIds.length === 1 ? "" : "s"} in ${destinationName}. The lessons were not copied.`,
      );
      setOrganizeDialog(null);
      setSelectedLessonIds([]);
      setFilteredSelectionActive(false);
      void loadLessons();
      await loadData({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not organize these lessons. Reload the library and try again.",
      );
    } finally {
      setOrganizeSaving(false);
    }
  };

  const reorderSiblingFolders = async (folder, direction) => {
    const siblings = folders
      .filter((item) => String(item.parentId || "") === String(folder.parentId || ""))
      .sort((left, right) =>
        Number(right.pinned === true) - Number(left.pinned === true) ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name));
    const folderIds = siblings.map((item) => String(item._id));
    const index = folderIds.indexOf(String(folder._id));
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= folderIds.length) return;
    if (Boolean(siblings[targetIndex].pinned) !== Boolean(folder.pinned)) return;
    [folderIds[index], folderIds[targetIndex]] = [folderIds[targetIndex], folderIds[index]];
    setFolderSaving(true);
    setError("");
    try {
      await api.patch("/live/lessons/folders/order", {
        parentId: folder.parentId ? String(folder.parentId) : null,
        folderIds,
      });
      const sortOrders = new Map(folderIds.map((id, order) => [id, order]));
      setFolders((current) =>
        current.map((item) =>
          sortOrders.has(String(item._id))
            ? { ...item, sortOrder: sortOrders.get(String(item._id)) }
            : item,
        ),
      );
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not reorder folders.");
    } finally {
      setFolderSaving(false);
    }
  };

  const endSession = async (session) => {
    const title = session.lessonSnapshot?.title || "this live lesson";
    if (
      !window.confirm(
        `End "${title}" now? Students will be returned to the completed session.`,
      )
    )
      return;
    setEndingSessionId(String(session._id));
    setError("");
    try {
      await api.post(`/live/sessions/${session._id}/end`);
      await loadSessions();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not end this live session.",
      );
    } finally {
      setEndingSessionId("");
    }
  };

  const activeSlide = form.slides[selectedSlideIndex];
  const classesById = useMemo(
    () =>
      new Map(classes.map((classItem) => [String(classItem._id), classItem])),
    [classes],
  );
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [String(folder._id), folder])),
    [folders],
  );
  const folderPathNames = useCallback((folder) => {
    const names = [];
    const visited = new Set();
    let current = folder;
    while (current && !visited.has(String(current._id))) {
      visited.add(String(current._id));
      names.unshift(current.name);
      current = current.parentId
        ? folderById.get(String(current.parentId))
        : null;
    }
    return names;
  }, [folderById]);
  const folderPaths = useMemo(
    () =>
      new Map(
        folders.map((folder) => [
          String(folder._id),
          folderPathNames(folder).join(" / "),
        ]),
      ),
    [folders, folderPathNames],
  );
  const listSubjectsForClass = (classId) => {
    if (!classId) return subjects;
    const selectedClass = classesById.get(String(classId));
    const assignedIds = (selectedClass?.subjects || [])
      .map((entry) => entry.subject?._id || entry.subject)
      .filter(Boolean)
      .map(String);
    if (!assignedIds.length) return [];
    return subjects.filter((subject) =>
      assignedIds.includes(String(subject._id)),
    );
  };
  const sessionSubjects = listSubjectsForClass(sessionListState.classId);
  const editorSubjects = listSubjectsForClass(form.classId);
  const sortFolders = useCallback((list) => (
    [...list].sort((left, right) => (
      folderSort === "az"
        ? left.name.localeCompare(right.name)
        : Number(right.pinned === true) - Number(left.pinned === true) ||
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name)
    ))
  ), [folderSort]);
  const rootFolders = useMemo(
    () => sortFolders(folders.filter((folder) => !folder.parentId)),
    [folders, sortFolders],
  );
  const activeFolder = useMemo(
    () =>
      folders.find(
        (folder) => String(folder._id) === String(lessonListState.folderId),
      ) || null,
    [folders, lessonListState.folderId],
  );
  const childFolders = useMemo(
    () =>
      activeFolder
        ? sortFolders(
            folders.filter(
              (folder) =>
                String(folder.parentId || "") === String(activeFolder._id),
            ),
          )
        : [],
    [folders, activeFolder, sortFolders],
  );
  const folderLessonTotal = useCallback((folderId) => {
    const seen = new Set();
    const stack = [String(folderId)];
    let total = 0;
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const folder = folderById.get(id);
      if (!folder) continue;
      total += folder.lessonIds.length;
      for (const child of folders) {
        if (String(child.parentId || "") === id) stack.push(String(child._id));
      }
    }
    return total;
  }, [folderById, folders]);
  const lessonFolderByLesson = useMemo(() => {
    const map = new Map();
    for (const folder of folders) {
      for (const id of folder.lessonIds) {
        if (!map.has(String(id))) map.set(String(id), folder);
      }
    }
    return map;
  }, [folders]);
  const breadcrumbFolders = useMemo(() => {
    if (!activeFolder) return [];
    const chain = [];
    const visited = new Set();
    let current = activeFolder;
    while (current && !visited.has(String(current._id))) {
      visited.add(String(current._id));
      chain.unshift(current);
      current = current.parentId
        ? folderById.get(String(current.parentId))
        : null;
    }
    return chain;
  }, [activeFolder, folderById]);
  const visibleLessons = lessons;
  const lessonTotal = lessonPagination.total;
  const libraryTotal = Math.max(
    folderCounts.totalLessons || 0,
    lessonPagination.libraryTotal || 0,
    lessonPagination.total || 0,
  );
  const lessonPages = Math.max(1, lessonPagination.pages);
  const lessonPage = Math.min(lessonPagination.page, lessonPages);
  const sessionFiltersActive = Boolean(
    sessionListState.search ||
      sessionListState.classId ||
      sessionListState.subject ||
      sessionListState.status ||
      sessionListState.dateFrom ||
      sessionListState.dateTo,
  );
  const updateLessonList = (changes) =>
    setLessonListState((current) => ({ ...current, ...changes }));
  const updateSessionList = (changes) =>
    setSessionListState((current) => ({ ...current, ...changes }));
  const toggleAllFilteredLessons = async () => {
    if (filteredSelectionActive) {
      setSelectedLessonIds([]);
      setFilteredSelectionActive(false);
      return;
    }
    if (selectingAllLessons) return;
    setSelectingAllLessons(true);
    try {
      const response = await api.get("/live/lessons/selection", {
        params: {
          ...(lessonListState.view === "folder" && lessonListState.folderId
            ? { folderId: lessonListState.folderId }
            : {}),
          ...(lessonListState.view === "unfiled" ? { unfiled: "true" } : {}),
          ...(lessonListState.search
            ? { search: lessonListState.search }
            : {}),
          ...(lessonListState.subject
            ? { subjectId: lessonListState.subject }
            : {}),
        },
      });
      const rows = response.data?.data?.lessons || [];
      setSelectedLessonIds(rows.map((row) => String(row._id)));
      setLessonSummaries((current) => {
        const next = { ...current };
        for (const row of rows) {
          next[String(row._id)] = {
            _id: String(row._id),
            title: row.title || "",
          };
        }
        return next;
      });
      setFilteredSelectionActive(true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not select all filtered lessons.",
      );
    } finally {
      setSelectingAllLessons(false);
    }
  };
  const toggleLessonSelection = (lessonId, checked) =>
    setSelectedLessonIds((current) =>
      checked
        ? [...new Set([...current, String(lessonId)])]
        : current.filter((id) => String(id) !== String(lessonId)),
    );
  const togglePageSelection = (checked) =>
    setSelectedLessonIds((current) => {
      const visibleIds = new Set(
        visibleLessons.map((lesson) => String(lesson._id)),
      );
      return checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.has(String(id)));
    });
  const showRange = (page, pageSize, count) =>
    count
      ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`
      : "0 of 0";
  const getTeacherName = (teacher) =>
    [teacher?.firstName, teacher?.lastName].filter(Boolean).join(" ") ||
    teacher?.name ||
    teacher?.email ||
    "Teacher";
  const shareableTeachers = teachers;

  return (
    <div className="live-lessons-page">
      <LiveLessonsHeader
        libraryTotal={libraryTotal}
        sessionTotal={sessionPagination.total}
        userRole={user?.role}
        tab={tab}
        onTabChange={setTab}
        onNewFolder={() => createFolder()}
        onImport={openImportEditor}
        onCreateWithAi={() => navigate("/portal/live-lessons/ai-builder")}
        aiBuilder={aiBuilder}
        folderSaving={folderSaving}
        onDeleteFinishedSessions={deleteFinishedSessions}
        deletingFinishedSessions={deletingFinishedSessions}
      />

      {error && (
        <div className="live-error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="live-success-banner" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      <div
        className="live-tab-panel"
        role="tabpanel"
        id="live-lessons-panel"
        aria-labelledby={`live-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "settings" ? (
          <SettingsPanel
            isAdmin={user?.role === "admin"}
            aiHtmlReviewEnabled={aiHtmlReviewEnabled}
            savingHtmlReviewSetting={savingHtmlReviewSetting}
            onToggleAiHtmlReview={updateAiHtmlReviewSetting}
            markDraftEnabled={markDraftEnabled}
            savingMarkDraftSetting={savingMarkDraftSetting}
            onToggleMarkDraft={updateMarkDraftSetting}
            aiBuilderEnabled={aiBuilderEnabled}
            savingAiBuilderSetting={savingAiBuilderSetting}
            onToggleAiBuilder={updateAiBuilderSetting}
          />
        ) : loading || (tab === "lessons" && lessonLoading && !lessonPagination.total) ? (
          <div className="live-loading" role="status">
            <span className="live-spinner" aria-hidden="true" />
            Loading live lessons…
          </div>
        ) : tab === "lessons" ? (
          <>
            {aiBuilder.available && aiDrafts.length > 0 && (
              <AiDraftsStrip
                drafts={aiDrafts}
                discardingId={discardingDraftId}
                onResume={resumeAiDraft}
                onDiscard={discardAiDraft}
                t={builderT}
                locale={builderLocale}
              />
            )}
            {["teacher", "admin"].includes(user?.role) &&
              selectedLessonIds.length > 0 && (
                <SelectionBar
                  count={selectedLessonIds.length}
                  onShare={() => {
                    setShareLessons(
                      selectedLessonIds.map(
                        (id) =>
                          lessonSummaries[String(id)] || {
                            _id: id,
                            title: "",
                          },
                      ),
                    );
                    setShareRecipient("");
                  }}
                  onOrganize={() => openOrganizeDialog(selectedLessonIds)}
                  onDelete={deleteSelectedLessons}
                  deleting={bulkDeletingLessons}
                  onClear={() => {
                    setSelectedLessonIds([]);
                    setFilteredSelectionActive(false);
                  }}
                />
              )}
            {["teacher", "admin"].includes(user?.role) &&
              (incomingShares.length > 0 || outgoingShares.length > 0) && (
                <ShareInvitations
                  incomingShares={incomingShares}
                  outgoingShares={outgoingShares}
                  selectedIncomingShareIds={selectedIncomingShareIds}
                  bulkRespondingToShares={bulkRespondingToShares}
                  onToggleAllIncoming={(checked) =>
                    setSelectedIncomingShareIds(
                      checked
                        ? incomingShares.map((invitation) =>
                            String(invitation._id),
                          )
                        : [],
                    )
                  }
                  onToggleIncoming={(id, checked) =>
                    setSelectedIncomingShareIds((current) =>
                      checked
                        ? [...new Set([...current, String(id)])]
                        : current.filter(
                            (item) => String(item) !== String(id),
                          ),
                    )
                  }
                  onRespondToSelectedShares={respondToSelectedShares}
                  onRespondToShare={respondToShare}
                  onRevokeShare={revokeShare}
                  getTeacherName={getTeacherName}
                />
              )}
            {libraryTotal === 0 && !lessonLoading ? (
              <LibraryEmptyState
                onImport={openImportEditor}
                onDownloadTemplate={downloadTemplate}
              />
            ) : (
              <div className="live-library">
                <LibraryToolbar
                  searchValue={lessonSearchInput}
                  onSearchChange={setLessonSearchInput}
                  onClearSearch={() => setLessonSearchInput("")}
                  subjects={subjects}
                  showSubjectFilter={lessonListState.view !== "home"}
                  subjectValue={lessonListState.subject}
                  onSubjectChange={(value) =>
                    updateLessonList({ subject: value, page: 1 })
                  }
                  view={lessonListState.view}
                  onNavigateLibrary={navigateLibrary}
                  unfiledCount={folderCounts.unfiled}
                  folderSort={folderSort}
                  onFolderSortChange={(value) => {
                    setFolderSort(value);
                    if (value !== "order") {
                      setReorderMode(false);
                    }
                  }}
                  reorderMode={reorderMode}
                  onToggleReorder={() => setReorderMode((value) => !value)}
                  order={lessonListState.order}
                  onOrderChange={(value) =>
                    updateLessonList({ order: value, page: 1 })
                  }
                  folderSaving={folderSaving}
                  userRole={user?.role}
                  lessonTotal={lessonTotal}
                  onToggleAllFiltered={toggleAllFilteredLessons}
                  selectingAllLessons={selectingAllLessons}
                  filteredSelectionActive={filteredSelectionActive}
                />

                {lessonListState.view === "folder" && (
                  <div className="live-library-folderbar">
                    <LibraryBreadcrumbs
                      breadcrumbFolders={breadcrumbFolders}
                      onNavigateLibrary={navigateLibrary}
                    />
                    <FolderActions
                      activeFolder={activeFolder}
                      childFolders={childFolders}
                      folderSaving={folderSaving}
                      onCreateFolder={createFolder}
                      onRenameFolder={renameFolder}
                      onDeleteFolder={deleteFolder}
                    />
                  </div>
                )}

                {lessonListState.view === "home" ? (
                  <FolderGrid
                    rootFolders={rootFolders}
                    folders={folders}
                    reorderMode={reorderMode}
                    folderSaving={folderSaving}
                    folderLessonTotal={folderLessonTotal}
                    unfiledCount={folderCounts.unfiled}
                    onOpenFolder={(folderId) =>
                      navigateLibrary("folder", folderId)
                    }
                    onReorderSibling={reorderSiblingFolders}
                    onTogglePin={(folder) => void toggleFolderPin(folder)}
                    onCreateFolder={() => createFolder()}
                    onOrganizeUnfiled={() => navigateLibrary("unfiled")}
                  />
                ) : (
                  <LessonsListView
                    listState={lessonListState}
                    updateLessonList={updateLessonList}
                    activeFolder={activeFolder}
                    childFolders={childFolders}
                    folders={folders}
                    folderPaths={folderPaths}
                    folderLessonTotal={folderLessonTotal}
                    reorderMode={reorderMode}
                    folderSaving={folderSaving}
                    lessonPage={lessonPage}
                    lessonPages={lessonPages}
                    lessonLoading={lessonLoading}
                    lessons={visibleLessons}
                    userRole={user?.role}
                    selectedLessonIds={selectedLessonIds}
                    onTogglePageSelection={togglePageSelection}
                    onToggleLessonSelection={toggleLessonSelection}
                    onNavigateLibrary={navigateLibrary}
                    lessonFolderByLesson={lessonFolderByLesson}
                    onReorderLesson={reorderFolderLessons}
                    onSetPosition={(lesson, position) =>
                      setPositionDialog({
                        lessonId: String(lesson._id),
                        title: lesson.title,
                        position,
                      })
                    }
                    onPreviewLesson={(lessonId) =>
                      void openLessonPreview(lessonId)
                    }
                    onStartLesson={(lesson) =>
                      openSessionDialog(lesson, false)
                    }
                    getSessionClassId={getSessionClassId}
                    lessonActionMenu={lessonActionMenu}
                    onToggleActionMenu={toggleLessonActionMenu}
                    lessonActionMenuRef={lessonActionMenuRef}
                    exportingLessonId={exportingLessonId}
                    onOpenLessonEditor={openLessonEditor}
                    onOpenOrganizeDialog={openOrganizeDialog}
                    onRemoveShortcut={removeLessonShortcut}
                    onExportLesson={(lesson) => void exportLesson(lesson)}
                    onShareLesson={(lesson) => {
                      setShareLessons([lesson]);
                      setShareRecipient("");
                    }}
                    onToggleLessonDone={setLessonDone}
                    onOpenMoveDialog={(lesson) => void openMoveDialog(lesson)}
                    onDeleteLesson={deleteLesson}
                    onCloseActionMenu={() => setLessonActionMenu(null)}
                    rangeText={showRange(
                      lessonPage,
                      lessonListState.pageSize,
                      lessonTotal,
                    )}
                    onClearSearch={() => setLessonSearchInput("")}
                    onImport={openImportEditor}
                    onUpdatePage={(page) => updateLessonList({ page })}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <SessionHistory
            sessions={sessions}
            classes={classes}
            classesById={classesById}
            sessionSubjects={sessionSubjects}
            sessionListState={sessionListState}
            updateSessionList={updateSessionList}
            sessionSearchInput={sessionSearchInput}
            setSessionSearchInput={setSessionSearchInput}
            sessionFiltersActive={sessionFiltersActive}
            endingSessionId={endingSessionId}
            onEndSession={endSession}
            onDeleteSession={deleteSession}
            sessionPagination={sessionPagination}
            rangeText={showRange(
              sessionPagination.page || sessionListState.page,
              sessionListState.pageSize,
              sessionPagination.total,
            )}
            navigate={navigate}
            user={user}
          />
        )}
      </div>

      <PreviewDialog
        previewLoading={previewLoading}
        previewLesson={previewLesson}
        previewError={previewError}
        previewSlideIndex={previewSlideIndex}
        onSlideChange={setPreviewSlideIndex}
        onClose={() => {
          setPreviewLesson(null);
          setPreviewError("");
        }}
      />

      <SessionDialog
        sessionDraft={sessionDraft}
        setSessionDraft={setSessionDraft}
        creatingSession={creatingSession}
        onCreate={createSession}
        classes={classes}
      />

      <FolderDialog
        folderDialog={folderDialog}
        setFolderDialog={setFolderDialog}
        folderSaving={folderSaving}
        onSubmit={saveFolderDialog}
        onClose={() => setFolderDialog(null)}
      />

      <OrganizeDialog
        organizeDialog={organizeDialog}
        setOrganizeDialog={setOrganizeDialog}
        organizeSaving={organizeSaving}
        folderPaths={folderPaths}
        currentFolderId={lessonListState.folderId}
        unfiledView={lessonListState.view === "unfiled"}
        onSubmit={() => void applyOrganize()}
        onClose={() => setOrganizeDialog(null)}
      />

      <PositionDialog
        positionDialog={positionDialog}
        setPositionDialog={setPositionDialog}
        positionSaving={positionSaving}
        maxPosition={activeFolder?.lessonIds.length || 0}
        onSubmit={() => void moveLessonToPosition()}
        onClose={() => setPositionDialog(null)}
      />

      <ShareDialog
        shareLessons={shareLessons}
        onClose={() => setShareLessons([])}
        shareRecipient={shareRecipient}
        setShareRecipient={setShareRecipient}
        teachers={shareableTeachers}
        getTeacherName={getTeacherName}
        shareSaving={shareSaving}
        onSend={shareLessonWithTeacher}
      />

      <MoveDialog
        target={moveLessonTarget}
        options={moveLessonOptions}
        loading={moveLessonLoading}
        classId={moveLessonClassId}
        setClassId={setMoveLessonClassId}
        years={moveLessonYears}
        selectedTarget={selectedMoveTarget}
        error={moveLessonError}
        saving={moveLessonSaving}
        onClose={closeMoveDialog}
        onMove={moveLessonToClass}
      />

      <ImportEditorDialog
        open={importOpen}
        editorMode={editorMode}
        saving={saving}
        onClose={closeEditor}
        onCopyAiPrompt={copyAiPrompt}
        promptCopied={promptCopied}
        fileName={fileName}
        hasSelectedFile={Boolean(selectedFile)}
        onSelectFile={handleSelectFile}
        errors={errors}
        form={form}
        setForm={setForm}
        classes={classes}
        editorSubjects={editorSubjects}
        activeSlide={activeSlide}
        selectedSlideIndex={selectedSlideIndex}
        onSelectSlide={setSelectedSlideIndex}
        onAddSlide={addSlide}
        onDeleteSelectedSlide={deleteSelectedSlide}
        onChangeSlideType={changeSlideType}
        onUpdateSlide={updateSlide}
        onSave={saveImportedLesson}
      />
    </div>
  );
};

export default LiveLessonsPage;
