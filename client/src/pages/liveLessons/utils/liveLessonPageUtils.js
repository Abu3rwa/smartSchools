import api from "../../../config/api";
import {
  buildLiveQuestionPayload,
  prepareLiveQuestion,
} from "../../../utils/liveLessonQuestionDraft.js";
import { LIVE_LESSON_SAMPLE_CSV } from "../liveLessonCsvTemplate";

export const emptyForm = {
  title: "",
  description: "",
  subject: "",
  classId: "",
  subjectId: "",
  grade: "",
  language: "en",
  slides: [],
};
export const defaultListState = {
  view: "home",
  classId: "",
  subject: "",
  page: 1,
  pageSize: 25,
  folderId: "",
  search: "",
  order: "recent",
  dateFrom: "",
  dateTo: "",
  status: "",
};
const LIBRARY_VIEWS = ["home", "folder", "all", "unfiled", "search"];
const LIBRARY_ORDERS = ["teaching", "az", "recent"];

/**
 * The editor works on a complete question draft, so every input it shows has a value, and the kind's
 * unused fields are emptied at save instead of at every keystroke. A levelled slide imported from a
 * CSV names its group in words, because a group id only means something inside this class.
 */
export const toEditorSlide = (slide = {}) => ({
  ...slide,
  examples: slide.examples || [],
  question: slide.question ? prepareLiveQuestion(slide.question) : undefined,
  variants: (slide.variants || []).map((variant) => ({
    ...(variant.groupId ? { groupId: String(variant.groupId) } : {}),
    ...(variant.group ? { group: variant.group } : {}),
    question: prepareLiveQuestion(variant.question),
  })),
});

export const toStoredSlide = (slide = {}) => {
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

export const liveNumericRuleSummary = (rule = {}) => {
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
export const unlinkedLevelMessage = (slides = []) => {
  const index = slides.findIndex((entry) =>
    (entry.variants || []).some((variant) => !variant.groupId),
  );
  if (index === -1) return "";
  const variant = slides[index].variants.find((entry) => !entry.groupId);
  return `Slide ${index + 1} has a levelled question${variant.group ? ` for the group "${variant.group}"` : ""}, which this class does not have. Correct that group name in the CSV, or remove the levelled question.`;
};

export const normalizeListState = (saved = {}) => {
  const preferences = saved && typeof saved === "object" ? saved : {};
  return {
    view: LIBRARY_VIEWS.includes(preferences.view) ? preferences.view : "home",
    classId: typeof preferences.classId === "string" ? preferences.classId : "",
    subject: typeof preferences.subject === "string" ? preferences.subject : "",
    page:
      Number.isInteger(Number(preferences.page)) && Number(preferences.page) > 0
        ? Number(preferences.page)
        : 1,
    pageSize: [25, 50].includes(Number(preferences.pageSize))
      ? Number(preferences.pageSize)
      : 25,
    folderId: typeof preferences.folderId === "string" ? preferences.folderId : "",
    search: typeof preferences.search === "string" ? preferences.search : "",
    order: LIBRARY_ORDERS.includes(preferences.order)
      ? preferences.order
      : "recent",
    dateFrom:
      typeof preferences.dateFrom === "string" ? preferences.dateFrom : "",
    dateTo: typeof preferences.dateTo === "string" ? preferences.dateTo : "",
    status: ["waiting", "live", "ended"].includes(preferences.status)
      ? preferences.status
      : "",
  };
};

export const localDateTimeValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export const readListPreferences = (key) => {
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

export const downloadTemplate = () => {
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

export const downloadLessonCsv = async (lesson) => {
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

export const formatSessionDuration = (session) => {
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

export const getSessionDisplayDate = (session) =>
  session.scheduledAt && session.status === "waiting"
    ? session.scheduledAt
    : session.startedAt || session.createdAt;
