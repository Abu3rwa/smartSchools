import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineClipboardDocument,
  HiOutlineEllipsisVertical,
  HiOutlineEye,
  HiOutlinePencilSquare,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlinePresentationChartBar,
  HiOutlineShare,
  HiOutlineStop,
  HiOutlineTrash,
} from "react-icons/hi2";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import { fetchClasses, selectClasses } from "../../store/slices/classSlice";
import { fetchSubjects, selectSubjects } from "../../store/slices/subjectSlice";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import LiveQuestionEditor from "../../components/liveLessons/LiveQuestionEditor";
import {
  LIVE_QUESTION_KIND_LABELS,
  buildLiveQuestionPayload,
  createLiveQuestion,
  linkLiveLessonLevels,
  prepareLiveQuestion,
} from "../../utils/liveLessonQuestionDraft.js";
import { LIVE_LESSON_SAMPLE_CSV } from "./liveLessonCsvTemplate";
import { LIVE_LESSON_AI_PROMPT } from "./liveLessonAiPrompt";
import QuestionTypeGuide from "../../components/assessment/QuestionTypeGuide";
import "./LiveLessonsPage.css";

const emptyForm = {
  title: "",
  description: "",
  subject: "",
  classId: "",
  subjectId: "",
  grade: "",
  language: "en",
  slides: [],
};
const defaultListState = {
  classId: "",
  subject: "",
  page: 1,
  pageSize: 25,
  showDone: false,
  folderId: "",
  search: "",
  dateFrom: "",
  dateTo: "",
  status: "",
};
const SHOW_LESSON_FOLDERS = false;

/**
 * The editor works on a complete question draft, so every input it shows has a value, and the kind's
 * unused fields are emptied at save instead of at every keystroke. A levelled slide imported from a
 * CSV names its group in words, because a group id only means something inside this class.
 */
const toEditorSlide = (slide = {}) => ({
  ...slide,
  examples: slide.examples || [],
  question: slide.question ? prepareLiveQuestion(slide.question) : undefined,
  variants: (slide.variants || []).map((variant) => ({
    ...(variant.groupId ? { groupId: String(variant.groupId) } : {}),
    ...(variant.group ? { group: variant.group } : {}),
    question: prepareLiveQuestion(variant.question),
  })),
});

const toStoredSlide = (slide = {}) => {
  const { variants = [], ...rest } = slide;
  return {
    ...rest,
    ...(slide.question ? { question: buildLiveQuestionPayload(slide.question) } : {}),
    ...(variants.length
      ? {
        // A level is stored by group id; the CSV's name was only ever how the teacher wrote it down.
        variants: variants.map((variant) => ({
          groupId: variant.groupId,
          question: buildLiveQuestionPayload(variant.question),
        })),
      }
      : {}),
  };
};

const liveNumericRuleSummary = (rule = {}) => {
  const unit = rule.unit ? ` ${rule.unit}` : "";
  if (rule.mode === "range") {
    return `Any value from ${rule.min}${unit} to ${rule.max}${unit}.`;
  }
  if (rule.mode === "tolerance") {
    return `${rule.value}${unit} plus or minus ${rule.tolerance}${unit}.`;
  }
  if (rule.mode === "relative") {
    return `Within ${rule.tolerance}% of ${rule.value}${unit}.`;
  }
  return `${rule.value}${unit}.`;
};

/**
 * Levelled questions are no longer authored in the editor, so the only way a slide can arrive with a
 * level is a CSV that named one. A name this class does not have would send that level to nobody.
 */
const unlinkedLevelMessage = (slides = []) => {
  const index = slides.findIndex((entry) =>
    (entry.variants || []).some((variant) => !variant.groupId),
  );
  if (index === -1) return "";
  const variant = slides[index].variants.find((entry) => !entry.groupId);
  return `Slide ${index + 1} has a levelled question${variant.group ? ` for the group "${variant.group}"` : ""}, which this class does not have. Correct that group name in the CSV, or remove the levelled question.`;
};

const normalizeListState = (saved = {}) => {
  const preferences = saved && typeof saved === "object" ? saved : {};
  return {
    classId: typeof preferences.classId === "string" ? preferences.classId : "",
    subject: typeof preferences.subject === "string" ? preferences.subject : "",
    page:
      Number.isInteger(Number(preferences.page)) && Number(preferences.page) > 0
        ? Number(preferences.page)
        : 1,
    pageSize: [10, 25, 50].includes(Number(preferences.pageSize))
      ? Number(preferences.pageSize)
      : 25,
    showDone: preferences.showDone === true,
    folderId: typeof preferences.folderId === "string" ? preferences.folderId : "",
    search: typeof preferences.search === "string" ? preferences.search : "",
    dateFrom:
      typeof preferences.dateFrom === "string" ? preferences.dateFrom : "",
    dateTo: typeof preferences.dateTo === "string" ? preferences.dateTo : "",
    status: ["waiting", "live", "ended"].includes(preferences.status)
      ? preferences.status
      : "",
  };
};

const localDateTimeValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const readListPreferences = (key) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "{}");
    return {
      lessons: normalizeListState(saved.lessons),
      sessions: normalizeListState(saved.sessions),
    };
  } catch {
    return { lessons: defaultListState, sessions: defaultListState };
  }
};

