import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineCheck, HiOutlineClipboardDocument, HiOutlineEye, HiOutlinePencilSquare, HiOutlinePlay, HiOutlinePlus, HiOutlinePresentationChartBar, HiOutlineShare, HiOutlineStop, HiOutlineTrash } from "react-icons/hi2";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import { fetchClasses, selectClasses } from "../../store/slices/classSlice";
import { fetchSubjects, selectSubjects } from "../../store/slices/subjectSlice";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import { LIVE_LESSON_CSV_TEMPLATE } from "./liveLessonCsvTemplate";
import { LIVE_LESSON_AI_PROMPT } from "./liveLessonAiPrompt";
import "./LiveLessonsPage.css";

const emptyForm = { title: "", description: "", subject: "", classId: "", subjectId: "", grade: "", language: "en", slides: [] };
const defaultListState = {
  classId: "",
  subject: "",
  page: 1,
  pageSize: 25,
  showDone: false,
  search: "",
  dateFrom: "",
  dateTo: "",
  status: "",
};

const normalizeListState = (saved = {}) => {
  const preferences = saved && typeof saved === "object" ? saved : {};
  return {
    classId: typeof preferences.classId === "string" ? preferences.classId : "",
    subject: typeof preferences.subject === "string" ? preferences.subject : "",
    page: Number.isInteger(Number(preferences.page)) && Number(preferences.page) > 0 ? Number(preferences.page) : 1,
    pageSize: [10, 25, 50].includes(Number(preferences.pageSize)) ? Number(preferences.pageSize) : 25,
    showDone: preferences.showDone === true,
    search: typeof preferences.search === "string" ? preferences.search : "",
    dateFrom: typeof preferences.dateFrom === "string" ? preferences.dateFrom : "",
    dateTo: typeof preferences.dateTo === "string" ? preferences.dateTo : "",
    status: ["waiting", "live", "ended"].includes(preferences.status) ? preferences.status : "",
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
  const blob = new Blob([LIVE_LESSON_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "live-lesson-template.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const formatSessionDuration = (session) => {
  if (!session.startedAt) return "—";
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - new Date(session.startedAt).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const getSessionDisplayDate = (session) => (
  session.scheduledAt && session.status === "waiting"
    ? session.scheduledAt
    : session.startedAt || session.createdAt
);

const LiveLessonsPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const classes = useSelector(selectClasses);
  const subjects = useSelector(selectSubjects);
  const user = useSelector(selectUser);
  const [lessons, setLessons] = useState([]);
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
  const [matchedColumns, setMatchedColumns] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedFile, setSelectedFile] = useState("");
  const [lessonClasses, setLessonClasses] = useState({});
  const [teachers, setTeachers] = useState([]);
  const [incomingShares, setIncomingShares] = useState([]);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [selectedIncomingShareIds, setSelectedIncomingShareIds] = useState([]);
  const [shareLessons, setShareLessons] = useState([]);
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [bulkDeletingLessons, setBulkDeletingLessons] = useState(false);
  const [bulkRespondingToShares, setBulkRespondingToShares] = useState(false);
  const [previewLesson, setPreviewLesson] = useState(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [endingSessionId, setEndingSessionId] = useState("");
  const [deletingFinishedSessions, setDeletingFinishedSessions] = useState(false);
  const [sessionDraft, setSessionDraft] = useState(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiHtmlReviewEnabled, setAiHtmlReviewEnabled] = useState(false);
  const [savingHtmlReviewSetting, setSavingHtmlReviewSetting] = useState(false);
  const [lessonListState, setLessonListState] = useState(defaultListState);
  const [sessionListState, setSessionListState] = useState(defaultListState);
  const [sessionPagination, setSessionPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const preferencesKey = `liveLessonLists:${user?.school?._id || user?.schoolId || "school"}:${user?._id || user?.id || "user"}`;

  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LIVE_LESSON_AI_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2200);
    } catch (copyError) {
      setError(copyError.message || "Could not copy the AI prompt. Check clipboard permissions and try again.");
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [lessonResponse, settingsResponse] = await Promise.all([
        api.get("/live/lessons"),
        api.get("/live/settings"),
      ]);
      setLessons(lessonResponse.data?.data?.lessons || []);
      setAiHtmlReviewEnabled(settingsResponse.data?.data?.aiHtmlReviewEnabled === true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load live lessons.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const response = await api.get("/live/sessions", {
        params: {
          page: sessionListState.page,
          limit: sessionListState.pageSize,
          ...(sessionListState.classId ? { classId: sessionListState.classId } : {}),
          ...(sessionListState.subject ? { subject: sessionListState.subject } : {}),
          ...(sessionListState.search ? { search: sessionListState.search } : {}),
          ...(sessionListState.dateFrom ? { dateFrom: sessionListState.dateFrom } : {}),
          ...(sessionListState.dateTo ? { dateTo: sessionListState.dateTo } : {}),
          ...(sessionListState.status ? { status: sessionListState.status } : {}),
        },
      });
      setSessions(response.data?.data?.sessions || []);
      setSessionPagination(response.data?.data?.pagination || { page: 1, limit: sessionListState.pageSize, total: 0, pages: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load session history.");
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
      window.localStorage.setItem(preferencesKey, JSON.stringify({
        lessons: lessonListState,
        sessions: sessionListState,
      }));
    }
  }, [lessonListState, sessionListState, preferencesKey, preferencesLoaded]);

  const updateAiHtmlReviewSetting = async (enabled) => {
    setSavingHtmlReviewSetting(true);
    setError("");
    try {
      const response = await api.patch("/live/settings", { aiHtmlReviewEnabled: enabled });
      setAiHtmlReviewEnabled(response.data?.data?.aiHtmlReviewEnabled === true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update the AI HTML safety review setting.");
    } finally {
      setSavingHtmlReviewSetting(false);
    }
  };

  useEffect(() => {
    let active = true;
    dispatch(fetchClasses({ limit: "all" })).unwrap()
      .then(() => { if (active) setClassesLoaded(true); })
      .catch((requestError) => { if (active) setError(requestError || "Could not load your classes."); });
    dispatch(fetchSubjects({ limit: "all" })).unwrap()
      .then(() => { if (active) setSubjectsLoaded(true); })
      .catch((requestError) => { if (active) setError(requestError || "Could not load subjects."); });
    loadData();
    return () => { active = false; };
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
      const pendingIds = new Set(invitations.map((invitation) => String(invitation._id)));
      setSelectedIncomingShareIds((current) => current.filter((id) => pendingIds.has(String(id))));
      setOutgoingShares(outgoingResponse.data?.data?.invitations || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load lesson-sharing invitations.");
    }
  }, [user?.role]);

  useEffect(() => {
    if (preferencesLoaded && classesLoaded && subjectsLoaded) loadSessions();
  }, [loadSessions, preferencesLoaded, classesLoaded, subjectsLoaded]);

  useEffect(() => {
    if (!preferencesLoaded || !classesLoaded || !subjectsLoaded) return;
    const knownClassIds = new Set(classes.map((classItem) => String(classItem._id)));
    const validSubject = (value, isSession) => !value || (isSession && value === "__unknown__") || subjects.some(
      (subject) => String(subject._id) === value || subject.name === value,
    );
    const sanitize = (state, isSession) => {
      const classId = state.classId && knownClassIds.has(state.classId) ? state.classId : "";
      const selectedClass = classId ? classes.find((classItem) => String(classItem._id) === classId) : null;
      const assignedIds = (selectedClass?.subjects || [])
        .map((entry) => entry.subject?._id || entry.subject)
        .filter(Boolean)
        .map(String);
      const assignedSubjectMatches = !classId || (
        assignedIds.length > 0 &&
        subjects.some((entry) => assignedIds.includes(String(entry._id)) &&
          (String(entry._id) === state.subject || entry.name === state.subject))
      );
      const resolvedSubject = subjects.find((entry) => entry.name === state.subject);
      const subject = validSubject(state.subject, isSession) && assignedSubjectMatches
        ? resolvedSubject?._id ? String(resolvedSubject._id) : state.subject
        : "";
      if (classId === state.classId && subject === state.subject) return state;
      return { ...state, classId, subject, page: 1 };
    };
    setLessonListState((current) => sanitize(current, false));
    setSessionListState((current) => sanitize(current, true));
  }, [preferencesLoaded, classesLoaded, subjectsLoaded, classes, subjects]);

  useEffect(() => {
    if (sessionPagination.pages > 0 && sessionListState.page > sessionPagination.pages) {
      setSessionListState((current) => ({ ...current, page: sessionPagination.pages }));
    }
  }, [sessionListState.page, sessionPagination.pages]);

  useEffect(() => {
    if (!["teacher", "admin"].includes(user?.role)) return;
    let active = true;
    api.get("/live/shares/teachers")
      .then((response) => {
        if (active) setTeachers(response.data?.data?.teachers || []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load your teacher directory.");
      });
    loadShares();
    return () => { active = false; };
  }, [loadShares, user?.role]);

  const handleSelectFile = async (event) => {
    const file = event.target.files?.[0];
    setErrors([]);
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setMatchedColumns(null);
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
      setForm({ ...response.data.data.lesson, classId: "", subjectId: "" });
      setSelectedSlideIndex(0);
      setMatchedColumns(response.data.data.matchedColumns || {});
      setFileName(file.name);
      setSelectedFile(csv);
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || [{
        row: 1,
        field: "file",
        message: requestError.response?.data?.message || "CSV preview failed.",
      }]);
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
        slides: (lesson.slides || []).map((slide) => ({
          ...slide,
          examples: slide.examples || [],
          question: slide.question ? {
            ...slide.question,
            options: slide.question.options || [],
          } : undefined,
        })),
      });
      setSelectedSlideIndex(0);
      setFileName("");
      setSelectedFile("");
      setMatchedColumns(null);
    } catch (requestError) {
      closeEditor(true);
      setError(requestError.response?.data?.message || "Could not open this lesson for editing.");
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
      setPreviewError(requestError.response?.data?.message || "Could not preview this lesson.");
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

  const updateQuestion = (slideIndex, change) => {
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.map((slide, index) =>
        index === slideIndex
          ? { ...slide, question: { ...slide.question, ...change } }
          : slide,
      ),
    }));
  };

  const changeQuestionKind = (slideIndex, kind) => {
    const question = form.slides[slideIndex].question;
    const options = kind === "tf"
      ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
      : question.options.map((option, index) => ({
          id: String.fromCharCode(97 + index),
          text: option.text,
        }));
    updateQuestion(slideIndex, {
      kind,
      options,
      correctOptionId: options.some((option) => option.id === question.correctOptionId)
        ? question.correctOptionId
        : options[0].id,
    });
  };

  const addQuestionOption = (slideIndex) => {
    const question = form.slides[slideIndex].question;
    if (question.kind !== "mcq" || question.options.length >= 6) return;
    const usedIds = new Set(question.options.map((option) => option.id));
    const nextId = ["a", "b", "c", "d", "e", "f"].find((id) => !usedIds.has(id));
    updateQuestion(slideIndex, {
      options: [...question.options, { id: nextId, text: "" }],
    });
  };

  const removeQuestionOption = (slideIndex, optionId) => {
    const question = form.slides[slideIndex].question;
    if (question.kind !== "mcq" || question.options.length <= 2) return;
    const options = question.options.filter((option) => option.id !== optionId);
    updateQuestion(slideIndex, {
      options,
      correctOptionId: question.correctOptionId === optionId
        ? options[0].id
        : question.correctOptionId,
    });
  };

  const changeSlideType = (slideIndex, type) => {
    const currentSlide = form.slides[slideIndex];
    const question = type === "question"
      ? currentSlide.question || {
          kind: "mcq",
          prompt: "",
          options: [{ id: "a", text: "" }, { id: "b", text: "" }],
          correctOptionId: "a",
          explanation: "",
        }
      : undefined;
    updateSlide(slideIndex, { type, question });
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
    setForm((previous) => ({ ...previous, slides: [...previous.slides, nextSlide] }));
    setSelectedSlideIndex(form.slides.length);
  };

  const deleteSelectedSlide = () => {
    if (form.slides.length <= 1) return;
    setForm((previous) => ({
      ...previous,
      slides: previous.slides.filter((_, index) => index !== selectedSlideIndex),
    }));
    setSelectedSlideIndex((index) => Math.max(0, Math.min(index, form.slides.length - 2)));
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
    setMatchedColumns(null);
    setErrors([]);
  };

  const openImportEditor = () => {
    setEditorMode("create");
    setEditingLessonId("");
    setForm(emptyForm);
    setSelectedSlideIndex(0);
    setSelectedFile("");
    setFileName("");
    setMatchedColumns(null);
    setErrors([]);
    setImportOpen(true);
  };

  const saveImportedLesson = async () => {
    if (editorMode === "create" && !selectedFile) return;
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
        slides: form.slides,
      };
      if (editorMode === "edit") {
        await api.put(`/live/lessons/${editingLessonId}`, lessonData);
      } else {
        await api.post("/live/lessons", lessonData);
      }
      closeEditor(true);
      await loadData();
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || [{
        row: 1,
        field: "import",
        message: requestError.response?.data?.message || (editorMode === "edit" ? "Could not update this lesson." : "Could not import this lesson."),
      }]);
    } finally {
      setSaving(false);
    }
  };

  const deleteLesson = async (lessonId) => {
    if (!window.confirm("Permanently delete this lesson and ALL associated session history, answers, reports, and timelines? This cannot be undone.")) return;
    try {
      await api.delete(`/live/lessons/${lessonId}`);
      setSelectedLessonIds((current) => current.filter((id) => String(id) !== String(lessonId)));
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete lesson.");
    }
  };

  const deleteSelectedLessons = async () => {
    const lessonIds = [...new Set(selectedLessonIds.map(String))];
    if (!lessonIds.length || bulkDeletingLessons) return;
    if (!window.confirm(`Permanently delete ${lessonIds.length} selected lesson${lessonIds.length === 1 ? "" : "s"} and all deletable associated session history? Lessons with a live session or Gradebook-linked history will be kept.`)) return;

    setBulkDeletingLessons(true);
    setError("");
    setNotice("");
    const deletedIds = [];
    const failures = [];
    try {
      for (let index = 0; index < lessonIds.length; index += 100) {
        const batch = lessonIds.slice(index, index + 100);
        const response = await api.post("/live/lessons/bulk-delete", { lessonIds: batch });
        const data = response.data?.data || {};
        deletedIds.push(...(data.deletedIds || []));
        failures.push(...(data.failures || []));
      }
      const deletedSet = new Set(deletedIds.map(String));
      setSelectedLessonIds((current) => current.filter((id) => !deletedSet.has(String(id))));
      setNotice(`${deletedIds.length} lesson${deletedIds.length === 1 ? "" : "s"} deleted.${failures.length ? ` ${failures.length} could not be deleted: ${failures.map((failure) => failure.message).join("; ")}` : ""}`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Bulk delete stopped after deleting ${deletedIds.length} lessons. Reload the list and try again for the remaining selections.`);
      if (deletedIds.length) {
        const deletedSet = new Set(deletedIds.map(String));
        setSelectedLessonIds((current) => current.filter((id) => !deletedSet.has(String(id))));
        await loadData();
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
      const sharedIds = new Set(invitations.map((invitation) => String(invitation.sourceLessonId)));
      const lessonTitles = new Map(shareLessons.map((lesson) => [String(lesson._id), lesson.title]));
      setSelectedLessonIds((current) => current.filter((id) => !sharedIds.has(String(id))));
      const failureDetails = failures
        .map(({ lessonId, message }) => `${lessonTitles.get(String(lessonId)) || lessonId}: ${message}`)
        .join("; ");
      setNotice(`${invitations.length} lesson${invitations.length === 1 ? "" : "s"} shared with ${getTeacherName(teachers.find((teacher) => String(teacher._id) === shareRecipient))}.${failureDetails ? ` Could not share: ${failureDetails}. Failed lessons remain selected.` : ""}`);
      setShareLessons([]);
      setShareRecipient("");
      await loadShares();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not share these lessons.");
    } finally {
      setShareSaving(false);
    }
  };

  const respondToShare = async (invitationId, action) => {
    try {
      await api.post(`/live/shares/${invitationId}/${action}`);
      await Promise.all([loadShares(), loadData()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Could not ${action} this lesson invitation.`);
    }
  };

  const respondToSelectedShares = async (action, invitationIds = selectedIncomingShareIds) => {
    const ids = [...new Set(invitationIds.map(String))];
    if (!ids.length || bulkRespondingToShares) return;
    if (action === "decline" && !window.confirm(`Decline ${ids.length} lesson invitation${ids.length === 1 ? "" : "s"}?`)) return;

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
      setSelectedIncomingShareIds((current) => current.filter((id) => !completedSet.has(String(id))));
      setNotice(`${completedIds.length} invitation${completedIds.length === 1 ? "" : "s"} ${action === "accept" ? "accepted" : "declined"}.${failures.length ? ` ${failures.length} could not be processed: ${failures.map((failure) => failure.message).join("; ")}` : ""}`);
      await Promise.all([loadShares(), loadData()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Bulk ${action} stopped after processing ${completedIds.length} invitations. Reload invitations and try again for the remaining selections.`);
      if (completedIds.length) {
        const completedSet = new Set(completedIds.map(String));
        setSelectedIncomingShareIds((current) => current.filter((id) => !completedSet.has(String(id))));
        await Promise.all([loadShares(), loadData()]);
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
      setError(requestError.response?.data?.message || "Could not revoke this lesson invitation.");
    }
  };

  const openSessionDialog = (lesson, scheduled) => {
    const assignedClassId = lesson.classId?._id || lesson.classId;
    const classId = assignedClassId || lessonClasses[lesson._id] || lessonListState.classId;
    if (!classId) {
      setError("Choose a class before starting a live lesson.");
      return;
    }
    setError("");
    setSessionDraft({
      lesson,
      classId: String(classId),
      assignedClass: Boolean(assignedClassId),
      scheduled,
      scheduledAt: scheduled ? localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)) : "",
      timerDurationMinutes: 45,
    });
  };

  const createSession = async () => {
    if (!sessionDraft?.classId) return;
    const scheduleDate = sessionDraft.scheduled ? new Date(sessionDraft.scheduledAt) : null;
    if (sessionDraft.scheduled && (!sessionDraft.scheduledAt || Number.isNaN(scheduleDate.getTime()) || scheduleDate <= new Date())) {
      setError("Choose a scheduled time in the future.");
      return;
    }
    setCreatingSession(true);
    try {
      const response = await api.post("/live/sessions", {
        lessonId: sessionDraft.lesson._id,
        classId: sessionDraft.classId,
        timerDurationMinutes: Number(sessionDraft.timerDurationMinutes),
        ...(sessionDraft.scheduled ? { scheduledAt: scheduleDate.toISOString() } : {}),
      });
      const sessionId = response.data.data.session._id;
      const isScheduled = sessionDraft.scheduled;
      setSessionDraft(null);
      if (isScheduled) {
        setSessionListState({ ...defaultListState, status: "waiting" });
        setTab("sessions");
        setNotice(`“${response.data.data.session.lessonTitle}” is scheduled. Open the waiting session and start it when the class is ready.`);
      } else {
        navigate(`/portal/live-lessons/sessions/${sessionId}`);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create the lesson session.");
    } finally {
      setCreatingSession(false);
    }
  };

  const deleteSession = async (session) => {
    const title = session.lessonSnapshot?.title || "this lesson session";
    if (!window.confirm(`Permanently delete the session history for "${title}"? Its report, replay, answers, and timeline will be removed. The lesson itself will not be deleted.`)) return;
    try {
      await api.delete(`/live/sessions/${session._id}`);
      await Promise.all([loadData(), loadSessions()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete this session history.");
    }
  };

  const deleteFinishedSessions = async () => {
    if (!window.confirm("Permanently delete all of your finished live-session histories? Reports, replays, answers, and timelines will be removed. Sessions linked to gradebook entries will be kept.")) return;
    setDeletingFinishedSessions(true);
    setError("");
    setNotice("");
    try {
      const response = await api.delete("/live/sessions/finished");
      const { deletedCount = 0, skippedGradebookCount = 0 } = response.data?.data || {};
      setNotice(`${deletedCount} finished session${deletedCount === 1 ? "" : "s"} deleted.${skippedGradebookCount ? ` ${skippedGradebookCount} linked to gradebook entries were kept.` : ""}`);
      await loadSessions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not delete finished session histories.");
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
      setLessons((current) => current.map((item) => (
        String(item._id) === String(lesson._id) ? { ...item, isDone } : item
      )));
      setNotice(`“${lesson.title}” marked as ${isDone ? "done" : "not done"}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update lesson status.");
    }
  };

  const endSession = async (session) => {
    const title = session.lessonSnapshot?.title || "this live lesson";
    if (!window.confirm(`End "${title}" now? Students will be returned to the completed session.`)) return;
    setEndingSessionId(String(session._id));
    setError("");
    try {
      await api.post(`/live/sessions/${session._id}/end`);
      await loadSessions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not end this live session.");
    } finally {
      setEndingSessionId("");
    }
  };

  const activeSlide = form.slides[selectedSlideIndex];
  const classesById = useMemo(
    () => new Map(classes.map((classItem) => [String(classItem._id), classItem])),
    [classes],
  );
  const listSubjectsForClass = (classId) => {
    if (!classId) return subjects;
    const selectedClass = classesById.get(String(classId));
    const assignedIds = (selectedClass?.subjects || [])
      .map((entry) => entry.subject?._id || entry.subject)
      .filter(Boolean)
      .map(String);
    if (!assignedIds.length) return [];
    return subjects.filter((subject) => assignedIds.includes(String(subject._id)));
  };
  const lessonSubjects = listSubjectsForClass(lessonListState.classId);
  const sessionSubjects = listSubjectsForClass(sessionListState.classId);
  const editorSubjects = listSubjectsForClass(form.classId);
  const filteredLessons = [...lessons].sort((left, right) => (
    new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime() ||
    String(left.title || "").localeCompare(String(right.title || ""))
  )).filter((lesson) => (
    (lessonListState.showDone || !lesson.isDone) &&
    (!lessonListState.subject || String(lesson.subjectId?._id || lesson.subjectId || "") === lessonListState.subject)
    && (!lessonListState.classId || String(lesson.classId?._id || lesson.classId || "") === lessonListState.classId)
  ));
  const lessonPages = Math.max(1, Math.ceil(filteredLessons.length / lessonListState.pageSize));
  const lessonPage = Math.min(lessonListState.page, lessonPages);
  const visibleLessons = filteredLessons.slice(
    (lessonPage - 1) * lessonListState.pageSize,
    lessonPage * lessonListState.pageSize,
  );
  const updateLessonList = (changes) => setLessonListState((current) => ({ ...current, ...changes }));
  const updateSessionList = (changes) => setSessionListState((current) => ({ ...current, ...changes }));
  const showRange = (page, pageSize, count) => count
    ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`
    : "0 of 0";
  const getTeacherName = (teacher) => [teacher?.firstName, teacher?.lastName].filter(Boolean).join(" ") || teacher?.name || teacher?.email || "Teacher";
  const shareableTeachers = teachers;

  return (
    <div className="live-lessons-page">

      <nav className="live-lessons-tabs" aria-label="Live lesson sections">
        <button className={tab === "lessons" ? "active" : ""} onClick={() => setTab("lessons")}>My lessons <span>{lessons.length}</span></button>
        <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>Session history <span>{sessionPagination.total}</span></button>
      </nav>

      {error && <div className="live-error-banner" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {notice && <div className="live-success-banner" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
      {user?.role === "admin" && (
        <section className="live-safety-setting">
          <div>
            <strong>AI HTML safety review</strong>
            <p>When enabled, AI reviews HTML and scripts before saving. When disabled, CSS animation still works but slides containing JavaScript are rejected. Approved scripts run in an isolated, network-restricted sandbox.</p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={aiHtmlReviewEnabled}
              disabled={savingHtmlReviewSetting}
              onChange={(event) => updateAiHtmlReviewSetting(event.target.checked)}
            />
            {savingHtmlReviewSetting ? "Saving…" : aiHtmlReviewEnabled ? "Enabled" : "Disabled"}
          </label>
        </section>
      )}
      {loading ? (
        <div className="live-loading">Loading live lessons…</div>
      ) : tab === "lessons" ? (
        <>
          <div className="live-lessons-actions">
            <p>Import a CSV lesson, preview every slide, and launch it with a class. Select one or more lessons to share them with another teacher at once, or mark lessons done and hide or show them with the filter.</p>
            <div className="live-session-actions">
              <button className="live-text-button" onClick={copyAiPrompt}>
                {promptCopied ? <HiOutlineCheck /> : <HiOutlineClipboardDocument />}
                {promptCopied ? "Copied to clipboard" : "Copy AI prompt + sample"}
              </button>
              {["teacher", "admin"].includes(user?.role) && selectedLessonIds.length > 0 && (
                <>
                  <button
                    className="live-secondary-button"
                    onClick={() => {
                      setShareLessons(lessons.filter((lesson) => selectedLessonIds.includes(String(lesson._id))));
                      setShareRecipient("");
                    }}
                  >
                    <HiOutlineShare /> Share selected ({selectedLessonIds.length})
                  </button>
                  <button className="live-delete-session" onClick={deleteSelectedLessons} disabled={bulkDeletingLessons}>
                    <HiOutlineTrash /> {bulkDeletingLessons ? "Deleting…" : `Delete selected (${selectedLessonIds.length})`}
                  </button>
                </>
              )}
              {["teacher", "admin"].includes(user?.role) && filteredLessons.length > 0 && (
                <button
                  className="live-text-button"
                  onClick={() => setSelectedLessonIds((current) => (
                    filteredLessons.every((lesson) => current.includes(String(lesson._id)))
                      ? current.filter((id) => !filteredLessons.some((lesson) => String(lesson._id) === String(id)))
                      : [...new Set([...current, ...filteredLessons.map((lesson) => String(lesson._id))])]
                  ))}
                >
                  {filteredLessons.every((lesson) => selectedLessonIds.includes(String(lesson._id)))
                    ? "Clear all filtered selections"
                    : `Select all filtered lessons (${filteredLessons.length})`}
                </button>
              )}
              <button className="live-primary-button" onClick={openImportEditor}><HiOutlineArrowUpTray /> Import CSV lesson</button>
            </div>
          </div>
          {["teacher", "admin"].includes(user?.role) && (incomingShares.length > 0 || outgoingShares.length > 0) && (
            <section className="live-share-invitations" aria-label="Lesson sharing invitations">
              {incomingShares.length > 0 && (
                <div>
                  <div className="live-share-bulk-heading">
                    <h2>Lessons shared with you</h2>
                    <label>
                      <input
                        type="checkbox"
                        aria-label="Select all incoming lesson invitations"
                        checked={incomingShares.length > 0 && incomingShares.every((invitation) => selectedIncomingShareIds.includes(String(invitation._id)))}
                        onChange={(event) => setSelectedIncomingShareIds(event.target.checked
                          ? incomingShares.map((invitation) => String(invitation._id))
                          : [])}
                      />
                      Select all
                    </label>
                  </div>
                  <div className="live-share-bulk-actions">
                    <button
                      className="live-primary-button"
                      disabled={bulkRespondingToShares}
                      onClick={() => respondToSelectedShares("accept", incomingShares.map((invitation) => String(invitation._id)))}
                    >
                      {bulkRespondingToShares ? "Processing…" : "Accept all"}
                    </button>
                    <button
                      className="live-secondary-button"
                      disabled={bulkRespondingToShares}
                      onClick={() => respondToSelectedShares("decline", incomingShares.map((invitation) => String(invitation._id)))}
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
                          checked={selectedIncomingShareIds.includes(String(invitation._id))}
                          disabled={bulkRespondingToShares}
                          onChange={(event) => setSelectedIncomingShareIds((current) => (
                            event.target.checked
                              ? [...new Set([...current, String(invitation._id)])]
                              : current.filter((id) => String(id) !== String(invitation._id))
                          ))}
                        />
                        <div>
                          <strong>{invitation.lesson?.title || "Shared lesson"}</strong>
                          <span>From {[invitation.sender?.firstName, invitation.sender?.lastName].filter(Boolean).join(" ") || "a teacher"}{invitation.lesson?.subject ? ` · ${invitation.lesson.subject}` : ""}</span>
                        </div>
                        <div className="live-share-actions">
                          <button className="live-primary-button" disabled={bulkRespondingToShares} onClick={() => respondToShare(invitation._id, "accept")}>Accept and add</button>
                          <button className="live-secondary-button" disabled={bulkRespondingToShares} onClick={() => respondToShare(invitation._id, "decline")}>Decline</button>
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
                          <strong>{invitation.lesson?.title || "Shared lesson"}</strong>
                          <span>Shared with {getTeacherName(invitation.recipient)}</span>
                        </div>
                        <button className="live-delete-session" onClick={() => revokeShare(invitation._id)}>Revoke</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {lessons.length === 0 ? (
            <div className="live-empty-state">
              <div className="live-empty-icon"><HiOutlinePresentationChartBar size={32} /></div>
              <h2>Start with a lesson you already teach</h2>
              <p>Import a CSV to create opening, teaching, example, question, activity, and exit-ticket slides. No AI generation required.</p>
              <button className="live-primary-button" onClick={openImportEditor}><HiOutlinePlus /> Import your first lesson</button>
              <button className="live-text-button" onClick={downloadTemplate}><HiOutlineArrowDownTray /> Download the sample lesson CSV</button>
            </div>
          ) : (
            <>
              <div className="live-list-filters">
                <label>Assigned class
                  <select value={lessonListState.classId} onChange={(event) => updateLessonList({ classId: event.target.value, subject: "", page: 1 })}>
                    <option value="">All classes</option>
                    {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
                  </select>
                </label>
                <label>Subject
                  <select value={lessonListState.subject} onChange={(event) => updateLessonList({ subject: event.target.value, page: 1 })}>
                    <option value="">All subjects</option>
                    {lessonSubjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}
                  </select>
                </label>
                <label className="live-checkbox-filter">
                  <input
                    type="checkbox"
                    checked={lessonListState.showDone}
                    onChange={(event) => updateLessonList({ showDone: event.target.checked, page: 1 })}
                  />
                  Show done lessons
                </label>
                <button className="live-text-button" onClick={() => updateLessonList({ ...defaultListState })}>Clear filters</button>
              </div>
              <div className="live-list-table-wrap">
                <table className="live-list-table">
                  <thead><tr>
                    <th>
                      {["teacher", "admin"].includes(user?.role) && (
                        <input
                          type="checkbox"
                          aria-label="Select all lessons on this page"
                          checked={visibleLessons.length > 0 && visibleLessons.every((lesson) => selectedLessonIds.includes(String(lesson._id)))}
                          onChange={(event) => setSelectedLessonIds((current) => {
                            const visibleIds = new Set(visibleLessons.map((lesson) => String(lesson._id)));
                            return event.target.checked
                              ? [...new Set([...current, ...visibleIds])]
                              : current.filter((id) => !visibleIds.has(String(id)));
                          })}
                        />
                      )}
                    </th>
                    <th>Lesson</th><th>Status</th><th>Subject</th><th>Slides</th><th>Updated</th><th>Assigned class</th><th>Actions</th>
                  </tr></thead>
                  <tbody>{visibleLessons.map((lesson) => (
                    <tr key={lesson._id}>
                      <td>
                        {["teacher", "admin"].includes(user?.role) && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${lesson.title} for bulk actions`}
                            checked={selectedLessonIds.includes(String(lesson._id))}
                            onChange={(event) => setSelectedLessonIds((current) => (
                              event.target.checked
                                ? [...new Set([...current, String(lesson._id)])]
                                : current.filter((id) => String(id) !== String(lesson._id))
                            ))}
                          />
                        )}
                      </td>
                      <td><strong>{lesson.title}</strong>{lesson.description && <small>{lesson.description}</small>}</td>
                      <td>{lesson.isDone ? <span className="live-lesson-done-pill">Done</span> : "—"}</td>
                      <td>{lesson.subjectId?.name || lesson.subject || "—"}{!lesson.classId && <small>Not linked to a class</small>}</td>
                      <td>{lesson.slides?.length || 0}</td>
                      <td>{lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString() : "—"}</td>
                      <td>
                        {lesson.classId ? (
                          <span>{lesson.classId?.name || classesById.get(String(lesson.classId?._id || lesson.classId))?.name || "Assigned class"}</span>
                        ) : (
                          <select aria-label={`Launch class for ${lesson.title}`} value={lessonClasses[lesson._id] || lessonListState.classId || ""} onChange={(event) => setLessonClasses((previous) => ({ ...previous, [lesson._id]: event.target.value }))}>
                            <option value="">Choose class…</option>
                            {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="live-list-row-actions">
                        <button className="live-secondary-button" onClick={() => void openLessonPreview(lesson._id)}><HiOutlineEye /> Preview</button>
                        <button className="live-primary-button" onClick={() => openSessionDialog(lesson, false)} disabled={!((lesson.classId?._id || lesson.classId) || lessonClasses[lesson._id] || lessonListState.classId)}><HiOutlinePlay /> Start</button>
                        <button className="live-secondary-button" onClick={() => openSessionDialog(lesson, true)} disabled={!((lesson.classId?._id || lesson.classId) || lessonClasses[lesson._id] || lessonListState.classId)}>Schedule</button>
                        <button className="live-secondary-button" onClick={() => openLessonEditor(lesson._id)}><HiOutlinePencilSquare /> Edit</button>
                        {["teacher", "admin"].includes(user?.role) && <button className="live-secondary-button" onClick={() => { setShareLessons([lesson]); setShareRecipient(""); }}><HiOutlineShare /> Share</button>}
                        <button className="live-secondary-button" onClick={() => setLessonDone(lesson)}><HiOutlineCheck /> {lesson.isDone ? "Mark not done" : "Mark done"}</button>
                        <button className="live-delete-session" onClick={() => deleteLesson(lesson._id)}><HiOutlineTrash /> Delete</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                {!visibleLessons.length && <p className="live-list-empty">No lessons match these filters.</p>}
              </div>
              <div className="live-list-pagination">
                <span>Showing {showRange(lessonPage, lessonListState.pageSize, filteredLessons.length)}</span>
                <label>Rows
                  <select value={lessonListState.pageSize} onChange={(event) => updateLessonList({ pageSize: Number(event.target.value), page: 1 })}>
                    {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <button disabled={lessonPage <= 1} onClick={() => updateLessonList({ page: lessonPage - 1 })}>Previous</button>
                <span>Page {lessonPage} of {lessonPages}</span>
                <button disabled={lessonPage >= lessonPages} onClick={() => updateLessonList({ page: lessonPage + 1 })}>Next</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="live-list-filters">
            <label>Search sessions
              <input
                type="search"
                value={sessionListState.search}
                placeholder="Lesson, class, subject, or code"
                onChange={(event) => updateSessionList({ search: event.target.value, page: 1 })}
              />
            </label>
            <label>Class
              <select value={sessionListState.classId} onChange={(event) => updateSessionList({ classId: event.target.value, subject: "", page: 1 })}>
                <option value="">All classes</option>
                {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
              </select>
            </label>
            <label>Subject
              <select value={sessionListState.subject} onChange={(event) => updateSessionList({ subject: event.target.value, page: 1 })}>
                <option value="">All subjects</option>
                <option value="__unknown__">Unknown / not set</option>
                {sessionSubjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}
              </select>
            </label>
            <label>Status
              <select value={sessionListState.status} onChange={(event) => updateSessionList({ status: event.target.value, page: 1 })}>
                <option value="">All statuses</option>
                <option value="waiting">Waiting</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <label>From date
              <input type="date" value={sessionListState.dateFrom} onChange={(event) => updateSessionList({ dateFrom: event.target.value, page: 1 })} />
            </label>
            <label>To date
              <input type="date" value={sessionListState.dateTo} onChange={(event) => updateSessionList({ dateTo: event.target.value, page: 1 })} />
            </label>
            <button className="live-text-button" onClick={() => updateSessionList({ ...defaultListState })}>Clear filters</button>
            {["teacher", "admin"].includes(user?.role) && (
              <button
                className="live-delete-session"
                onClick={deleteFinishedSessions}
                disabled={deletingFinishedSessions}
              >
                <HiOutlineTrash /> {deletingFinishedSessions ? "Deleting finished sessions…" : "Delete all finished sessions"}
              </button>
            )}
          </div>
          <div className="live-list-table-wrap">
            <table className="live-list-table">
              <thead><tr><th>Session</th><th>Class</th><th>Subject</th><th>Date</th><th>Duration</th><th>Timer</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{sessions.map((session) => (
                <tr key={session._id}>
                  <td><strong>{session.lessonSnapshot?.title || "Live lesson"}</strong></td>
                  <td>{classesById.get(String(session.classId?._id || session.classId))?.name || session.classId?.name || "Class"}</td>
                  <td>{session.lessonSnapshot?.subject || "Unknown / not set"}</td>
                  <td>{getSessionDisplayDate(session) ? new Date(getSessionDisplayDate(session)).toLocaleString() : "—"}</td>
                  <td>{formatSessionDuration(session)}</td>
                  <td>
                    {session.timerDurationMinutes > 0 ? `${session.timerDurationMinutes} min` : "—"}
                    {session.scheduledAt && session.status === "waiting" && (
                      <small>Scheduled {new Date(session.scheduledAt).toLocaleString()}</small>
                    )}
                  </td>
                  <td><span className={`live-status-pill ${session.status}`}>{session.status}</span></td>
                  <td className="live-list-row-actions">
                    {session.status !== "ended" && <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}`)}>{session.status === "waiting" ? "Open / start" : "Open session"}</button>}
                    {session.status === "live" && String(session.teacherId) === String(user?._id || user?.id) && (
                      <button
                        className="live-delete-session"
                        onClick={() => endSession(session)}
                        disabled={Boolean(endingSessionId)}
                      >
                        <HiOutlineStop /> {endingSessionId === String(session._id) ? "Ending…" : "End session"}
                      </button>
                    )}
                    <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}/report`)}>Report</button>
                    <button className="live-secondary-button" onClick={() => navigate(`/portal/live-lessons/sessions/${session._id}/replay`)}>Replay</button>
                    <button className="live-delete-session" onClick={() => deleteSession(session)} disabled={session.status === "live"} title={session.status === "live" ? "End the live session before deleting its history." : "Delete this session history"}><HiOutlineTrash /> Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {!sessions.length && <p className="live-list-empty">{sessionPagination.total ? "No sessions match these filters." : "No sessions yet. Start a live lesson to see sessions and reports here."}</p>}
          </div>
          <div className="live-list-pagination">
            <span>Showing {showRange(sessionPagination.page || sessionListState.page, sessionListState.pageSize, sessionPagination.total)}</span>
            <label>Rows
              <select value={sessionListState.pageSize} onChange={(event) => updateSessionList({ pageSize: Number(event.target.value), page: 1 })}>
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button disabled={sessionListState.page <= 1} onClick={() => updateSessionList({ page: sessionListState.page - 1 })}>Previous</button>
            <span>Page {sessionPagination.pages ? sessionListState.page : 0} of {sessionPagination.pages || 0}</span>
            <button disabled={!sessionPagination.pages || sessionListState.page >= sessionPagination.pages} onClick={() => updateSessionList({ page: sessionListState.page + 1 })}>Next</button>
          </div>
        </>
      )}

      {(previewLoading || previewLesson || previewError) && (
        <div className="live-import-overlay" role="presentation" onClick={() => { if (!previewLoading) { setPreviewLesson(null); setPreviewError(""); } }}>
          <section className="live-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="live-preview-title" onClick={(event) => event.stopPropagation()}>
            <header className="live-import-header">
              <div>
                <span className="live-eyebrow">LESSON PREVIEW</span>
                <h2 id="live-preview-title">{previewLesson?.title || "Preview lesson"}</h2>
                {previewLesson?.description && <p>{previewLesson.description}</p>}
              </div>
              <button className="live-dialog-close" onClick={() => { setPreviewLesson(null); setPreviewError(""); }} aria-label="Close lesson preview" disabled={previewLoading}>×</button>
            </header>
            {previewLoading && <p className="live-preview-status" role="status">Loading lesson preview…</p>}
            {previewError && <p className="live-preview-status live-preview-error" role="alert">{previewError}</p>}
            {previewLesson && (() => {
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
                        aria-current={previewSlideIndex === index ? "step" : undefined}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>{item.title || item.type}
                      </button>
                    ))}
                  </div>
                  <div className="live-preview-dialog-content">
                    {slide ? (
                      <>
                        <LiveLessonSlide slide={slide} index={previewSlideIndex} total={slides.length} language={previewLesson.language} />
                        {slide.question && (
                          <section className="live-preview-question">
                            <span className="live-eyebrow">QUESTION</span>
                            <h3>{slide.question.prompt}</h3>
                            <ol type="A">
                              {(slide.question.options || []).map((option) => (
                                <li key={option.id} className={option.id === slide.question.correctOptionId ? "correct" : ""}>
                                  {option.text}{option.id === slide.question.correctOptionId && <strong> · Correct answer</strong>}
                                </li>
                              ))}
                            </ol>
                            {slide.question.explanation && <p><strong>Explanation:</strong> {slide.question.explanation}</p>}
                          </section>
                        )}
                      </>
                    ) : <p className="live-preview-status">This lesson has no slides to preview.</p>}
                  </div>
                  <footer className="live-preview-navigation">
                    <span>{slides.length ? `Slide ${previewSlideIndex + 1} of ${slides.length}` : "No slides"}</span>
                    <div>
                      <button type="button" className="live-secondary-button" disabled={previewSlideIndex <= 0} onClick={() => setPreviewSlideIndex((index) => index - 1)}>Previous</button>
                      <button type="button" className="live-primary-button" disabled={previewSlideIndex >= slides.length - 1} onClick={() => setPreviewSlideIndex((index) => index + 1)}>Next</button>
                    </div>
                  </footer>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {sessionDraft && (
        <div className="live-import-overlay" role="presentation" onClick={() => !creatingSession && setSessionDraft(null)}>
          <section className="live-share-dialog" role="dialog" aria-modal="true" aria-labelledby="live-session-create-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="live-eyebrow">{sessionDraft.scheduled ? "SCHEDULE CLASS" : "START CLASS"}</span>
                <h2 id="live-session-create-title">{sessionDraft.lesson.title}</h2>
              </div>
              <button className="live-dialog-close" onClick={() => setSessionDraft(null)} aria-label="Close session setup" disabled={creatingSession}>×</button>
            </header>
            <label className="live-edit-field">Class
              <select value={sessionDraft.classId} disabled={sessionDraft.assignedClass} onChange={(event) => setSessionDraft((current) => ({ ...current, classId: event.target.value }))}>
                {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
              </select>
            </label>
            {sessionDraft.scheduled && (
              <label className="live-edit-field">Scheduled date and time
                <input
                  type="datetime-local"
                  min={localDateTimeValue(new Date())}
                  value={sessionDraft.scheduledAt}
                  onChange={(event) => setSessionDraft((current) => ({ ...current, scheduledAt: event.target.value }))}
                  required
                />
              </label>
            )}
            <label className="live-edit-field">Class timer (minutes)
              <input
                type="number"
                min="0"
                max="240"
                step="1"
                value={sessionDraft.timerDurationMinutes}
                onChange={(event) => setSessionDraft((current) => ({ ...current, timerDurationMinutes: event.target.value }))}
              />
              <span>Starts when you start the class. Use 0 for no timer. The timer will notify you at zero but will not end the session.</span>
            </label>
            <footer>
              <button className="live-secondary-button" onClick={() => setSessionDraft(null)} disabled={creatingSession}>Cancel</button>
              <button
                className="live-primary-button"
                onClick={createSession}
                disabled={creatingSession || !sessionDraft.classId || !/^\d+$/.test(String(sessionDraft.timerDurationMinutes)) || Number(sessionDraft.timerDurationMinutes) > 240}
              >
                {creatingSession ? "Creating…" : sessionDraft.scheduled ? "Schedule session" : "Create session"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {shareLessons.length > 0 && (
        <div className="live-import-overlay" role="presentation" onClick={() => setShareLessons([])}>
          <section className="live-share-dialog" role="dialog" aria-modal="true" aria-labelledby="live-share-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="live-eyebrow">TEACHER-TO-TEACHER</span><h2 id="live-share-title">Share {shareLessons.length === 1 ? `“${shareLessons[0].title}”` : `${shareLessons.length} lessons`}</h2></div>
              <button className="live-dialog-close" onClick={() => setShareLessons([])} aria-label="Close share dialog">×</button>
            </header>
            <p>The recipient can accept a copy of each lesson. Your lessons and session histories stay separate.</p>
            <label className="live-edit-field">Teacher
              <select value={shareRecipient} onChange={(event) => setShareRecipient(event.target.value)}>
                <option value="">Choose a teacher…</option>
                {shareableTeachers.map((teacher) => <option key={teacher._id} value={teacher._id}>{getTeacherName(teacher)}</option>)}
              </select>
            </label>
            {!shareableTeachers.length && <p className="live-list-empty">No other active teachers are available to share with.</p>}
            <footer>
              <button className="live-secondary-button" onClick={() => setShareLessons([])}>Cancel</button>
              <button className="live-primary-button" disabled={!shareRecipient || shareSaving} onClick={shareLessonWithTeacher}>{shareSaving ? "Sending…" : `Send ${shareLessons.length === 1 ? "invitation" : `${shareLessons.length} invitations`}`}</button>
            </footer>
          </section>
        </div>
      )}

      {importOpen && (
        <div className="live-import-overlay" role="presentation" onClick={closeEditor}>
          <section className="live-import-dialog" role="dialog" aria-modal="true" aria-labelledby="live-import-title" onClick={(event) => event.stopPropagation()}>
            <header className="live-import-header">
              <div><span className="live-eyebrow">{editorMode === "edit" ? "LESSON EDITOR" : "CSV LESSON BUILDER"}</span><h2 id="live-import-title">{editorMode === "edit" ? "Edit lesson" : "Import a lesson"}</h2></div>
              <button className="live-dialog-close" onClick={closeEditor} aria-label="Close lesson editor" disabled={saving}>×</button>
            </header>
            {editorMode === "create" && <div className="live-import-toolbar">
              <p>Each row becomes a designed lesson slide. Question rows become answerable checks in the live session.</p>
              <div className="live-session-actions">
                <button className="live-text-button" onClick={copyAiPrompt}>
                  {promptCopied ? <HiOutlineCheck /> : <HiOutlineClipboardDocument />}
                  {promptCopied ? "Copied" : "Copy AI prompt"}
                </button>
                <button className="live-text-button" onClick={downloadTemplate}><HiOutlineArrowDownTray /> Sample CSV</button>
              </div>
            </div>}
            {editorMode === "create" && <label className="live-file-drop">
              <HiOutlineArrowUpTray size={27} />
              <strong>{fileName || "Choose a CSV file to preview"}</strong>
              <span>We’ll match familiar column names, including aliases like “heading” for “title”.</span>
              <input type="file" accept=".csv,text/csv" onChange={handleSelectFile} />
            </label>}
            {editorMode === "edit" && saving && <div className="live-loading">Loading lesson…</div>}
            {matchedColumns && (
              <div className="live-column-matches">
                <strong>Matched columns</strong>
                <div>{Object.entries(matchedColumns).map(([field, column]) => <span key={field}>{field}: <b>{column}</b></span>)}</div>
              </div>
            )}
            {errors.length > 0 && (
              <div className="live-import-errors" role="alert">
                <strong>{editorMode === "edit" ? "Fix these lesson issues to continue" : "Fix these CSV issues to continue"}</strong>
                {errors.map((item, index) => <p key={`${item.row}-${item.field}-${index}`}>Row {item.row} · {item.field}: {item.message}</p>)}
              </div>
            )}
            {form.slides.length > 0 && (
              <div className="live-import-preview">
                <div className="live-preview-heading">
                  <div><span className="live-eyebrow">{editorMode === "edit" ? "EDIT LESSON" : "PREVIEW"} · {form.slides.length} SLIDES</span><h3>{editorMode === "edit" ? "Update lesson content and slides" : "Review and polish before saving"}</h3></div>
                  {editorMode === "edit" &&                   <div className="live-slide-edit-actions"><button className="live-secondary-button" onClick={addSlide} disabled={form.slides.length >= 200}><HiOutlinePlus /> Add slide</button><button className="live-delete-slide" onClick={deleteSelectedSlide} disabled={form.slides.length <= 1}><HiOutlineTrash /> Remove selected</button></div>}
                </div>
                <label className="live-edit-field">Lesson title<input value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} /></label>
                <label className="live-edit-field">Description<textarea rows={2} value={form.description || ""} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} /></label>
                <div className="live-lesson-metadata-fields">
                  <label className="live-edit-field">Assigned class
                    <select
                      value={form.classId}
                      onChange={(event) => setForm((previous) => ({ ...previous, classId: event.target.value, subjectId: "", subject: "" }))}
                    >
                      <option value="">Choose a class…</option>
                      {classes.map((classItem) => <option key={classItem._id} value={classItem._id}>{classItem.name}</option>)}
                    </select>
                  </label>
                  <label className="live-edit-field">Class subject
                    <select
                      value={form.subjectId}
                      disabled={!form.classId}
                      onChange={(event) => {
                        const selectedSubject = editorSubjects.find((item) => String(item._id) === event.target.value);
                        setForm((previous) => ({
                          ...previous,
                          subjectId: event.target.value,
                          subject: selectedSubject?.name || "",
                        }));
                      }}
                    >
                      <option value="">{form.classId ? "Choose a subject…" : "Choose a class first"}</option>
                      {editorSubjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}
                    </select>
                  </label>
                  <label className="live-edit-field">Grade<input value={form.grade || ""} onChange={(event) => setForm((previous) => ({ ...previous, grade: event.target.value }))} /></label>
                  <label className="live-edit-field">Language<input value={form.language || "en"} onChange={(event) => setForm((previous) => ({ ...previous, language: event.target.value }))} /></label>
                </div>
                <div className="live-preview-slide-strip">
                  {form.slides.map((slide, index) => (
                    <button className={`live-preview-chip ${selectedSlideIndex === index ? "active" : ""}`} key={`${index}-${slide.title}`} onClick={() => setSelectedSlideIndex(index)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>{slide.title || slide.type}
                    </button>
                  ))}
                </div>
                <div className="live-preview-workspace">
                  <LiveLessonSlide slide={activeSlide} index={selectedSlideIndex} total={form.slides.length} language={form.language} />
                  {activeSlide && (
                    <div className="live-preview-editors">
                      {editorMode === "edit" && (
                        <label className="live-edit-field">Slide type
                          <select value={activeSlide.type} onChange={(event) => changeSlideType(selectedSlideIndex, event.target.value)}>
                            {["opening", "goals", "content", "examples", "html", "question", "activity", "exit-ticket"].map((type) => <option value={type} key={type}>{type.replace("-", " ")}</option>)}
                          </select>
                        </label>
                      )}
                      <label className="live-edit-field">Slide title<input value={activeSlide.title || ""} onChange={(event) => updateSlide(selectedSlideIndex, { title: event.target.value })} /></label>
                      {activeSlide.type === "html" ? (
                        <label className="live-edit-field">Slide HTML<textarea rows={12} value={activeSlide.html || ""} onChange={(event) => updateSlide(selectedSlideIndex, { html: event.target.value })} /></label>
                      ) : (
                        <label className="live-edit-field">Slide content<textarea rows={3} value={activeSlide.body || ""} onChange={(event) => updateSlide(selectedSlideIndex, { body: event.target.value })} /></label>
                      )}
                      {editorMode === "edit" && activeSlide.type === "examples" && (
                        <label className="live-edit-field">Examples (one per line)<textarea rows={3} value={(activeSlide.examples || []).join("\n")} onChange={(event) => updateSlide(selectedSlideIndex, { examples: event.target.value.split(/\r?\n/).filter((item) => item.trim()) })} /></label>
                      )}
                      {editorMode === "edit" && (
                        <>
                          <label className="live-edit-field">Image URL<input value={activeSlide.imageUrl || ""} onChange={(event) => updateSlide(selectedSlideIndex, { imageUrl: event.target.value })} placeholder="https://…" /></label>
                          <label className="live-edit-field">Teacher notes<textarea rows={2} value={activeSlide.speakerNotes || ""} onChange={(event) => updateSlide(selectedSlideIndex, { speakerNotes: event.target.value })} /></label>
                        </>
                      )}
                      {activeSlide.question && (
                        <div className="live-preview-question-editor">
                          {editorMode === "edit" && (
                            <label className="live-edit-field">Question type
                              <select value={activeSlide.question.kind} onChange={(event) => changeQuestionKind(selectedSlideIndex, event.target.value)}>
                                <option value="mcq">Multiple choice</option>
                                <option value="tf">True or false</option>
                              </select>
                            </label>
                          )}
                          <label className="live-edit-field">Student question<input value={activeSlide.question.prompt} onChange={(event) => updateQuestion(selectedSlideIndex, { prompt: event.target.value })} /></label>
                          {editorMode === "edit" && (
                            <>
                              {activeSlide.question.options.map((option, optionIndex) => (
                                <div className="live-option-editor" key={option.id}>
                                  <label className="live-edit-field">Option {option.id.toUpperCase()}
                                    <input value={option.text} onChange={(event) => updateQuestion(selectedSlideIndex, { options: activeSlide.question.options.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item) })} />
                                  </label>
                                  {activeSlide.question.kind === "mcq" && activeSlide.question.options.length > 2 && <button type="button" className="live-remove-option" onClick={() => removeQuestionOption(selectedSlideIndex, option.id)}>Remove option</button>}
                                </div>
                              ))}
                              {activeSlide.question.kind === "mcq" && activeSlide.question.options.length < 6 && <button type="button" className="live-text-button live-add-option" onClick={() => addQuestionOption(selectedSlideIndex)}><HiOutlinePlus /> Add answer option</button>}
                              <label className="live-edit-field">Explanation<textarea rows={2} value={activeSlide.question.explanation || ""} onChange={(event) => updateQuestion(selectedSlideIndex, { explanation: event.target.value })} /></label>
                            </>
                          )}
                          <label className="live-edit-field">Correct answer<select value={activeSlide.question.correctOptionId} onChange={(event) => updateQuestion(selectedSlideIndex, { correctOptionId: event.target.value })}>{activeSlide.question.options.map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}</select></label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="live-preview-note">Slide design, question answers, and explanation are stored in the lesson; answer keys stay hidden from students until the teacher reveals results.</div>
              </div>
            )}
            <footer className="live-import-footer">
              <button className="live-secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button className="live-primary-button" onClick={saveImportedLesson} disabled={saving || (editorMode === "create" && (!selectedFile || !form.classId || !form.subjectId)) || form.slides.length === 0 || !form.title.trim()}>{saving ? "Saving…" : editorMode === "edit" ? "Update lesson" : "Save lesson"}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default LiveLessonsPage;