const downloadTemplate = () => {
  const blob = new Blob([LIVE_LESSON_SAMPLE_CSV], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "live-lesson-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const downloadLessonCsv = async (lesson) => {
  const response = await api.get(`/live/lessons/${lesson._id}/export.csv`, {
    responseType: "blob",
  });
  const blob = response.data;
  const header = await blob.slice(0, 64).text();
  if (!String(response.headers?.["content-type"] || "").toLowerCase().includes("text/csv") ||
      !header.replace(/^\uFEFF/, "").startsWith("format_version,")) {
    throw new Error("The export response was not a valid Live Lesson CSV.");
  }
  const disposition = String(response.headers?.["content-disposition"] || "");
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "live-lesson.csv";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const formatSessionDuration = (session) => {
  if (!session.startedAt) return "—";
  const end = session.endedAt
    ? new Date(session.endedAt).getTime()
    : Date.now();
  const pausedAt =
    session.paused && session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : NaN;
  const currentPauseMs = Number.isFinite(pausedAt)
    ? Math.max(0, end - pausedAt)
    : 0;
  const pausedMs =
    Math.max(0, Number(session.totalPausedMs) || 0) + currentPauseMs;
  const minutes = Math.max(
    0,
    Math.floor(
      (end - new Date(session.startedAt).getTime() - pausedMs) / 60000,
    ),
  );
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const getSessionDisplayDate = (session) =>
  session.scheduledAt && session.status === "waiting"
    ? session.scheduledAt
    : session.startedAt || session.createdAt;

const LiveLessonsPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const user = useSelector(selectUser);
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
  const [lessonClasses, setLessonClasses] = useState({});
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
  const [shortcutTargets, setShortcutTargets] = useState({});
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
  const [lessonListState, setLessonListState] = useState(defaultListState);
  const [sessionListState, setSessionListState] = useState(defaultListState);
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
  // library downloads one page instead of every lesson they ever wrote.
  const loadLessons = useCallback(async () => {
    const requestId = lessonRequestRef.current + 1;
    lessonRequestRef.current = requestId;
    setLessonLoading(true);
    try {
      const response = await api.get("/live/lessons", {
        params: {
          page: lessonListState.page,
          limit: lessonListState.pageSize,
          includeDone: lessonListState.showDone ? "true" : "false",
          ...(lessonListState.classId
            ? { classId: lessonListState.classId }
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
    lessonListState.classId,
    lessonListState.page,
    lessonListState.pageSize,
    lessonListState.showDone,
    lessonListState.subject,
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsResponse, folderResponse] = await Promise.all([
        api.get("/live/settings"),
        api.get("/live/lessons/folders"),
      ]);
      setFolders(folderResponse.data?.data?.folders || []);
      setFoldersLoaded(true);
      setAiHtmlReviewEnabled(
        settingsResponse.data?.data?.aiHtmlReviewEnabled === true,
      );
      setMarkDraftEnabled(
        settingsResponse.data?.data?.aiMarkDraftEnabled === true,
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not load live lessons.",
      );
    } finally {
      setLoading(false);
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
    setPreferencesLoaded(true);
  }, [preferencesKey]);

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

  useEffect(() => {
    if (preferencesLoaded && classesLoaded && subjectsLoaded) loadSessions();
  }, [loadSessions, preferencesLoaded, classesLoaded, subjectsLoaded]);

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
    setLessonListState((current) => sanitize(current, false));
    setSessionListState((current) => sanitize(current, true));
    setLessonListState((current) => {
      const validFolder = !current.folderId ||
        current.folderId === "__unfiled__" ||
        folders.some((folder) => String(folder._id) === current.folderId);
      return validFolder ? current : { ...current, folderId: "", page: 1 };
    });
  }, [preferencesLoaded, classesLoaded, subjectsLoaded, foldersLoaded, classes, subjects, folders]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    loadLessons();
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
    lessonListState.classId,
    lessonListState.showDone,
    lessonListState.subject,
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
        await api.post("/live/lessons", lessonData);
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
    const savedChoice = lessonClasses[lesson._id];
    if (savedChoice && availableClassIds.has(String(savedChoice))) {
      return String(savedChoice);
    }
    const assignedClassId = String(lesson.classId?._id || lesson.classId || "");
    if (assignedClassId && availableClassIds.has(assignedClassId)) {
      return assignedClassId;
    }
    const filteredClassId = String(lessonListState.classId || "");
    if (filteredClassId && availableClassIds.has(filteredClassId)) {
      return filteredClassId;
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
      // The launch picker and the session list were both filtered by the old class.
      setLessonClasses((current) => {
        const next = { ...current };
        delete next[lesson._id];
        return next;
      });
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
              ? updatedFolder
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
        setLessonListState((current) => ({
          ...current,
          folderId: String(folder._id),
          page: 1,
        }));
        setNotice(`Folder “${folder.name}” created.`);
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
      setLessonListState((current) => ({
        ...current,
        folderId: String(current.folderId) === String(folder._id)
          ? (folder.parentId ? String(folder.parentId) : "")
          : current.folderId,
        page: 1,
      }));
      setNotice(`Empty folder “${folder.name}” deleted.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete folder.");
    } finally {
      setFolderSaving(false);
    }
  };

  const addLessonShortcut = async (lesson, folderId) => {
    if (!folderId) {
      setError("Choose a folder before adding a shortcut.");
      return;
    }
    setFolderSaving(true);
    setError("");
    try {
      await api.post(`/live/lessons/folders/${folderId}/lessons/${lesson._id}`);
      setFolders((current) =>
        current.map((folder) =>
          String(folder._id) === String(folderId) &&
          !folder.lessonIds.some((id) => String(id) === String(lesson._id))
            ? { ...folder, lessonIds: [...folder.lessonIds, lesson._id] }
            : folder,
        ),
      );
      setShortcutTargets((current) => ({ ...current, [lesson._id]: "" }));
      setNotice(`Shortcut to “${lesson.title}” added. The original lesson was not copied.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not add lesson shortcut.");
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
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not reorder folder lessons.");
    } finally {
      setFolderSaving(false);
    }
  };

  const reorderSiblingFolders = async (folder, direction) => {
    const siblings = folders
      .filter((item) => String(item.parentId || "") === String(folder.parentId || ""))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const folderIds = siblings.map((item) => String(item._id));
    const index = folderIds.indexOf(String(folder._id));
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= folderIds.length) return;
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
  const folderPaths = useMemo(() => {
    const folderById = new Map(folders.map((folder) => [String(folder._id), folder]));
    return new Map(folders.map((folder) => {
      const path = [];
      const visited = new Set();
      let current = folder;
      while (current && !visited.has(String(current._id))) {
        visited.add(String(current._id));
        path.unshift(current.name);
        current = current.parentId
          ? folderById.get(String(current.parentId))
          : null;
      }
      return [String(folder._id), path.join(" / ")];
    }));
  }, [folders]);
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
  const lessonSubjects = listSubjectsForClass(lessonListState.classId);
  const sessionSubjects = listSubjectsForClass(sessionListState.classId);
  const editorSubjects = listSubjectsForClass(form.classId);
  const activeFolder = SHOW_LESSON_FOLDERS
    ? folders.find((folder) => String(folder._id) === lessonListState.folderId)
    : null;
  const folderLessonIds = new Set(folders.flatMap((folder) => (folder.lessonIds || []).map(String)));
  // The server applies the filters, the sort, and the page slice, so these rows are
  // already exactly what this page of the library shows.
  const visibleLessons = lessons;
  const lessonTotal = lessonPagination.total;
  const libraryTotal = lessonPagination.libraryTotal || lessonPagination.total;
  const lessonPages = Math.max(1, lessonPagination.pages);
  const lessonPage = Math.min(lessonPagination.page, lessonPages);
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
          includeDone: lessonListState.showDone ? "true" : "false",
          ...(lessonListState.classId
            ? { classId: lessonListState.classId }
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
  const renderFolderTree = (parentId = null, depth = 0) => folders
    .filter((folder) => String(folder.parentId || "") === String(parentId || ""))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .map((folder) => (
      <div className="live-folder-tree-node" key={folder._id}>
        <div className={`live-folder-tree-row ${lessonListState.folderId === String(folder._id) ? "active" : ""}`}>
          <button
            className="live-folder-select"
            style={{ paddingLeft: `${0.65 + depth * 1.1}rem` }}
            onClick={() => updateLessonList({ folderId: String(folder._id), page: 1 })}
            aria-current={lessonListState.folderId === String(folder._id) ? "page" : undefined}
          >
            <span>{folder.name}</span>
            <small>{folder.lessonIds.length}</small>
          </button>
          <button
            type="button"
            title="Move folder up"
            aria-label={`Move ${folder.name} up`}
            disabled={folderSaving || !folders.some((item) =>
              String(item.parentId || "") === String(folder.parentId || "") &&
              item.sortOrder < folder.sortOrder)}
            onClick={() => reorderSiblingFolders(folder, -1)}
          >↑</button>
          <button
            type="button"
            title="Move folder down"
            aria-label={`Move ${folder.name} down`}
            disabled={folderSaving || !folders.some((item) =>
              String(item.parentId || "") === String(folder.parentId || "") &&
              item.sortOrder > folder.sortOrder)}
            onClick={() => reorderSiblingFolders(folder, 1)}
          >↓</button>
        </div>
        {renderFolderTree(String(folder._id), depth + 1)}
      </div>
    ));

  return (
    <div className="live-lessons-page">
      <nav className="live-lessons-tabs" aria-label="Live lesson sections">
        <button
          className={tab === "lessons" ? "active" : ""}
          onClick={() => setTab("lessons")}
        >
          My lessons <span>{libraryTotal}</span>
        </button>
        <button
          className={tab === "sessions" ? "active" : ""}
          onClick={() => setTab("sessions")}
        >
          Session history <span>{sessionPagination.total}</span>
        </button>
        {user?.role === "admin" && (
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            School settings
          </button>
        )}
      </nav>

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
      {tab === "settings" ? (
        <>
          {user?.role === "admin" && (
            <section className="live-safety-setting">
              <div>
                <strong>AI HTML safety review</strong>
                <p>
                  When enabled, AI reviews HTML and scripts before saving. When
                  disabled, CSS animation still works but slides containing
                  JavaScript are rejected. Approved scripts run in an isolated,
                  network-restricted sandbox.
                </p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={aiHtmlReviewEnabled}
                  disabled={savingHtmlReviewSetting}
                  onChange={(event) =>
                    updateAiHtmlReviewSetting(event.target.checked)
                  }
                />
                {savingHtmlReviewSetting
                  ? "Saving…"
                  : aiHtmlReviewEnabled
                    ? "Enabled"
                    : "Disabled"}
              </label>
            </section>
          )}
          {user?.role === "admin" && (
            <section className="live-safety-setting">
              <div>
                <strong>Suggested marks for approval</strong>
                <p>
                  When enabled, a teacher marking a live session can ask for a
                  first mark and comment on the written answers that are waiting.
                  Nothing is saved or shared until the teacher approves it, and
                  turning this off leaves the mark sheet exactly as it was.
                </p>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={markDraftEnabled}
                  disabled={savingMarkDraftSetting}
                  onChange={(event) =>
                    updateMarkDraftSetting(event.target.checked)
                  }
                />
                {savingMarkDraftSetting
                  ? "Saving…"
                  : markDraftEnabled
                    ? "Enabled"
                    : "Disabled"}
              </label>
            </section>
          )}
        </>
      ) : loading || (tab === "lessons" && lessonLoading && !lessonPagination.total) ? (
        <div className="live-loading">Loading live lessons…</div>
      ) : tab === "lessons" ? (
        <>
          <div className="live-lessons-actions">
            <div className="live-session-actions">
              <button className="live-text-button" onClick={copyAiPrompt}>
                {promptCopied ? (
                  <HiOutlineCheck />
                ) : (
                  <HiOutlineClipboardDocument />
                )}
                {promptCopied
                  ? "Copied to clipboard"
                  : "Copy AI prompt + sample"}
              </button>
              {["teacher", "admin"].includes(user?.role) &&
                selectedLessonIds.length > 0 && (
                  <>
                    <button
                      className="live-secondary-button"
                      onClick={() => {
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
                    >
                      <HiOutlineShare /> Share selected (
                      {selectedLessonIds.length})
                    </button>
                    <button
                      className="live-delete-session"
                      onClick={deleteSelectedLessons}
                      disabled={bulkDeletingLessons}
                    >
                      <HiOutlineTrash />{" "}
                      {bulkDeletingLessons
                        ? "Deleting…"
                        : `Delete selected (${selectedLessonIds.length})`}
                    </button>
                  </>
                )}
              {["teacher", "admin"].includes(user?.role) && lessonTotal > 0 && (
                <button
                  className="live-text-button"
                  onClick={toggleAllFilteredLessons}
                  disabled={selectingAllLessons}
                >
                  {filteredSelectionActive
                    ? "Clear all filtered selections"
                    : selectingAllLessons
                      ? "Selecting lessons…"
                      : `Select all filtered lessons (${lessonTotal})`}
                </button>
              )}
              <button
                className="live-primary-button"
                onClick={openImportEditor}
              >
                <HiOutlineArrowUpTray /> Import CSV lesson
              </button>
            </div>
          </div>
          {["teacher", "admin"].includes(user?.role) &&
            (incomingShares.length > 0 || outgoingShares.length > 0) && (
              <section
                className="live-share-invitations"
                aria-label="Lesson sharing invitations"
              >
                {incomingShares.length > 0 && (
                  <div>
                    <div className="live-share-bulk-heading">
                      <h2>Lessons shared with you</h2>
                      <label>
                        <input
                          type="checkbox"
                          aria-label="Select all incoming lesson invitations"
                          checked={
                            incomingShares.length > 0 &&
                            incomingShares.every((invitation) =>
                              selectedIncomingShareIds.includes(
                                String(invitation._id),
                              ),
                            )
                          }
                          onChange={(event) =>
                            setSelectedIncomingShareIds(
                              event.target.checked
                                ? incomingShares.map((invitation) =>
                                    String(invitation._id),
                                  )
                                : [],
                            )
                          }
                        />
                        Select all
                      </label>
                    </div>
                    <div className="live-share-bulk-actions">
                      <button
                        className="live-primary-button"
                        disabled={bulkRespondingToShares}
                        onClick={() =>
                          respondToSelectedShares(
                            "accept",
                            incomingShares.map((invitation) =>
                              String(invitation._id),
                            ),
                          )
                        }
                      >
                        {bulkRespondingToShares ? "Processing…" : "Accept all"}
                      </button>
                      <button
                        className="live-secondary-button"
                        disabled={bulkRespondingToShares}
                        onClick={() =>
                          respondToSelectedShares(
                            "decline",
                            incomingShares.map((invitation) =>
                              String(invitation._id),
                            ),
                          )
                        }
                      >
                        Decline all
                      </button>
                      {selectedIncomingShareIds.length > 0 && (
                        <>
                          <button
                            className="live-primary-button"
                            disabled={bulkRespondingToShares}
                            onClick={() => respondToSelectedShares("accept")}
                          >
                            Accept selected ({selectedIncomingShareIds.length})
                          </button>
                          <button
                            className="live-secondary-button"
                            disabled={bulkRespondingToShares}
                            onClick={() => respondToSelectedShares("decline")}
                          >
                            Decline selected ({selectedIncomingShareIds.length})
                          </button>
                        </>
                      )}
                    </div>
                    <ul>
                      {incomingShares.map((invitation) => (
                        <li key={invitation._id}>
                          <input
                            type="checkbox"
                            aria-label={`Select invitation for ${invitation.lesson?.title || "shared lesson"}`}
                            checked={selectedIncomingShareIds.includes(
                              String(invitation._id),
                            )}
                            disabled={bulkRespondingToShares}
                            onChange={(event) =>
                              setSelectedIncomingShareIds((current) =>
                                event.target.checked
                                  ? [
                                      ...new Set([
                                        ...current,
                                        String(invitation._id),
                                      ]),
                                    ]
                                  : current.filter(
                                      (id) =>
                                        String(id) !== String(invitation._id),
                                    ),
                              )
                            }
                          />
                          <div>
                            <strong>
                              {invitation.lesson?.title || "Shared lesson"}
                            </strong>
                            <span>
                              From{" "}
                              {[
                                invitation.sender?.firstName,
                                invitation.sender?.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || "a teacher"}
                              {invitation.lesson?.subject
                                ? ` · ${invitation.lesson.subject}`
                                : ""}
                            </span>
                          </div>
                          <div className="live-share-actions">
                            <button
                              className="live-primary-button"
                              disabled={bulkRespondingToShares}
                              onClick={() =>
                                respondToShare(invitation._id, "accept")
                              }
                            >
                              Accept and add
                            </button>
                            <button
                              className="live-secondary-button"
                              disabled={bulkRespondingToShares}
                              onClick={() =>
                                respondToShare(invitation._id, "decline")
                              }
                            >
                              Decline
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {outgoingShares.length > 0 && (
                  <div>
                    <h2>Pending shares</h2>
                    <ul>
                      {outgoingShares.map((invitation) => (
                        <li key={invitation._id}>
                          <div>
                            <strong>
                              {invitation.lesson?.title || "Shared lesson"}
                            </strong>
                            <span>
                              Shared with {getTeacherName(invitation.recipient)}
                            </span>
                          </div>
                          <button
                            className="live-delete-session"
                            onClick={() => revokeShare(invitation._id)}
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          {libraryTotal === 0 && !lessonLoading ? (
            <div className="live-empty-state">
              <div className="live-empty-icon">
                <HiOutlinePresentationChartBar size={32} />
              </div>
              <h2>Start with a lesson you already teach</h2>
              <p>
                Import a CSV to create opening, teaching, example, question,
                activity, and exit-ticket slides. No AI generation required.
              </p>
              <button
                className="live-primary-button"
                onClick={openImportEditor}
              >
                <HiOutlinePlus /> Import your first lesson
              </button>
              <button className="live-text-button" onClick={downloadTemplate}>
                <HiOutlineArrowDownTray /> Download the sample lesson CSV
              </button>
            </div>
          ) : (
            <>
              {SHOW_LESSON_FOLDERS && (
              <section className="live-folder-organizer" aria-label="Organize lessons">
                <nav className="live-folder-navigation" aria-label="Lesson folders">
                  <div className="live-folder-navigation-heading">
                    <span>Folders</span>
                    <button
                      className="live-folder-create-button"
                      disabled={folderSaving}
                      onClick={() => createFolder()}
                    >
                      <HiOutlinePlus /> New
                    </button>
                  </div>
                  <button
                    className={`live-folder-select ${!lessonListState.folderId ? "active" : ""}`}
                    onClick={() => updateLessonList({ folderId: "", page: 1 })}
                    aria-current={!lessonListState.folderId ? "page" : undefined}
                  >
                    <span>All lessons</span>
                    <small>{libraryTotal}</small>
                  </button>
                  <button
                    className={`live-folder-select ${lessonListState.folderId === "__unfiled__" ? "active" : ""}`}
                    onClick={() => updateLessonList({ folderId: "__unfiled__", page: 1 })}
                    aria-current={lessonListState.folderId === "__unfiled__" ? "page" : undefined}
                  >
                    <span>Unfiled</span>
                    <small>{lessons.filter((lesson) => !folderLessonIds.has(String(lesson._id))).length}</small>
                  </button>
                  <div className="live-folder-tree">{renderFolderTree()}</div>
                </nav>
                <div className="live-folder-management">
                  <div className="live-folder-management-heading">
                    <div>
                      <span className="live-folder-eyebrow">
                        {activeFolder ? "SELECTED FOLDER" : "LESSON LIBRARY"}
                      </span>
                      <h2>{activeFolder?.name || "All lessons"}</h2>
                    </div>
                  </div>
                  <div className="live-folder-management-actions">
                    {activeFolder && (
                      <>
                        <button
                          className="live-secondary-button"
                          disabled={folderSaving}
                          onClick={() => createFolder(String(activeFolder._id))}
                        ><HiOutlinePlus /> Add subfolder</button>
                        <button
                          className="live-secondary-button"
                          disabled={folderSaving}
                          onClick={() => renameFolder(activeFolder)}
                        ><HiOutlinePencilSquare /> Rename folder</button>
                        <button
                          className="live-delete-session"
                          disabled={folderSaving}
                          onClick={() => deleteFolder(activeFolder)}
                        ><HiOutlineTrash /> Delete empty</button>
                      </>
                    )}
                  </div>
                  <p className="live-folder-helper">
                    {activeFolder
                      ? "Lessons can appear in multiple folders. Assignments and session history stay unchanged."
                      : "Create folders for units, weeks, or topics. Add lessons as shortcuts without changing the originals."}
                  </p>
                </div>
              </section>
              )}
              <div className="live-list-filters" aria-label="Filter lessons">
                <span className="live-list-filters-heading">Filter lessons</span>
                <label>
                  Assigned class
                  <select
                    value={lessonListState.classId}
                    onChange={(event) =>
                      updateLessonList({
                        classId: event.target.value,
                        subject: "",
                        page: 1,
                      })
                    }
                  >
                    <option value="">All classes</option>
                    {classes.map((classItem) => (
                      <option key={classItem._id} value={classItem._id}>
                        {classItem.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Subject
                  <select
                    value={lessonListState.subject}
                    onChange={(event) =>
                      updateLessonList({ subject: event.target.value, page: 1 })
                    }
                  >
                    <option value="">All subjects</option>
                    {lessonSubjects.map((subject) => (
                      <option key={subject._id} value={subject._id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="live-checkbox-filter">
                  <input
                    type="checkbox"
                    checked={lessonListState.showDone}
                    onChange={(event) =>
                      updateLessonList({
                        showDone: event.target.checked,
                        page: 1,
                      })
                    }
                  />
                  Show done lessons
                </label>
                <button
                  className="live-text-button"
                  onClick={() => updateLessonList({ ...defaultListState })}
                >
                  Clear filters
                </button>
              </div>
              <div className="live-list-table-wrap">
                <table className="live-list-table">
                  <thead>
                    <tr>
                      <th>
                        {["teacher", "admin"].includes(user?.role) && (
                          <input
                            type="checkbox"
                            aria-label="Select all lessons on this page"
                            checked={
                              visibleLessons.length > 0 &&
                              visibleLessons.every((lesson) =>
                                selectedLessonIds.includes(String(lesson._id)),
                              )
                            }
                            onChange={(event) =>
                              setSelectedLessonIds((current) => {
                                const visibleIds = new Set(
                                  visibleLessons.map((lesson) =>
                                    String(lesson._id),
                                  ),
                                );
                                return event.target.checked
                                  ? [...new Set([...current, ...visibleIds])]
                                  : current.filter(
                                      (id) => !visibleIds.has(String(id)),
                                    );
                              })
                            }
                          />
                        )}
                      </th>
                      <th>Lesson</th>
                      <th>Status</th>
                      <th>Subject</th>
                      <th>Slides</th>
                      <th>Updated</th>
                      <th>Assigned class</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLessons.map((lesson) => (
                      <tr key={lesson._id}>
                        <td>
                          {["teacher", "admin"].includes(user?.role) && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${lesson.title} for bulk actions`}
                              checked={selectedLessonIds.includes(
                                String(lesson._id),
                              )}
                              onChange={(event) =>
                                setSelectedLessonIds((current) =>
                                  event.target.checked
                                    ? [
                                        ...new Set([
                                          ...current,
                                          String(lesson._id),
                                        ]),
                                      ]
                                    : current.filter(
                                        (id) =>
                                          String(id) !== String(lesson._id),
                                      ),
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          <strong>{lesson.title}</strong>
                          {lesson.description && (
                            <small>{lesson.description}</small>
                          )}
                        </td>
                        <td>
                          {lesson.isDone ? (
                            <span className="live-lesson-done-pill">Done</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {lesson.subjectId?.name || lesson.subject || "—"}
                          {!lesson.classId && (
                            <small>Not linked to a class</small>
                          )}
                        </td>
                        <td>{lesson.slideCount ?? lesson.slides?.length ?? 0}</td>
                        <td>
                          {lesson.updatedAt
                            ? new Date(lesson.updatedAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          <select
                            aria-label={`Class to launch ${lesson.title} with`}
                            value={getSessionClassId(lesson)}
                            onChange={(event) =>
                              setLessonClasses((previous) => ({
                                ...previous,
                                [lesson._id]: event.target.value,
                              }))
                            }
                            disabled={!classes.length}
                          >
                            {!classes.length && (
                              <option value="">No available classes</option>
                            )}
                            {classes.map((classItem) => (
                              <option key={classItem._id} value={classItem._id}>
                                {classItem.name}
                              </option>
                            ))}
                          </select>
                          {lesson.academicYear && (
                            <small>{lesson.academicYear}</small>
                          )}
                        </td>
                        <td className="live-list-row-actions">
                          <button
                            className="live-secondary-button"
                            onClick={() => void openLessonPreview(lesson._id)}
                          >
                            <HiOutlineEye /> Preview
                          </button>
                          <button
                            className="live-primary-button"
                            onClick={() => openSessionDialog(lesson, false)}
                            disabled={!getSessionClassId(lesson)}
                          >
                            <HiOutlinePlay /> Start
                          </button>
                          <button
                            className="live-secondary-button"
                            onClick={() => openSessionDialog(lesson, true)}
                            disabled={!getSessionClassId(lesson)}
                          >
                            Schedule
                          </button>
                          <button
                            className="live-lesson-actions-trigger"
                            aria-haspopup="menu"
                            aria-expanded={lessonActionMenu?.lessonId === String(lesson._id)}
                            aria-label={`More actions for ${lesson.title}`}
                            onClick={(event) => toggleLessonActionMenu(event, lesson)}
                          >
                            <HiOutlineEllipsisVertical />
                            <span>More</span>
                          </button>
                          {SHOW_LESSON_FOLDERS && <details className="live-lesson-organize-menu">
                            <summary>Organize</summary>
                            <div className="live-lesson-organize-content">
                              <label>
                                Add shortcut to
                                <select
                                  value={shortcutTargets[lesson._id] || ""}
                                  onChange={(event) =>
                                    setShortcutTargets((current) => ({
                                      ...current,
                                      [lesson._id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Choose a folder</option>
                                  {folders.map((folder) => (
                                    <option
                                      key={folder._id}
                                      value={folder._id}
                                      disabled={folder.lessonIds.some((id) => String(id) === String(lesson._id))}
                                    >
                                      {folderPaths.get(String(folder._id)) || folder.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="live-secondary-button"
                                disabled={folderSaving || !shortcutTargets[lesson._id]}
                                onClick={() => addLessonShortcut(lesson, shortcutTargets[lesson._id])}
                              >Add shortcut</button>
                              {activeFolder && (
                                <>
                                  <button
                                    className="live-secondary-button"
                                    disabled={folderSaving || activeFolder.lessonIds.indexOf(String(lesson._id)) <= 0}
                                    onClick={() => reorderFolderLessons(activeFolder, lesson._id, -1)}
                                  >Move lesson up</button>
                                  <button
                                    className="live-secondary-button"
                                    disabled={folderSaving || activeFolder.lessonIds.indexOf(String(lesson._id)) === activeFolder.lessonIds.length - 1}
                                    onClick={() => reorderFolderLessons(activeFolder, lesson._id, 1)}
                                  >Move lesson down</button>
                                  <button
                                    className="live-delete-session"
                                    disabled={folderSaving}
                                    onClick={() => removeLessonShortcut(lesson, activeFolder)}
                                  >Remove from this folder</button>
                                </>
                              )}
                            </div>
                          </details>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleLessons.length && (
                  <p className="live-list-empty">
                    No lessons match these filters.
                  </p>
                )}
              </div>
              {lessonActionMenu && (() => {
                const { lesson } = lessonActionMenu;
                const run = (action) => {
                  setLessonActionMenu(null);
                  action(lesson);
                };
                return createPortal(
                  <div
                    ref={lessonActionMenuRef}
                    className="live-lesson-action-menu"
                    role="menu"
                    aria-label={`Actions for ${lesson.title}`}
                    style={{
                      top: lessonActionMenu.top,
                      right: lessonActionMenu.right,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run((item) => openLessonEditor(item._id))}
                    >
                      <HiOutlinePencilSquare /> Edit
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={Boolean(exportingLessonId)}
                      onClick={() => run((item) => void exportLesson(item))}
                    >
                      <HiOutlineArrowDownTray />
                      {exportingLessonId === String(lesson._id)
                        ? "Exporting…"
                        : "Export CSV"}
                    </button>
                    {["teacher", "admin"].includes(user?.role) && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => run((item) => {
                          setShareLessons([item]);
                          setShareRecipient("");
                        })}
                      >
                        <HiOutlineShare /> Share
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run(setLessonDone)}
                    >
                      <HiOutlineCheck />
                      {lesson.isDone ? "Mark not done" : "Mark done"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => run((item) => void openMoveDialog(item))}
                    >
                      <HiOutlineCalendarDays /> Move to another year
                    </button>
                    <div className="live-lesson-action-menu-sep" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => run((item) => deleteLesson(item._id))}
                    >
                      <HiOutlineTrash /> Delete
                    </button>
                  </div>,
                  document.body,
                );
              })()}
              <div className="live-list-pagination">
                <span>
                  Showing{" "}
                  {showRange(
                    lessonPage,
                    lessonListState.pageSize,
                    lessonTotal,
                  )}
                </span>
                <label>
                  Rows
                  <select
                    value={lessonListState.pageSize}
                    onChange={(event) =>
                      updateLessonList({
                        pageSize: Number(event.target.value),
                        page: 1,
                      })
                    }
                  >
                    {[10, 25, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={lessonLoading || lessonPage <= 1}
                  onClick={() => updateLessonList({ page: lessonPage - 1 })}
                >
                  Previous
                </button>
                <span>
                  Page {lessonPage} of {lessonPages}
                </span>
                <button
                  disabled={lessonLoading || lessonPage >= lessonPages}
                  onClick={() => updateLessonList({ page: lessonPage + 1 })}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="live-list-filters">
            <label>
              Search sessions
              <input
                type="search"
                value={sessionListState.search}
                placeholder="Lesson, class, subject, or code"
                onChange={(event) =>
                  updateSessionList({ search: event.target.value, page: 1 })
                }
              />
            </label>
            <label>
              Class
              <select
                value={sessionListState.classId}
                onChange={(event) =>
                  updateSessionList({
                    classId: event.target.value,
                    subject: "",
                    page: 1,
                  })
                }
              >
                <option value="">All classes</option>
                {classes.map((classItem) => (
                  <option key={classItem._id} value={classItem._id}>
                    {classItem.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <select
                value={sessionListState.subject}
                onChange={(event) =>
                  updateSessionList({ subject: event.target.value, page: 1 })
                }
              >
                <option value="">All subjects</option>
                <option value="__unknown__">Unknown / not set</option>
                {sessionSubjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={sessionListState.status}
                onChange={(event) =>
                  updateSessionList({ status: event.target.value, page: 1 })
                }
              >
                <option value="">All statuses</option>
                <option value="waiting">Waiting</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <label>
              From date
              <input
                type="date"
                value={sessionListState.dateFrom}
                onChange={(event) =>
                  updateSessionList({ dateFrom: event.target.value, page: 1 })
                }
              />
            </label>
            <label>
              To date
              <input
                type="date"
                value={sessionListState.dateTo}
                onChange={(event) =>
                  updateSessionList({ dateTo: event.target.value, page: 1 })
                }
              />
            </label>
            <button
              className="live-text-button"
              onClick={() => updateSessionList({ ...defaultListState })}
            >
              Clear filters
            </button>
            {["teacher", "admin"].includes(user?.role) && (
              <button
                className="live-delete-session"
                onClick={deleteFinishedSessions}
                disabled={deletingFinishedSessions}
              >
                <HiOutlineTrash />{" "}
                {deletingFinishedSessions
                  ? "Deleting finished sessions…"
                  : "Delete all finished sessions"}
              </button>
            )}
          </div>
          <div className="live-list-table-wrap">
            <table className="live-list-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Timer</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session._id}>
                    <td>
                      <strong>
                        {session.lessonSnapshot?.title || "Live lesson"}
                      </strong>
                    </td>
                    <td>
                      {classesById.get(
                        String(session.classId?._id || session.classId),
                      )?.name ||
                        session.classId?.name ||
                        "Class"}
                    </td>
                    <td>
                      {session.lessonSnapshot?.subject || "Unknown / not set"}
                    </td>
                    <td>
                      {getSessionDisplayDate(session)
                        ? new Date(
                            getSessionDisplayDate(session),
                          ).toLocaleString()
                        : "—"}
                    </td>
                    <td>{formatSessionDuration(session)}</td>
                    <td>
                      {session.timerDurationMinutes > 0
                        ? `${session.timerDurationMinutes} min`
                        : "—"}
                      {session.scheduledAt && session.status === "waiting" && (
                        <small>
                          Scheduled{" "}
                          {new Date(session.scheduledAt).toLocaleString()}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={`live-status-pill ${session.status}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="live-list-row-actions">
                      {session.status !== "ended" && (
                        <button
                          className="live-secondary-button"
                          onClick={() =>
                            navigate(
                              `/portal/live-lessons/sessions/${session._id}`,
                            )
                          }
                        >
                          {session.status === "waiting"
                            ? "Open / start"
                            : "Open session"}
                        </button>
                      )}
                      {session.status === "live" &&
                        String(session.teacherId) ===
                          String(user?._id || user?.id) && (
                          <button
                            className="live-delete-session"
                            onClick={() => endSession(session)}
                            disabled={Boolean(endingSessionId)}
                          >
                            <HiOutlineStop />{" "}
                            {endingSessionId === String(session._id)
                              ? "Ending…"
                              : "End session"}
                          </button>
                        )}
                      <button
                        className="live-secondary-button"
                        onClick={() =>
                          navigate(
                            `/portal/live-lessons/sessions/${session._id}/report`,
                          )
                        }
                      >
                        Report
                      </button>
                      <button
                        className="live-secondary-button"
                        onClick={() =>
                          navigate(
                            `/portal/live-lessons/sessions/${session._id}/replay`,
                          )
                        }
                      >
                        Replay
                      </button>
                      <button
                        className="live-delete-session"
                        onClick={() => deleteSession(session)}
                        disabled={session.status === "live"}
                        title={
                          session.status === "live"
                            ? "End the live session before deleting its history."
                            : "Delete this session history"
                        }
                      >
                        <HiOutlineTrash /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sessions.length && (
              <p className="live-list-empty">
                {sessionPagination.total
                  ? "No sessions match these filters."
                  : "No sessions yet. Start a live lesson to see sessions and reports here."}
              </p>
            )}
          </div>
          <div className="live-list-pagination">
            <span>
              Showing{" "}
              {showRange(
                sessionPagination.page || sessionListState.page,
                sessionListState.pageSize,
                sessionPagination.total,
              )}
            </span>
            <label>
              Rows
              <select
                value={sessionListState.pageSize}
                onChange={(event) =>
                  updateSessionList({
                    pageSize: Number(event.target.value),
                    page: 1,
                  })
                }
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={sessionListState.page <= 1}
              onClick={() =>
                updateSessionList({ page: sessionListState.page - 1 })
              }
            >
              Previous
            </button>
            <span>
              Page {sessionPagination.pages ? sessionListState.page : 0} of{" "}
              {sessionPagination.pages || 0}
            </span>
            <button
              disabled={
                !sessionPagination.pages ||
                sessionListState.page >= sessionPagination.pages
              }
              onClick={() =>
                updateSessionList({ page: sessionListState.page + 1 })
              }
            >
              Next
            </button>
          </div>
        </>
      )}

      {(previewLoading || previewLesson || previewError) && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={() => {
            if (!previewLoading) {
              setPreviewLesson(null);
              setPreviewError("");
            }
          }}
        >
          <section
            className="live-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="live-import-header">
              <div>
                <span className="live-eyebrow">LESSON PREVIEW</span>
                <h2 id="live-preview-title">
                  {previewLesson?.title || "Preview lesson"}
                </h2>
                {previewLesson?.description && (
                  <p>{previewLesson.description}</p>
                )}
              </div>
              <button
                className="live-dialog-close"
                onClick={() => {
                  setPreviewLesson(null);
                  setPreviewError("");
                }}
                aria-label="Close lesson preview"
                disabled={previewLoading}
              >
                ×
              </button>
            </header>
            {previewLoading && (
              <p className="live-preview-status" role="status">
                Loading lesson preview…
              </p>
            )}
            {previewError && (
              <p
                className="live-preview-status live-preview-error"
                role="alert"
              >
                {previewError}
              </p>
            )}
            {previewLesson &&
              (() => {
                const slides = previewLesson.slides || [];
                const slide = slides[previewSlideIndex];
                return (
                  <>
                    <div className="live-preview-slide-strip">
                      {slides.map((item, index) => (
                        <button
                          type="button"
                          className={`live-preview-chip ${previewSlideIndex === index ? "active" : ""}`}
                          key={`${index}-${item.title || item.type}`}
                          onClick={() => setPreviewSlideIndex(index)}
                          aria-current={
                            previewSlideIndex === index ? "step" : undefined
                          }
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          {item.title || item.type}
                        </button>
                      ))}
                    </div>
                    <div className="live-preview-dialog-content">
                      {slide ? (
                        <>
                          <LiveLessonSlide
                            slide={slide}
                            index={previewSlideIndex}
                            total={slides.length}
                            language={previewLesson.language}
                          />
                          {slide.question && (
                            <section className="live-preview-question">
                              <span className="live-eyebrow">
                                QUESTION ·{" "}
                                {LIVE_QUESTION_KIND_LABELS[slide.question.kind] ||
                                  "Multiple choice"}
                              </span>
                              <h3>{slide.question.prompt}</h3>
                              {(slide.question.options || []).length > 0 && (
                                <ol type="A">
                                  {slide.question.options.map((option) => (
                                    <li
                                      key={option.id}
                                      className={
                                        option.id === slide.question.correctOptionId ||
                                        (slide.question.correctOptionIds || []).includes(option.id)
                                          ? "correct"
                                          : ""
                                      }
                                    >
                                      {option.text}
                                      {(option.id === slide.question.correctOptionId ||
                                        (slide.question.correctOptionIds || []).includes(option.id)) && (
                                        <strong> · Correct answer</strong>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                              )}
                              {(slide.question.matchingPairs || []).length > 0 && (
                                <ul className="live-preview-pairs">
                                  {slide.question.matchingPairs.map((pair, pairIndex) => (
                                    <li key={`pair-${pairIndex}`}>
                                      {pair.left} &rarr; {pair.right}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {(slide.question.orderingItems || []).length > 0 && (
                                <ol>
                                  {slide.question.orderingItems.map((item, itemIndex) => (
                                    <li key={item.id || `step-${itemIndex}`}>{item.text}</li>
                                  ))}
                                </ol>
                              )}
                              {(slide.question.blanks || []).length > 0 && (
                                <ul className="live-preview-pairs">
                                  {slide.question.blanks.map((blank) => (
                                    <li key={blank.id}>
                                      {blank.id}: {(blank.accepts || []).join(" / ")}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {slide.question.numericRule && (
                                <p>
                                  <strong>Answer:</strong>{" "}
                                  {liveNumericRuleSummary(slide.question.numericRule)}
                                </p>
                              )}
                              {slide.question.guidance && (
                                <p>
                                  <strong>Guidance:</strong> {slide.question.guidance}
                                </p>
                              )}
                              {slide.question.criteria && (
                                <p>
                                  <strong>Marking criteria:</strong> {slide.question.criteria}
                                </p>
                              )}
                              {slide.question.explanation && (
                                <p>
                                  <strong>Explanation:</strong>{" "}
                                  {slide.question.explanation}
                                </p>
                              )}
                              {(slide.variants || []).length > 0 && (
                                <p className="live-preview-levels">
                                  This slide also sends a levelled question to{" "}
                                  {slide.variants.length}{" "}
                                  {slide.variants.length === 1 ? "group" : "groups"} of this class.
                                </p>
                              )}
                            </section>
                          )}
                        </>
                      ) : (
                        <p className="live-preview-status">
                          This lesson has no slides to preview.
                        </p>
                      )}
                    </div>
                    <footer className="live-preview-navigation">
                      <span>
                        {slides.length
                          ? `Slide ${previewSlideIndex + 1} of ${slides.length}`
                          : "No slides"}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="live-secondary-button"
                          disabled={previewSlideIndex <= 0}
                          onClick={() =>
                            setPreviewSlideIndex((index) => index - 1)
                          }
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="live-primary-button"
                          disabled={previewSlideIndex >= slides.length - 1}
                          onClick={() =>
                            setPreviewSlideIndex((index) => index + 1)
                          }
                        >
                          Next
                        </button>
                      </div>
                    </footer>
                  </>
                );
              })()}
          </section>
        </div>
      )}

      {sessionDraft && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={() => !creatingSession && setSessionDraft(null)}
        >
          <section
            className="live-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-session-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="live-eyebrow">
                  {sessionDraft.scheduled ? "SCHEDULE CLASS" : "START CLASS"}
                </span>
                <h2 id="live-session-create-title">
                  {sessionDraft.lesson.title}
                </h2>
              </div>
              <button
                className="live-dialog-close"
                onClick={() => setSessionDraft(null)}
                aria-label="Close session setup"
                disabled={creatingSession}
              >
                ×
              </button>
            </header>
            <label className="live-edit-field">
              Class for this session
              <select
                value={sessionDraft.classId}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    classId: event.target.value,
                  }))
                }
              >
                {classes.map((classItem) => (
                  <option key={classItem._id} value={classItem._id}>
                    {classItem.name}
                  </option>
                ))}
              </select>
              <span>
                Defaults to the lesson’s assigned class. You can choose any of
                your classes for this session.
              </span>
            </label>
            {sessionDraft.scheduled && (
              <label className="live-edit-field">
                Scheduled date and time
                <input
                  type="datetime-local"
                  min={localDateTimeValue(new Date())}
                  value={sessionDraft.scheduledAt}
                  onChange={(event) =>
                    setSessionDraft((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            )}
            <label className="live-edit-field">
              Online meeting link (optional)
              <input
                type="url"
                inputMode="url"
                maxLength={2048}
                placeholder="https://meet.google.com/..."
                value={sessionDraft.meetingUrl}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    meetingUrl: event.target.value,
                  }))
                }
              />
              <span>
                Students in this class can open the meeting separately from the
                Live Lesson. Use a secure HTTPS link.
              </span>
            </label>
            <label className="live-edit-field live-invitation-option">
              <span>
                <input
                  type="checkbox"
                  checked={sessionDraft.sendInvitationEmail}
                  onChange={(event) =>
                    setSessionDraft((current) => ({
                      ...current,
                      sendInvitationEmail: event.target.checked,
                    }))
                  }
                />
                Email an invitation to students
              </span>
              <span>
                Optional. Sends the Live Lesson link, scheduled time (if set),
                and meeting link (if provided) to student email addresses.
              </span>
            </label>
            <label className="live-edit-field">
              Class timer (minutes)
              <input
                type="number"
                min="0"
                max="240"
                step="1"
                value={sessionDraft.timerDurationMinutes}
                onChange={(event) =>
                  setSessionDraft((current) => ({
                    ...current,
                    timerDurationMinutes: event.target.value,
                  }))
                }
              />
              <span>
                Starts when you start the class. Use 0 for no timer. The timer
                will notify you at zero but will not end the session.
              </span>
            </label>
            <footer>
              <button
                className="live-secondary-button"
                onClick={() => setSessionDraft(null)}
                disabled={creatingSession}
              >
                Cancel
              </button>
              <button
                className="live-primary-button"
                onClick={createSession}
                disabled={
                  creatingSession ||
                  !sessionDraft.classId ||
                  !/^\d+$/.test(String(sessionDraft.timerDurationMinutes)) ||
                  Number(sessionDraft.timerDurationMinutes) > 240
                }
              >
                {creatingSession
                  ? "Creating…"
                  : sessionDraft.scheduled
                    ? "Schedule session"
                    : "Create session"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {SHOW_LESSON_FOLDERS && folderDialog && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={() => !folderSaving && setFolderDialog(null)}
        >
          <form
            className="live-share-dialog live-folder-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-folder-dialog-title"
            onSubmit={saveFolderDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="live-eyebrow">LESSON ORGANIZATION</span>
                <h2 id="live-folder-dialog-title">
                  {folderDialog.mode === "rename"
                    ? "Rename folder"
                    : folderDialog.parentId
                      ? "Create subfolder"
                      : "Create folder"}
                </h2>
              </div>
              <button
                type="button"
                className="live-dialog-close"
                onClick={() => setFolderDialog(null)}
                aria-label="Close folder dialog"
                disabled={folderSaving}
              >
                ×
              </button>
            </header>
            <label className="live-edit-field" htmlFor="live-folder-name">
              Folder name
              <input
                id="live-folder-name"
                type="text"
                autoFocus
                required
                maxLength={100}
                value={folderDialog.name}
                onChange={(event) =>
                  setFolderDialog((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="For example, Week 1"
                disabled={folderSaving}
              />
              <span>Use a unit, week, topic, or any name that helps you find lessons.</span>
            </label>
            <footer>
              <button
                type="button"
                className="live-secondary-button"
                onClick={() => setFolderDialog(null)}
                disabled={folderSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="live-primary-button"
                disabled={folderSaving || !folderDialog.name.trim()}
              >
                {folderSaving
                  ? "Saving…"
                  : folderDialog.mode === "rename"
                    ? "Save name"
                    : "Create folder"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {shareLessons.length > 0 && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={() => setShareLessons([])}
        >
          <section
            className="live-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-share-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="live-eyebrow">TEACHER-TO-TEACHER</span>
                <h2 id="live-share-title">
                  Share{" "}
                  {shareLessons.length === 1
                    ? `“${shareLessons[0].title}”`
                    : `${shareLessons.length} lessons`}
                </h2>
              </div>
              <button
                className="live-dialog-close"
                onClick={() => setShareLessons([])}
                aria-label="Close share dialog"
              >
                ×
              </button>
            </header>
            <p>
              The recipient can accept a copy of each lesson. Your lessons and
              session histories stay separate.
            </p>
            <label className="live-edit-field">
              Teacher
              <select
                value={shareRecipient}
                onChange={(event) => setShareRecipient(event.target.value)}
              >
                <option value="">Choose a teacher…</option>
                {shareableTeachers.map((teacher) => (
                  <option key={teacher._id} value={teacher._id}>
                    {getTeacherName(teacher)}
                  </option>
                ))}
              </select>
            </label>
            {!shareableTeachers.length && (
              <p className="live-list-empty">
                No other active teachers are available to share with.
              </p>
            )}
            <footer>
              <button
                className="live-secondary-button"
                onClick={() => setShareLessons([])}
              >
                Cancel
              </button>
              <button
                className="live-primary-button"
                disabled={!shareRecipient || shareSaving}
                onClick={shareLessonWithTeacher}
              >
                {shareSaving
                  ? "Sending…"
                  : `Send ${shareLessons.length === 1 ? "invitation" : `${shareLessons.length} invitations`}`}
              </button>
            </footer>
          </section>
        </div>
      )}

      {moveLessonTarget && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={() => {
            if (!moveLessonSaving) closeMoveDialog();
          }}
        >
          <section
            className="live-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-move-lesson-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="live-eyebrow">ACADEMIC YEAR</span>
                <h2 id="live-move-lesson-title">
                  Move “{moveLessonTarget.title}”
                </h2>
              </div>
              <button
                className="live-dialog-close"
                onClick={closeMoveDialog}
                aria-label="Close move lesson dialog"
                disabled={moveLessonSaving}
              >
                ×
              </button>
            </header>
            <p>
              Filed under{" "}
              {moveLessonOptions?.lesson?.academicYear || "no academic year"}.
              Slides and past sessions stay as they are — only the class this
              lesson launches with, and the year it is filed under, change.
            </p>
            {moveLessonLoading && (
              <p className="live-preview-status" role="status">
                Loading the classes you teach…
              </p>
            )}
            {moveLessonOptions?.canMove === false && (
              <p className="live-preview-status live-preview-error" role="alert">
                This lesson has a {moveLessonOptions.blockingSessionStatus}{" "}
                session. End or delete it before moving the lesson.
              </p>
            )}
            {!moveLessonLoading && !moveLessonOptions?.targets?.length && (
              <p className="live-list-empty">
                You are not assigned to another class yet. Rollover creates next
                year’s classes without teachers, so ask your school to assign you
                there before moving this lesson.
              </p>
            )}
            {!!moveLessonOptions?.targets?.length && (
              <label className="live-edit-field">
                Destination class
                <select
                  value={moveLessonClassId}
                  onChange={(event) => setMoveLessonClassId(event.target.value)}
                >
                  <option value="">Choose a class…</option>
                  {moveLessonYears.map((year) => (
                    <optgroup key={year} label={year}>
                      {moveLessonOptions.targets
                        .filter((target) => target.academicYear === year)
                        .map((target) => (
                          <option
                            key={target._id}
                            value={target._id}
                            disabled={target.isCurrentClass}
                          >
                            {`${target.name}${target.section ? ` · ${target.section}` : ""}${
                              target.isCurrentClass ? " · current" : ""
                            }`}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {selectedMoveTarget?.subjectCleared && (
              <p className="live-preview-status">
                That class does not teach{" "}
                {moveLessonTarget.subject || "this subject"} yet, so the subject
                link will be cleared. The lesson keeps its subject name.
              </p>
            )}
            {moveLessonError && (
              <p className="live-preview-status live-preview-error" role="alert">
                {moveLessonError}
              </p>
            )}
            <footer>
              <button
                className="live-secondary-button"
                onClick={closeMoveDialog}
                disabled={moveLessonSaving}
              >
                Cancel
              </button>
              <button
                className="live-primary-button"
                onClick={moveLessonToClass}
                disabled={
                  !selectedMoveTarget
                  || moveLessonSaving
                  || moveLessonLoading
                  || moveLessonOptions?.canMove === false
                }
              >
                {moveLessonSaving ? "Moving…" : "Move lesson"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {importOpen && (
        <div
          className="live-import-overlay"
          role="presentation"
          onClick={closeEditor}
        >
          <section
            className="live-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="live-import-header">
              <div>
                <span className="live-eyebrow">
                  {editorMode === "edit"
                    ? "LESSON EDITOR"
                    : "CSV LESSON BUILDER"}
                </span>
                <h2 id="live-import-title">
                  {editorMode === "edit" ? "Edit lesson" : "Import a lesson"}
                </h2>
              </div>
              <button
                className="live-dialog-close"
                onClick={closeEditor}
                aria-label="Close lesson editor"
                disabled={saving}
              >
                ×
              </button>
            </header>
            {editorMode === "create" && (
              <div className="live-import-toolbar">
                <div className="live-session-actions">
                  <button className="live-text-button" onClick={copyAiPrompt}>
                    {promptCopied ? (
                      <HiOutlineCheck />
                    ) : (
                      <HiOutlineClipboardDocument />
                    )}
                    {promptCopied ? "Copied" : "Copy AI prompt"}
                  </button>
                  <button
                    className="live-text-button"
                    onClick={downloadTemplate}
                  >
                    <HiOutlineArrowDownTray /> Sample CSV
                  </button>
                  <QuestionTypeGuide flow="live" className="live-text-button" />
                </div>
              </div>
            )}
            {editorMode === "create" && (
              <label className="live-file-drop">
                <HiOutlineArrowUpTray size={27} />
                <strong>{fileName || "Choose a CSV file to preview"}</strong>
                <span>
                  Import standard lesson CSVs or a portable CSV exported from a
                  Live Lesson. Portable files preserve slides and metadata;
                  class/subject assignments are matched to this school.
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleSelectFile}
                />
              </label>
            )}
            {editorMode === "edit" && saving && (
              <div className="live-loading">Loading lesson…</div>
            )}
            {errors.length > 0 && (
              <div className="live-import-errors" role="alert">
                <strong>
                  {editorMode === "edit"
                    ? "Fix these lesson issues to continue"
                    : "Fix these CSV issues to continue"}
                </strong>
                {errors.map((item, index) => (
                  <p key={`${item.row}-${item.field}-${index}`}>
                    Row {item.row} · {item.field}: {item.message}
                  </p>
                ))}
              </div>
            )}
            {form.slides.length > 0 && (
              <div className="live-import-preview">
                <div className="live-preview-heading">
                  <div>
                    <span className="live-eyebrow">
                      {editorMode === "edit" ? "EDIT LESSON" : "PREVIEW"} ·{" "}
                      {form.slides.length} SLIDES
                    </span>
                    <h3>
                      {editorMode === "edit"
                        ? "Update lesson content and slides"
                        : "Review and polish before saving"}
                    </h3>
                  </div>
                  {editorMode === "edit" && (
                    <div className="live-slide-edit-actions">
                      <button
                        className="live-secondary-button"
                        onClick={addSlide}
                        disabled={form.slides.length >= 200}
                      >
                        <HiOutlinePlus /> Add slide
                      </button>
                      <button
                        className="live-delete-slide"
                        onClick={deleteSelectedSlide}
                        disabled={form.slides.length <= 1}
                      >
                        <HiOutlineTrash /> Remove selected
                      </button>
                    </div>
                  )}
                </div>
                <label className="live-edit-field">
                  Lesson title
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="live-edit-field">
                  Description
                  <textarea
                    rows={4}
                    value={form.description || ""}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="live-lesson-metadata-fields">
                  {form.importHints && (
                    <p className="live-import-assignment-hint">
                      Exported assignment: {form.importHints.assignedClass || "No class"} · {form.importHints.assignedSubject || "No subject"}.
                      Choose the destination class and subject below; matching assignments were selected when available.
                    </p>
                  )}
                  <label className="live-edit-field">
                    Assigned class
                    <select
                      value={form.classId}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          classId: event.target.value,
                          subjectId: "",
                          subject: "",
                        }))
                      }
                    >
                      <option value="">Choose a class…</option>
                      {classes.map((classItem) => (
                        <option key={classItem._id} value={classItem._id}>
                          {classItem.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="live-edit-field">
                    Class subject
                    <select
                      value={form.subjectId}
                      disabled={!form.classId}
                      onChange={(event) => {
                        const selectedSubject = editorSubjects.find(
                          (item) => String(item._id) === event.target.value,
                        );
                        setForm((previous) => ({
                          ...previous,
                          subjectId: event.target.value,
                          subject: selectedSubject?.name || "",
                        }));
                      }}
                    >
                      <option value="">
                        {form.classId
                          ? "Choose a subject…"
                          : "Choose a class first"}
                      </option>
                      {editorSubjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="live-edit-field">
                    Grade
                    <input
                      value={form.grade || ""}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          grade: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="live-edit-field">
                    Language
                    <input
                      value={form.language || "en"}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          language: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="live-preview-slide-strip">
                  {form.slides.map((slide, index) => (
                    <button
                      className={`live-preview-chip ${selectedSlideIndex === index ? "active" : ""}`}
                      key={`${index}-${slide.title}`}
                      onClick={() => setSelectedSlideIndex(index)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {slide.title || slide.type}
                    </button>
                  ))}
                </div>
                <div className="live-preview-workspace">
                  <LiveLessonSlide
                    slide={activeSlide}
                    index={selectedSlideIndex}
                    total={form.slides.length}
                    language={form.language}
                  />
                  {activeSlide && (
                    <div className="live-preview-editors">
                      {editorMode === "edit" && (
                        <label className="live-edit-field">
                          Slide type
                          <select
                            value={activeSlide.type}
                            onChange={(event) =>
                              changeSlideType(
                                selectedSlideIndex,
                                event.target.value,
                              )
                            }
                          >
                            {[
                              "opening",
                              "goals",
                              "content",
                              "examples",
                              "html",
                              "question",
                              "activity",
                              "exit-ticket",
                            ].map((type) => (
                              <option value={type} key={type}>
                                {type.replace("-", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="live-edit-field">
                        Slide title
                        <input
                          value={activeSlide.title || ""}
                          onChange={(event) =>
                            updateSlide(selectedSlideIndex, {
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      {activeSlide.type === "html" ? (
                        <label className="live-edit-field">
                          Slide HTML
                          <textarea
                            rows={12}
                            value={activeSlide.html || ""}
                            onChange={(event) =>
                              updateSlide(selectedSlideIndex, {
                                html: event.target.value,
                              })
                            }
                          />
                        </label>
                      ) : (
                        <label className="live-edit-field">
                          Slide content
                          <textarea
                            rows={3}
                            value={activeSlide.body || ""}
                            onChange={(event) =>
                              updateSlide(selectedSlideIndex, {
                                body: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      {editorMode === "edit" &&
                        activeSlide.type === "examples" && (
                          <label className="live-edit-field">
                            Examples (one per line)
                            <textarea
                              rows={3}
                              value={(activeSlide.examples || []).join("\n")}
                              onChange={(event) =>
                                updateSlide(selectedSlideIndex, {
                                  examples: event.target.value
                                    .split(/\r?\n/)
                                    .filter((item) => item.trim()),
                                })
                              }
                            />
                          </label>
                        )}
                      {editorMode === "edit" && (
                        <>
                          <label className="live-edit-field">
                            Image URL
                            <input
                              value={activeSlide.imageUrl || ""}
                              onChange={(event) =>
                                updateSlide(selectedSlideIndex, {
                                  imageUrl: event.target.value,
                                })
                              }
                              placeholder="https://…"
                            />
                          </label>
                          <label className="live-edit-field">
                            Teacher notes
                            <textarea
                              rows={4}
                              value={activeSlide.speakerNotes || ""}
                              onChange={(event) =>
                                updateSlide(selectedSlideIndex, {
                                  speakerNotes: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                      {activeSlide.question && (
                        <LiveQuestionEditor
                          question={activeSlide.question}
                          onChange={(question) =>
                            updateSlide(selectedSlideIndex, { question })
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="live-preview-note">
                  Slide design, question answers, and explanation are stored in
                  the lesson; answer keys stay hidden from students until the
                  teacher reveals results.
                </div>
              </div>
            )}
            <footer className="live-import-footer">
              <button
                className="live-secondary-button"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="live-primary-button"
                onClick={saveImportedLesson}
                disabled={
                  saving ||
                  (editorMode === "create" &&
                    (!selectedFile || !form.classId || !form.subjectId)) ||
                  form.slides.length === 0 ||
                  !form.title.trim()
                }
              >
                {saving
                  ? "Saving…"
                  : editorMode === "edit"
                    ? "Update lesson"
                    : "Save lesson"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default LiveLessonsPage;
