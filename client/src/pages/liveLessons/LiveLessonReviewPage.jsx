import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowLeft,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlinePause,
  HiOutlinePlay,
} from "react-icons/hi2";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../../config/api";
import { selectUser } from "../../store/slices/authSlice";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
import LiveSessionMarkSheet from "../../components/liveLessons/LiveSessionMarkSheet";
import { liveMarkStateLabel, liveQuestionKindLabel } from "../../utils/liveLessonMarkSheet";
import {
  buildClassEngagementChartData,
  buildStudentEngagementChartData,
} from "./liveLessonEngagementCharts";
import "./LiveLessonReviewPage.css";

const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthRange = () => {
  const today = new Date();
  return {
    from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toDateInput(today),
  };
};

const pdfResponseError = async (data, fallback) => {
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const payload = JSON.parse(text);
      return payload.message || fallback;
    } catch {
      return text.slice(0, 300) || fallback;
    }
  }
  return data?.message || fallback;
};

const assertPdfBlob = async (blob) => {
  const signature = await blob.slice(0, 5).text();
  if (signature !== "%PDF-") {
    throw new Error(await pdfResponseError(blob, "The server returned an invalid PDF file."));
  }
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const answerResultLabel = (answer) => (
  answer.status === "answered"
    ? liveMarkStateLabel(answer.result)
    // `pending` on a question that is still open means nobody has answered it yet, not an answer
    // waiting for a mark.
    : answer.status === "pending" ? "Not answered yet" : answer.status.replace(/_/g, " ")
);

const answerMarksLabel = (answer) => (
  answer.marks == null
    ? "—"
    : `${answer.marks}${answer.maxMarks == null ? "" : ` / ${answer.maxMarks}`}`
);

const LiveLessonReviewPage = ({ mode }) => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [report, setReport] = useState(null);
  const [replay, setReplay] = useState(null);
  const [reportTab, setReportTab] = useState("overview");
  const [visitedReportTabs, setVisitedReportTabs] = useState({});
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [reportStudentId, setReportStudentId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [performanceStudentTrend, setPerformanceStudentTrend] = useState([]);
  const [performanceStudentTrendLoading, setPerformanceStudentTrendLoading] = useState(false);
  const [performanceStudentTrendError, setPerformanceStudentTrendError] = useState("");
  const [engagementGranularity, setEngagementGranularity] = useState("lesson");
  const [engagementScope, setEngagementScope] = useState("class");
  const [engagementStudentSelection, setEngagementStudentSelection] = useState("");
  const [performanceError, setPerformanceError] = useState("");
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceExporting, setPerformanceExporting] = useState(false);
  const [performancePreset, setPerformancePreset] = useState("month");
  const [performanceRange, setPerformanceRange] = useState(getMonthRange);
  const [performanceStudentIds, setPerformanceStudentIds] = useState([]);
  const [reportExporting, setReportExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [gradeSubjects, setGradeSubjects] = useState([]);
  const [gradeSubjectId, setGradeSubjectId] = useState("");
  const [gradeMaxMarks, setGradeMaxMarks] = useState("10");
  const [behaviorDeductionPerIncident, setBehaviorDeductionPerIncident] = useState("0");
  const [gradePreview, setGradePreview] = useState(null);
  const [gradeError, setGradeError] = useState("");
  const [gradeLoading, setGradeLoading] = useState(false);
  const [gradeSaving, setGradeSaving] = useState(false);
  const isStudentReplay = mode === "replay" && (replay?.viewerRole === "student" || user?.role === "student");
  const releasedMarks = (replay?.myResults || []).filter((result) => result.released);
  const lessonsBackPath = user?.role === "student" ? "/portal/live-lessons/join" : "/portal/live-lessons";

  useEffect(() => {
    let active = true;
    const endpoint = mode === "report" ? "report" : "replay";
    api.get(`/live/sessions/${sessionId}/${endpoint}`)
      .then((response) => {
        if (!active) return;
        if (mode === "report") setReport(response.data?.data);
        else setReplay(response.data?.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load this session review.");
      });
    return () => { active = false; };
  }, [sessionId, mode]);

  useEffect(() => {
    setReportTab("overview");
    setVisitedReportTabs({});
  }, [sessionId, mode]);

  useEffect(() => {
    if (mode !== "report" || report?.session?.status !== "live") return undefined;
    let active = true;
    const timer = window.setInterval(() => {
      api.get(`/live/sessions/${sessionId}/report`)
        .then((response) => {
          if (active) setReport(response.data?.data);
        })
        .catch((requestError) => {
          if (active) setError(requestError.response?.data?.message || "Could not refresh the live report.");
        });
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode, report?.session?.status, sessionId]);

  useEffect(() => {
    if (mode !== "report" || report?.session?.status !== "ended" || !visitedReportTabs.gradebook) return undefined;
    let active = true;
    api.get(`/live/sessions/${sessionId}/gradebook-preview`)
      .then((response) => {
        if (!active) return;
        const subjects = response.data?.data?.subjects || [];
        setGradeSubjects(subjects);
        const nameMatches = subjects.filter((subject) => (
          subject.name?.trim().toLowerCase() === report.session.subject?.trim().toLowerCase()
        ));
        const matchingSubject = subjects.find((subject) => subject._id === report.session.subjectId)
          || (!report.session.subjectId && nameMatches.length === 1 ? nameMatches[0] : null);
        if (matchingSubject) {
          setGradeSubjectId(matchingSubject._id);
          setGradeMaxMarks(String(matchingSubject.dailyMaxMarks || 10));
        }
      })
      .catch((requestError) => {
        if (active) setGradeError(requestError.response?.data?.message || "Could not load gradebook options for this session.");
      });
    return () => { active = false; };
  }, [mode, report?.session?.status, report?.session?.subject, report?.session?.subjectId, sessionId, visitedReportTabs.gradebook]);

  useEffect(() => {
    if (mode !== "report" || report?.session?.status !== "ended" || !visitedReportTabs.gradebook || !gradeSubjectId) {
      setGradePreview(null);
      return undefined;
    }
    let active = true;
    setGradeLoading(true);
    setGradeError("");
    const params = new URLSearchParams({
      subjectId: gradeSubjectId,
      maxMarks: gradeMaxMarks,
      behaviorDeduction: behaviorDeductionPerIncident,
    });
    api.get(`/live/sessions/${sessionId}/gradebook-preview?${params.toString()}`)
      .then((response) => {
        if (active) setGradePreview(response.data?.data?.preview || null);
      })
      .catch((requestError) => {
        if (active) {
          setGradePreview(null);
          setGradeError(requestError.response?.data?.message || "Could not preview live session grades.");
        }
      })
      .finally(() => {
        if (active) setGradeLoading(false);
      });
    return () => { active = false; };
  }, [mode, report?.session?.status, gradeSubjectId, gradeMaxMarks, behaviorDeductionPerIncident, sessionId, visitedReportTabs.gradebook]);

  useEffect(() => {
    const classId = report?.session?.class?._id || report?.session?.class;
    if (mode !== "report" || report?.session?.status !== "ended" || !visitedReportTabs.trends
      || !classId || !performanceRange.from || !performanceRange.to) {
      setPerformance(null);
      setPerformanceLoading(false);
      return undefined;
    }
    let active = true;
    const params = new URLSearchParams({
      classId: String(classId),
      dateFrom: performanceRange.from,
      dateTo: performanceRange.to,
    });
    setPerformance(null);
    setPerformanceLoading(true);
    setPerformanceError("");
    api.get(`/live/sessions/performance?${params.toString()}`)
      .then((response) => {
        if (active) setPerformance(response.data?.data || null);
      })
      .catch((requestError) => {
        if (active) {
          setPerformance(null);
          setPerformanceError(requestError.response?.data?.message || "Could not load class performance for this date range.");
        }
      })
      .finally(() => {
        if (active) setPerformanceLoading(false);
      });
    return () => { active = false; };
  }, [mode, report?.session?.status, report?.session?.class, performanceRange.from, performanceRange.to, visitedReportTabs.trends]);

  const refreshReport = async () => {
    const response = await api.get(`/live/sessions/${sessionId}/report`);
    setReport(response.data?.data);
  };

  const saveSessionGrades = async () => {
    if (!gradePreview || gradePreview.linkedGradeCount) return;
    setGradeSaving(true);
    setGradeError("");
    try {
      const response = await api.post(`/live/sessions/${sessionId}/gradebook`, {
        subjectId: gradeSubjectId,
        maxMarks: Number(gradeMaxMarks),
        behaviorDeductionPerIncident: Number(behaviorDeductionPerIncident),
        students: gradePreview.students.map((student) => ({
          studentId: student.studentId,
          marks: Number(student.marks),
        })),
      });
      setGradePreview((current) => current ? { ...current, linkedGradeCount: response.data?.data?.count || current.students.length } : current);
    } catch (requestError) {
      setGradeError(requestError.response?.data?.message || "Could not add these session grades.");
    } finally {
      setGradeSaving(false);
    }
  };

  const updatePreviewMark = (studentId, value) => {
    const marks = value === "" ? "" : Number(value);
    setGradePreview((current) => current ? ({
      ...current,
      students: current.students.map((student) => (
        student.studentId === studentId ? { ...student, marks } : student
      )),
    }) : current);
  };

  const selectedReportStudent = report?.perStudent?.find(
    (student) => student.studentId === reportStudentId,
  ) || report?.perStudent?.[0] || null;
  const performanceStudents = performance?.students || [];
  const engagementStudentId = performanceStudents.some(
    (student) => student.studentId === engagementStudentSelection,
  ) ? engagementStudentSelection : performanceStudents[0]?.studentId || "";
  const engagementStudent = performanceStudents.find(
    (student) => student.studentId === engagementStudentId,
  );
  const engagementChartData = engagementScope === "student"
    ? buildStudentEngagementChartData(performanceStudentTrend, engagementGranularity)
    : buildClassEngagementChartData(performance?.sessions || [], engagementGranularity);
  const availableGradeSubjects = report?.session?.subjectId
    ? gradeSubjects.filter((subject) => subject._id === report.session.subjectId)
    : gradeSubjects;

  const perQuestion = report?.perQuestion || [];
  const perStudent = report?.perStudent || [];
  const rosterCount = report?.summary?.rosterCount || 0;
  const joinedCount = report?.summary?.joinedCount || 0;
  const presentedQuestionCount = report?.summary?.presentedQuestionCount || 0;
  const attendanceRate = rosterCount ? Math.round((joinedCount / rosterCount) * 100) : 0;
  const participatingStudents = perStudent.filter((student) => student.answered > 0).length;
  const answerCompletionRate = rosterCount && presentedQuestionCount
    ? Math.round(((report?.summary?.submittedAnswers || 0) / (rosterCount * presentedQuestionCount)) * 100)
    : 0;
  // Accuracy needs a verdict behind it: answers waiting for a mark are left out of both sides.
  const markedVerdicts = perQuestion.reduce(
    (total, question) => total + Math.max(0, (question.answered || 0) - (question.pending || 0)),
    0,
  );
  const earnedCredit = perQuestion.reduce(
    (total, question) => total
      + (question.percentCorrect || 0) * Math.max(0, (question.answered || 0) - (question.pending || 0)),
    0,
  );
  const markedAccuracyRate = markedVerdicts ? Math.round(earnedCredit / markedVerdicts) : null;
  const questionsAwaitingMarks = perQuestion.filter((question) => question.pending > 0).length;
  const totalAwayMinutes = Math.round(
    perStudent.reduce((total, student) => total + (student.totalAwaySeconds || 0), 0) / 60,
  );
  const reportTabs = [
    { id: "overview", label: "Overview" },
    { id: "questions", label: "Questions", count: perQuestion.length },
    { id: "students", label: "Students", count: perStudent.length },
    ...(report?.session?.status === "ended"
      ? [
        { id: "trends", label: "Class trends" },
        { id: "gradebook", label: "Grades" },
      ]
      : []),
  ];
  // Each heavy panel loads the first time it is opened and then keeps its state, so switching tabs
  // never throws away unsaved marking or grade edits.
  const openReportTab = (tab) => {
    setReportTab(tab);
    if (tab === "overview" || tab === "questions" || tab === "students") return;
    setVisitedReportTabs((current) => (current[tab] ? current : { ...current, [tab]: true }));
  };

  useEffect(() => {
    const classId = report?.session?.class?._id || report?.session?.class;
    if (mode !== "report" || report?.session?.status !== "ended" || !visitedReportTabs.trends
      || !classId || !performanceRange.from || !performanceRange.to || !engagementStudentId) {
      setPerformanceStudentTrend([]);
      setPerformanceStudentTrendLoading(false);
      return undefined;
    }
    let active = true;
    const params = new URLSearchParams({
      classId: String(classId),
      dateFrom: performanceRange.from,
      dateTo: performanceRange.to,
      studentId: engagementStudentId,
    });
    setPerformanceStudentTrend([]);
    setPerformanceStudentTrendLoading(true);
    setPerformanceStudentTrendError("");
    api.get(`/live/sessions/performance?${params.toString()}`)
      .then((response) => {
        if (active) setPerformanceStudentTrend(response.data?.data?.studentSessionMetrics || []);
      })
      .catch((requestError) => {
        if (active) {
          setPerformanceStudentTrend([]);
          setPerformanceStudentTrendError(requestError.response?.data?.message || "Could not load this student's engagement trend.");
        }
      })
      .finally(() => {
        if (active) setPerformanceStudentTrendLoading(false);
      });
    return () => { active = false; };
  }, [mode, report?.session?.status, report?.session?.class, performanceRange.from, performanceRange.to, engagementStudentId, visitedReportTabs.trends]);

  const setPerformancePeriod = (preset) => {
    setPerformancePreset(preset);
    if (preset === "custom") return;
    const today = new Date();
    const start = preset === "week"
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
      : new Date(today.getFullYear(), today.getMonth(), 1);
    setPerformanceRange({ from: toDateInput(start), to: toDateInput(today) });
  };

  const toggleSessionStudent = (studentId) => {
    setSelectedStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  };

  const togglePerformanceStudent = (studentId) => {
    setPerformanceStudentIds((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  };

  const downloadSessionPdf = async (studentIds = []) => {
    if (!report) return;
    setReportExporting(true);
    setExportError("");
    try {
      const response = await api.post(`/live/sessions/${sessionId}/report/export.pdf`, {
        studentIds,
      }, { responseType: "blob" });
      await assertPdfBlob(response.data);
      const scope = studentIds.length === 1 ? "student" : studentIds.length ? "students" : "class";
      downloadBlob(response.data, `live-session-${scope}-report.pdf`);
    } catch (requestError) {
      setExportError(await pdfResponseError(requestError.response?.data, requestError.message || "Could not export the session report PDF."));
    } finally {
      setReportExporting(false);
    }
  };

  const downloadPerformancePdf = async (studentIds = []) => {
    if (!performance) return;
    setPerformanceExporting(true);
    setPerformanceError("");
    try {
      const params = new URLSearchParams({
        classId: performance.class.id,
        dateFrom: performance.dateFrom,
        dateTo: performance.dateTo,
      });
      if (studentIds.length) params.set("studentIds", studentIds.join(","));
      const response = await api.get(`/live/sessions/performance/export.pdf?${params.toString()}`, {
        responseType: "blob",
      });
      await assertPdfBlob(response.data);
      const scope = studentIds.length === 1 ? "student" : studentIds.length ? "students" : "class";
      downloadBlob(response.data, `class-performance-${scope}-${performance.dateFrom}-to-${performance.dateTo}.pdf`);
    } catch (requestError) {
      setPerformanceError(await pdfResponseError(requestError.response?.data, requestError.message || "Could not export the class performance PDF."));
    } finally {
      setPerformanceExporting(false);
    }
  };

  const durationSeconds = Math.max(1, Math.ceil((replay?.session?.durationMs || 1000) / 1000));
  useEffect(() => {
    if (!playing || !replay) return undefined;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= durationSeconds) {
          setPlaying(false);
          return durationSeconds;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, replay, durationSeconds]);

  const replayState = useMemo(() => {
    if (!replay) return null;
    const targetMs = seconds * 1000;
    let currentSlideIndex = 0;
    let activeSlideOffsetMs = 0;
    let slideHidden = false;
    let questionOpen = false;
    let paused = false;
    const revealed = new Set();
    const answers = [];
    let presenceEvents = [];
    for (const event of replay.events || []) {
      if (event.offsetMs > targetMs) break;
      if (event.type === "slide:changed") {
        currentSlideIndex = event.payload?.index ?? currentSlideIndex;
        activeSlideOffsetMs = event.offsetMs;
        slideHidden = false;
      } else if (event.type === "slide:hidden") {
        slideHidden = Boolean(event.payload?.hidden);
      } else if (event.type === "question:opened") {
        questionOpen = true;
      } else if (event.type === "question:closed") {
        questionOpen = false;
      } else if (event.type === "session:paused") {
        paused = true;
        questionOpen = false;
      } else if (event.type === "session:resumed") {
        paused = false;
      } else if (event.type === "results:revealed") {
        revealed.add(String(event.payload?.slideId));
        questionOpen = false;
      } else if (event.type === "answer:submitted") {
        answers.push(event);
      } else if (event.type.startsWith("presence:")) {
        presenceEvents.push(event);
      }
    }
    const slide = replay.lesson?.slides?.[currentSlideIndex];
    return {
      currentSlideIndex,
      activeSlideOffsetMs,
      slideHidden,
      questionOpen,
      paused,
      slide: slide && revealed.has(String(slide._id)) ? slide : slide,
      revealed: Boolean(slide && revealed.has(String(slide._id))),
      answers: answers.filter((event) =>
        String(event.payload?.slideId) === String(slide?._id) &&
        (!studentFilter || String(event.payload?.studentId) === studentFilter),
      ),
      presenceEvents: presenceEvents.filter((event) => !studentFilter || String(event.actor?.userId || event.payload?.studentId) === studentFilter),
    };
  }, [replay, seconds, studentFilter]);
  const slideChangeEvents = (replay?.events || []).filter((event) => (
    event.type === "slide:changed" && Number.isInteger(event.payload?.index)
  ));
  const previousSlideEvent = [...slideChangeEvents].reverse().find((event) => (
    event.offsetMs < (replayState?.activeSlideOffsetMs ?? 0) &&
    event.payload.index !== replayState?.currentSlideIndex
  ));
  const nextSlideEvent = slideChangeEvents.find((event) => (
    event.offsetMs > (replayState?.activeSlideOffsetMs ?? 0) &&
    event.payload.index !== replayState?.currentSlideIndex
  ));

  if (error) return <main className="live-review-page"><div className="live-error-banner">{error}<button onClick={() => navigate(lessonsBackPath)}>Back to lessons</button></div></main>;
  if ((mode === "report" && !report) || (mode === "replay" && !replay)) return <main className="live-review-page"><div className="live-loading">Loading session review…</div></main>;

  return (
    <main className="live-review-page">
      <header className="live-review-header">
        <button className="live-session-back" onClick={() => navigate(lessonsBackPath)}><HiOutlineArrowLeft /> Back</button>
        <div><span className="live-eyebrow">{mode === "report" ? "SESSION REPORT" : "SESSION REPLAY"}</span><h1>{replay?.lesson?.title || report?.session?.title || "Live lesson review"}</h1></div>
      </header>
      {mode === "report" ? (
        <div className="live-report-layout">
          <section className="live-review-card live-report-class-section live-report-hero">
            <div className="live-report-heading">
              <div>
                <span className="live-report-kicker">{report.session.status === "live" ? "SESSION IN PROGRESS" : "SESSION REPORT"}</span>
                <h2>{report.session.title}</h2>
                <p className="live-report-context">
                  <span>{report.session.class?.name || "Class"}</span>
                  <span>{report.session.subject || "Subject not set"}</span>
                  <span>{report.session.startedAt ? new Date(report.session.startedAt).toLocaleString() : "Not started"}</span>
                </p>
                {report.session.status === "live" && <small>In progress · updates every 10 seconds · unanswered counts may change</small>}
              </div>
              <div className="live-report-export-actions no-print">
                <button className="live-session-primary" onClick={() => downloadSessionPdf()} disabled={reportExporting}>
                  <HiOutlineArrowDownTray /> {reportExporting ? "Preparing PDF…" : "Download class PDF"}
                </button>
              </div>
            </div>
            {exportError && <p className="live-report-export-error" role="alert">{exportError}</p>}
            <div className="live-report-summary">
              <div><strong>{rosterCount}</strong><span>Students</span></div>
              <div><strong>{joinedCount}</strong><span>Joined · {attendanceRate}%</span></div>
              <div><strong>{report.summary?.questionCount || 0}</strong><span>Questions</span></div>
              <div><strong>{report.summary?.submittedAnswers || 0}</strong><span>Answers submitted</span></div>
              <div className={report.summary?.awaitingMarks ? "live-report-summary-alert" : ""}>
                <strong>{report.summary?.awaitingMarks || 0}</strong><span>To mark</span>
              </div>
            </div>
          </section>
          <nav className="live-report-tabs no-print" aria-label="Report sections">
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`live-report-tab${reportTab === tab.id ? " active" : ""}`}
                aria-current={reportTab === tab.id ? "page" : undefined}
                onClick={() => openReportTab(tab.id)}
              >
                {tab.label}
                {tab.count != null && <span>{tab.count}</span>}
              </button>
            ))}
          </nav>
          <div className="live-report-panel" role="region" aria-label="Overview" hidden={reportTab !== "overview"}>
            <section className="live-review-card live-report-overview">
              <div className="live-report-section-heading">
                <div><h2>Lesson at a glance</h2><p>Participation and marking status for this session.</p></div>
              </div>
              <div className="live-report-overview-grid">
                <div className="live-report-overview-panel">
                  <h3>Participation</h3>
                  <dl className="live-report-figures">
                    <div><dt>Joined the lesson</dt><dd>{joinedCount} of {rosterCount}<span>{attendanceRate}%</span></dd></div>
                    <div>
                      <dt>Answered at least once</dt>
                      <dd>{participatingStudents} of {rosterCount}<span>{rosterCount ? Math.round((participatingStudents / rosterCount) * 100) : 0}%</span></dd>
                    </div>
                    <div>
                      <dt>Answers submitted</dt>
                      <dd>{report.summary?.submittedAnswers || 0} of {rosterCount * presentedQuestionCount}<span>{answerCompletionRate}%</span></dd>
                    </div>
                    <div><dt>Time away across the class</dt><dd>{totalAwayMinutes} min</dd></div>
                  </dl>
                </div>
                <div className="live-report-overview-panel">
                  <h3>Marking status</h3>
                  <p className="live-report-overview-note">
                    {report.summary?.awaitingMarks
                      ? `${report.summary.awaitingMarks} submitted ${report.summary.awaitingMarks === 1 ? "answer still needs" : "answers still need"} a mark across ${questionsAwaitingMarks} ${questionsAwaitingMarks === 1 ? "question" : "questions"}. A written answer is never counted as wrong while it waits.`
                      : "Every submitted answer has a verdict."}
                  </p>
                  <dl className="live-report-figures">
                    <div><dt>Answers to mark</dt><dd>{report.summary?.awaitingMarks || 0}</dd></div>
                    <div><dt>Accuracy of marked answers</dt><dd>{markedAccuracyRate == null ? "—" : `${markedAccuracyRate}%`}</dd></div>
                    <div><dt>Questions presented</dt><dd>{presentedQuestionCount} of {report.summary?.questionCount || 0}</dd></div>
                  </dl>
                  <div className="live-report-overview-actions no-print">
                    {report.summary?.awaitingMarks > 0 && (
                      <button className="live-session-primary" onClick={() => openReportTab("questions")}>Mark answers</button>
                    )}
                    <button className="live-session-secondary" onClick={() => openReportTab("students")}>Open student reports</button>
                  </div>
                </div>
              </div>
              <div className="live-report-section-heading live-report-overview-subheading">
                <div><h3>Question results</h3><p>How the class answered each check for understanding.</p></div>
                {perQuestion.length > 0 && (
                  <button className="live-session-secondary no-print" onClick={() => openReportTab("questions")}>Open question details</button>
                )}
              </div>
              {perQuestion.length ? (
                <div className="live-report-table-wrap"><table className="live-report-compact-table">
                  <thead><tr><th>#</th><th>Question</th><th>Answered</th><th>Correct</th><th>To mark</th><th>Accuracy</th></tr></thead>
                  <tbody>{perQuestion.map((question, index) => {
                    const marked = Math.max(0, question.answered - question.pending);
                    return (
                      <tr key={question.slideId}>
                        <td>{index + 1}</td>
                        <td>{question.title && <strong>{question.title}: </strong>}{question.prompt}</td>
                        <td>{question.answered} of {rosterCount}</td>
                        <td>{question.correct}</td>
                        <td>{question.pending}</td>
                        <td>{marked ? `${question.percentCorrect}%` : "—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              ) : <p>No question slides were included.</p>}
            </section>
          </div>
          {report.session.status === "ended" && (
            <div className="live-report-panel" role="region" aria-label="Class trends" hidden={reportTab !== "trends"}>
              <section className="live-review-card live-report-performance">
              <div className="live-report-section-heading">
                <div><h2>Class performance &amp; engagement</h2><p>Track attendance, participation, and accuracy across completed live lessons.</p></div>
                <div className="live-report-export-actions no-print">
                  <button className="live-session-primary" onClick={() => downloadPerformancePdf()} disabled={!performance || performanceExporting}>
                    <HiOutlineArrowDownTray /> {performanceExporting ? "Preparing PDF…" : "Download class PDF"}
                  </button>
                </div>
              </div>
              <div className="live-performance-controls no-print">
                <div className="live-performance-presets" role="group" aria-label="Performance report period">
                  <button className={performancePreset === "week" ? "active" : ""} onClick={() => setPerformancePeriod("week")}>Weekly</button>
                  <button className={performancePreset === "month" ? "active" : ""} onClick={() => setPerformancePeriod("month")}>Monthly</button>
                  <button className={performancePreset === "custom" ? "active" : ""} onClick={() => setPerformancePeriod("custom")}>Custom range</button>
                </div>
                <label>From<input type="date" value={performanceRange.from} onChange={(event) => {
                  setPerformancePreset("custom");
                  setPerformanceRange((current) => ({ ...current, from: event.target.value }));
                }} /></label>
                <label>To<input type="date" value={performanceRange.to} onChange={(event) => {
                  setPerformancePreset("custom");
                  setPerformanceRange((current) => ({ ...current, to: event.target.value }));
                }} /></label>
              </div>
              {performanceError && <p className="live-report-export-error" role="alert">{performanceError}</p>}
              {performanceLoading ? <p className="live-performance-status">Loading class performance…</p> : performance ? (
                <>
                  <div className="live-performance-summary">
                    <div><strong>{performance.summary.sessionCount}</strong><span>Sessions</span></div>
                    <div><strong>{performance.summary.averageAttendanceRate}%</strong><span>Attendance</span></div>
                    <div><strong>{performance.summary.participationRate}%</strong><span>Answered at least once</span></div>
                    <div><strong>{performance.summary.averageEngagementRate}%</strong><span>Answer completion</span></div>
                    <div><strong>{performance.summary.markedAnswers ? `${performance.summary.averageAccuracyRate}%` : "—"}</strong><span>Accuracy of marked answers</span></div>
                    <div><strong>{performance.summary.averageSessionMinutes}m</strong><span>Avg. session</span></div>
                  </div>
                  <div className="live-engagement-chart-controls no-print">
                    <label>Chart scope
                      <select value={engagementScope} onChange={(event) => setEngagementScope(event.target.value)}>
                        <option value="class">Class engagement</option>
                        <option value="student">Individual student</option>
                      </select>
                    </label>
                    {engagementScope === "student" && (
                      <label>Student
                        <select
                          value={engagementStudentId}
                          onChange={(event) => setEngagementStudentSelection(event.target.value)}
                          disabled={!performanceStudents.length}
                        >
                          {performanceStudents.map((student) => (
                            <option key={student.studentId} value={student.studentId}>{student.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>Show data by
                      <select value={engagementGranularity} onChange={(event) => setEngagementGranularity(event.target.value)}>
                        <option value="lesson">Each lesson</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                      </select>
                    </label>
                  </div>
                  <p className="live-performance-chart-note">
                    Engagement shows attendance and observable answering, not attention or learning. Accuracy remains separate in the summary and student table.
                  </p>
                  {engagementScope === "student" && performanceStudentTrendLoading
                    ? <p className="live-performance-status">Loading {engagementStudent?.name || "student"} engagement…</p>
                    : engagementScope === "student" && performanceStudentTrendError
                      ? <p className="live-report-export-error" role="alert">{performanceStudentTrendError}</p>
                      : engagementChartData.length ? (
                        <div className="live-performance-chart" aria-label={`${engagementScope === "student" ? `${engagementStudent?.name || "Student"}'s` : "Class"} engagement chart`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={engagementChartData} margin={{ top: 10, right: 18, left: -15, bottom: 5 }}>
                              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                                interval="preserveStartEnd"
                                axisLine={{ stroke: "var(--border-color)" }}
                                tickLine={{ stroke: "var(--border-color)" }}
                              />
                              <YAxis
                                domain={[0, 100]}
                                unit="%"
                                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                                axisLine={{ stroke: "var(--border-color)" }}
                                tickLine={{ stroke: "var(--border-color)" }}
                              />
                              <Tooltip
                                labelFormatter={(label, payload) => `${label}${payload?.[0]?.payload?.lessonCount > 1 ? ` · ${payload[0].payload.lessonCount} lessons` : ""}`}
                                formatter={(value, name, item) => {
                                  const metric = name === "Attendance" ? "attendance"
                                    : name === "Answered at least once" ? "participation" : "answerCompletion";
                                  const data = item.payload;
                                  return [`${value}% (${data[`${metric}Numerator`]}/${data[`${metric}Denominator`]})`, name];
                                }}
                                contentStyle={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                                labelStyle={{ color: "var(--text-primary)" }}
                                itemStyle={{ color: "var(--text-secondary)" }}
                              />
                              <Legend wrapperStyle={{ color: "var(--text-secondary)" }} />
                              <Bar dataKey="attendanceRate" name="Attendance" fill="#168078" maxBarSize={38} radius={[5, 5, 0, 0]} />
                              <Bar dataKey="participationRate" name="Answered at least once" fill="#ed9d37" maxBarSize={38} radius={[5, 5, 0, 0]} />
                              <Bar dataKey="answerCompletionRate" name="Answer completion" fill="#5576c5" maxBarSize={38} radius={[5, 5, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : <p className="live-performance-status">{engagementScope === "student"
                        ? "No rostered lessons for this student were found in this period."
                        : "No completed live lessons were found in this period."}</p>}
                  <div className="live-report-section-heading live-performance-student-heading">
                    <div><h3>Individual student performance</h3><p>Select one student for an individual report or several for a batch PDF.</p></div>
                    <button className="live-session-secondary no-print" onClick={() => downloadPerformancePdf(performanceStudentIds)} disabled={!performanceStudentIds.length || performanceStudentIds.length > 150 || performanceExporting}>
                      <HiOutlineArrowDownTray />
                      {performanceStudentIds.length === 1 ? "Download individual PDF" : `Download selected PDF (${performanceStudentIds.length})`}
                    </button>
                  </div>
                  <div className="live-report-table-wrap live-performance-student-table"><table>
                    <thead><tr><th>Select</th><th>Student</th><th>Sessions</th><th>Attendance</th><th>Answer completion</th><th>Accuracy</th><th>Answers</th></tr></thead>
                    <tbody>{performanceStudents.map((student) => <tr key={student.studentId}>
                      <td><input aria-label={`Select ${student.name} performance report`} type="checkbox" checked={performanceStudentIds.includes(student.studentId)} onChange={() => togglePerformanceStudent(student.studentId)} /></td>
                      <td>{student.name}</td><td>{student.sessions}</td><td>{student.attendanceRate}%</td>
                      <td>{student.engagementRate}%</td>
                      <td>{student.marked ? `${student.accuracyRate}%` : "Not marked yet"}</td>
                      <td>{student.answers}</td>
                    </tr>)}</tbody>
                  </table></div>
                  {performanceStudentIds.length > 150 && <p className="live-report-export-error">Batch PDF exports are limited to 150 students. Deselect some students.</p>}
                </>
              ) : <p className="live-performance-status">Choose a date range to view this class report.</p>}
              </section>
            </div>
          )}
          <div className="live-report-panel" role="region" aria-label="Questions" hidden={reportTab !== "questions"}>
              <section className="live-review-card live-report-class-section">
                <div className="live-report-section-heading">
                  <div><h2>Question results</h2><p>See how the class responded to each check for understanding.</p></div>
                  <span className="live-report-count">{perQuestion.length} questions</span>
                </div>
                {perQuestion.length ? (
                  <div className="live-report-question-grid">
                    {perQuestion.map((question, index) => {
                      const marked = question.answered - question.pending;
                      return (
                        <article className="live-question-result" key={question.slideId}>
                          <div className="live-question-result-heading">
                            <span className="live-question-number">
                              Question {index + 1} · {liveQuestionKindLabel(question.kind)}
                            </span>
                            <span className={`live-question-state ${question.closed ? "closed" : question.opened ? "opened" : ""}`}>
                              {question.closed
                                ? "Closed"
                                : question.awaiting
                                  ? "Waiting for answers"
                                  : question.pending
                                    ? "Some answers to mark"
                                    : question.opened ? "Answered" : "Not opened"}
                            </span>
                          </div>
                          {question.title && <span className="live-question-title">{question.title}</span>}
                          <h3>{question.prompt}</h3>
                          <div className="live-question-metrics">
                            <div><strong>{question.answered}</strong><span>Answered</span></div>
                            <div><strong>{question.correct}</strong><span>Correct</span></div>
                            <div><strong>{question.partial + question.wrong}</strong><span>Not correct</span></div>
                            <div><strong>{question.pending}</strong><span>To mark</span></div>
                            <div>
                              <strong>{question.closed ? question.unanswered : question.opened ? question.awaiting : "—"}</strong>
                              <span>{question.closed ? "Unanswered" : "Not answered yet"}</span>
                            </div>
                          </div>
                          {marked > 0 && (
                            <div className="live-question-accuracy" aria-label={`${question.percentCorrect}% of the marked answers earned full credit`}>
                              <span style={{ width: `${question.percentCorrect}%` }} />
                            </div>
                          )}
                          {(question.options || []).length ? (
                            <div className="live-question-options">
                              {question.options.map((option) => {
                                const count = question.perOption?.[option.id] || 0;
                                const percentage = question.answered ? Math.round((count / question.answered) * 100) : 0;
                                return (
                                  <div className={`live-question-option${option.correct ? " correct" : ""}`} key={option.id}>
                                    <div><span>{option.text}{option.correct && <b>Correct answer</b>}</span><strong>{count}</strong></div>
                                    <span className="live-option-bar"><i style={{ width: `${percentage}%` }} /></span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : question.key && (
                            <p className="live-question-key"><strong>Answer key</strong><span>{question.key}</span></p>
                          )}
                          {(question.levels || []).length > 0 && (
                            <div className="live-question-levels">
                              {question.levels.map((level) => (
                                <div className="live-question-level" key={level.level}>
                                  <strong>{level.level}</strong>
                                  <span>{level.answered} answered</span>
                                  <span>{level.pending ? `${level.pending} to mark` : "all marked"}</span>
                                  <span>{level.percentCorrect}% of marked</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="live-question-result-footer">
                            <span>
                              {marked
                                ? `${question.percentCorrect}% correct${question.pending ? ` of ${marked} marked` : ""}`
                                : question.pending ? "Waiting to be marked" : "No answers yet"}
                            </span>
                            <span>{question.answered} of {rosterCount} responses</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : <p>No question slides were included.</p>}
              </section>
              {perQuestion.some((question) => question.answers?.length) && (
                <section className="live-review-card live-report-class-section">
                  <div className="live-report-section-heading">
                    <div>
                      <h2>Mark the answers</h2>
                      <p>
                        A written answer has no key, so it stays in the queue until you mark it. Leaving a mark
                        empty sends the answer back to the queue instead of scoring it zero, and nothing reaches
                        the student until you share it.
                      </p>
                    </div>
                    <span className="live-report-count">{report.summary?.awaitingMarks || 0} to mark</span>
                  </div>
                  <LiveSessionMarkSheet sessionId={sessionId} questions={report.perQuestion} onSaved={refreshReport} />
                </section>
              )}
            </div>
          <div className="live-report-panel" role="region" aria-label="Students" hidden={reportTab !== "students"}>
              <section className="live-review-card live-report-class-section">
                <div className="live-report-section-heading">
                  <div><h2>Student participation</h2><p>Choose a student to open their answers below.</p></div>
                  <div className="live-report-export-actions no-print">
                    <span className="live-report-count">{perStudent.length} students</span>
                    <button className="live-session-secondary" onClick={() => downloadSessionPdf(selectedStudentIds)} disabled={!selectedStudentIds.length || selectedStudentIds.length > 150 || reportExporting}>
                      <HiOutlineArrowDownTray /> Download selected PDF ({selectedStudentIds.length})
                    </button>
                  </div>
                </div>
                {selectedStudentIds.length > 150 && <p className="live-report-export-error">Batch PDF exports are limited to 150 students. Deselect some students.</p>}
                <div className="live-report-table-wrap"><table><thead><tr><th>Select</th><th>Student</th><th>Answered</th><th>Correct</th><th>Wrong</th><th>To mark</th><th>Score</th><th>Away</th></tr></thead><tbody>
                  {perStudent.map((student) => (
                    <tr key={student.studentId} className={`live-report-student-row${selectedReportStudent?.studentId === student.studentId ? " selected" : ""}`}>
                      <td><input aria-label={`Select ${student.name} session report`} type="checkbox" checked={selectedStudentIds.includes(student.studentId)} onChange={() => toggleSessionStudent(student.studentId)} /></td>
                      <td><button className="live-report-student-link" aria-pressed={selectedReportStudent?.studentId === student.studentId} onClick={() => setReportStudentId(student.studentId)}>{student.name}</button></td>
                      <td>{student.answered}</td><td>{student.correct}</td><td>{student.wrong}</td><td>{student.toMark}</td><td>{student.scorePercent}%</td><td>{student.totalAwaySeconds}s</td>
                    </tr>
                  ))}
                </tbody></table></div>
              </section>
              <section className="live-review-card live-report-student-section">
                <div className="live-report-heading">
                  <div>
                    <h2>Student report</h2>
                    <p>Every question, the student’s answer, and the mark behind it.</p>
                    <label className="no-print">Student
                      <select value={selectedReportStudent?.studentId || ""} onChange={(event) => setReportStudentId(event.target.value)}>
                        {perStudent.map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="live-report-export-actions no-print">
                    <button className="live-session-primary" onClick={() => selectedReportStudent && downloadSessionPdf([selectedReportStudent.studentId])} disabled={!selectedReportStudent || reportExporting}>
                      <HiOutlineArrowDownTray /> {reportExporting ? "Preparing PDF…" : "Download student PDF"}
                    </button>
                  </div>
                </div>
                {selectedReportStudent ? (
                  <>
                    <div className="live-student-report-summary">
                      <span>{selectedReportStudent.joined ? `Joined ${selectedReportStudent.joinedAt ? new Date(selectedReportStudent.joinedAt).toLocaleTimeString() : ""}` : "Did not join"}</span>
                      <span><strong>{selectedReportStudent.answered}</strong> answered</span>
                      <span><strong>{selectedReportStudent.correct}</strong> correct</span>
                      <span><strong>{selectedReportStudent.wrong}</strong> incorrect</span>
                      <span><strong>{selectedReportStudent.toMark}</strong> to mark</span>
                      <span><strong>{selectedReportStudent.coveragePercent}%</strong> coverage</span>
                      <span><strong>{selectedReportStudent.totalAwaySeconds}s</strong> away</span>
                    </div>
                    <div className="live-report-table-wrap">
                      <table><thead><tr><th>#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Result</th><th>Mark</th><th>Shared</th><th>Submitted</th></tr></thead>
                        <tbody>{selectedReportStudent.answerDetails.map((answer) => <tr key={answer.slideId}>
                          <td>{answer.questionNumber}</td>
                          <td>
                            {answer.title && <strong>{answer.title}: </strong>}{answer.prompt}
                            {answer.level && <em className="live-answer-level">{answer.level}</em>}
                          </td>
                          <td>{answer.selectedAnswer || "—"}</td>
                          <td>{answer.correctAnswer}</td>
                          <td>{answerResultLabel(answer)}</td>
                          <td>{answerMarksLabel(answer)}</td>
                          <td>{answer.released ? "Yes" : "No"}</td>
                          <td>{answer.submittedAt ? new Date(answer.submittedAt).toLocaleTimeString() : "—"}</td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                    <details className="live-report-presence-details">
                      <summary>Lesson tab visibility events <span>{selectedReportStudent.presenceEvents.filter((event) => event.reason === "visibility_hidden" || event.reason === "visibility_visible").length}</span></summary>
                      <p className="live-report-caveat">These are browser visibility signals only. They do not establish why a student left the lesson tab or indicate misconduct.</p>
                      {selectedReportStudent.presenceEvents.filter((event) => event.reason === "visibility_hidden" || event.reason === "visibility_visible").length ? (
                        <ul className="live-report-presence-list">
                          {selectedReportStudent.presenceEvents
                            .filter((event) => event.reason === "visibility_hidden" || event.reason === "visibility_visible")
                            .map((event, index) => <li key={`${event.at}-${index}`}>{event.reason === "visibility_hidden" ? "Lesson tab became hidden" : "Lesson tab became visible"} · {new Date(event.at).toLocaleString()}</li>)}
                        </ul>
                      ) : <p>No lesson tab visibility events were recorded.</p>}
                    </details>
                  </>
                ) : <p>No students were included in this session roster.</p>}
              </section>
            </div>
          {report.session.status === "ended" && (
            <div className="live-report-panel" role="region" aria-label="Grades" hidden={reportTab !== "gradebook"}>
              <section className="live-review-card live-session-gradebook no-print">
              <div className="live-report-heading">
                <div>
                  <h2>Add session results to classwork gradebook</h2>
                  <p>Review every proposed mark before saving. Existing gradebook entries are never overwritten.</p>
                </div>
              </div>
              <div className="live-gradebook-controls">
                <label>Class subject
                  <select value={gradeSubjectId} onChange={(event) => {
                    const subject = gradeSubjects.find((option) => option._id === event.target.value);
                    setGradeSubjectId(event.target.value);
                    if (subject) setGradeMaxMarks(String(subject.dailyMaxMarks || 10));
                  }}>
                    <option value="">Choose a class subject…</option>
                    {availableGradeSubjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}{subject.code ? ` (${subject.code})` : ""}</option>)}
                  </select>
                </label>
                <label>Maximum marks
                  <input type="number" min="1" max="1000" step="0.5" value={gradeMaxMarks} onChange={(event) => setGradeMaxMarks(event.target.value)} />
                </label>
                <label>Behavior deduction per hidden-tab event
                  <select value={behaviorDeductionPerIncident} onChange={(event) => setBehaviorDeductionPerIncident(event.target.value)}>
                    <option value="0">Off</option>
                    <option value="0.5">−0.5 point</option>
                    <option value="1">−1 point</option>
                  </select>
                </label>
              </div>
              <p className="live-gradebook-caveat">A hidden-tab event is a browser visibility signal, not proof of misconduct. Only tab visibility events recorded by this version are included; ordinary blur, network loss, and disconnects are not counted.</p>
              {gradeError && <div className="live-error-banner" role="alert">{gradeError}</div>}
              {gradeLoading && <p className="live-gradebook-status">Calculating a reviewable grade preview…</p>}
              {gradePreview && (
                <>
                  <p className="live-gradebook-status">
                    {gradePreview.linkedGradeCount
                      ? "Gradebook entries already exist for this session."
                      : `${gradePreview.students.length} students · ${gradePreview.subject.name} · ${gradePreview.academicYear} · Semester ${gradePreview.semester}`}
                  </p>
                  <div className="live-report-table-wrap">
                    <table><thead><tr><th>Student</th><th>Answered</th><th>Correct</th><th>Hidden-tab events</th><th>Deduction</th><th>Proposed grade</th></tr></thead>
                      <tbody>{gradePreview.students.map((student) => (
                        <tr key={student.studentId}>
                          <td>{student.name}</td>
                          <td>{student.answered}/{student.questionCount}</td>
                          <td>{student.correct}/{student.questionCount}</td>
                          <td>{student.visibilityIncidents}</td>
                          <td>{gradePreview.behaviorDeductionPerIncident ? `${student.behaviorDeduction} points` : "Off"}</td>
                          <td><input className="live-grade-mark-input" aria-label={`Grade for ${student.name}`} type="number" min="0" max={gradePreview.maxMarks} step="0.01" value={student.marks} onChange={(event) => updatePreviewMark(student.studentId, event.target.value)} /> / {gradePreview.maxMarks}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <button className="live-session-secondary" onClick={saveSessionGrades} disabled={gradeSaving || gradeLoading || Boolean(gradePreview.linkedGradeCount) || !gradePreview.students.length || gradePreview.students.some((student) => student.marks === "" || !Number.isFinite(Number(student.marks)) || Number(student.marks) < 0 || Number(student.marks) > gradePreview.maxMarks)}>
                    {gradeSaving ? "Saving grades…" : gradePreview.linkedGradeCount ? "Already added to gradebook" : "Add reviewed grades to gradebook"}
                  </button>
                </>
              )}
              {!availableGradeSubjects.length && !gradeLoading && <p className="live-gradebook-status">{report.session.subjectId ? "The session’s recorded subject is no longer assigned to this class. Ask an administrator to review the class subject assignment." : "No class subjects are available for this session. Assign a subject to the class before adding grades."}</p>}
              </section>
            </div>
          )}
        </div>
      ) : (
        <section className="live-review-card live-replay-player">
          <div className="live-replay-topline"><div><h2>{isStudentReplay ? "Lesson replay" : "Recorded session"}</h2><span>{replay.session.startedAt ? new Date(replay.session.startedAt).toLocaleString() : "Session has not started"}</span></div>
            {!isStudentReplay && <label>Filter student<select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}><option value="">Everyone</option>{replay.students.map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}</select></label>}
          </div>
          <LiveLessonSlide slide={replayState?.slide} index={replayState?.currentSlideIndex || 0} total={replay.lesson?.slides?.length || 0} language={replay.lesson?.language} allowScripts hidden={replayState?.slideHidden}>
            {replayState?.slide?.question && (
              <section className="live-question-card live-replay-question">
                <div className="live-question-topline"><span>QUESTION</span><span>{replayState.revealed ? "Results revealed" : replayState.questionOpen ? "Answers were open" : "Question was closed"}</span></div>
                <h2>{replayState.slide.question.prompt}</h2>
                <div className="live-answer-options">
                  {replayState.slide.question.options.map((option) => {
                    const optionAnswers = replayState.answers.filter((event) => event.payload?.selectedOptionId === option.id);
                    return <div className="live-answer-option" key={option.id}><span>{option.id.toUpperCase()}</span>{option.text}{!isStudentReplay && <small>{optionAnswers.length} responses</small>}</div>;
                  })}
                </div>
              </section>
            )}
          </LiveLessonSlide>
          {replayState?.paused && <div className="live-replay-paused">The live session was paused at this point.</div>}
          {isStudentReplay && (
            <div className="live-replay-my-marks">
              <strong>Your marks</strong>
              {releasedMarks.length ? (
                <ul>
                  {releasedMarks.map((result) => (
                    <li key={result.slideId}>
                      <div>
                        <span>Question {result.questionNumber}{result.title ? ` · ${result.title}` : ""}</span>
                        <p>{result.prompt}</p>
                        {result.feedback && <em>{result.feedback}</em>}
                      </div>
                      <strong>
                        {result.marks}{result.maxMarks == null ? "" : ` / ${result.maxMarks}`}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : <p>Your teacher shares marks and comments here once they release them.</p>}
            </div>
          )}
          {!isStudentReplay && replayState?.slide?.question && (
            <>
              <div className="live-replay-answer-log"><strong>Answers recorded on this question</strong>
                {replayState.answers.map((event, index) => {
                  const student = replay.students.find((entry) => entry.studentId === String(event.payload?.studentId));
                  const option = replayState.slide.question.options.find((item) => item.id === event.payload?.selectedOptionId);
                  return <span key={`${event.seq}-${index}`}>{student?.name || "Student"} · {option?.text || "Answer"} · {event.payload?.isCorrect ? "correct" : "incorrect"}</span>;
                })}
                {!replayState.answers.length && <span>No responses yet at this point in the replay.</span>}
              </div>
            </>
          )}
          <div className="live-replay-controls">
            <button
              className="live-session-secondary"
              onClick={() => {
                setPlaying(false);
                setSeconds(Math.ceil(previousSlideEvent.offsetMs / 1000));
              }}
              disabled={!previousSlideEvent}
              aria-label="Go to previous slide"
            ><HiOutlineChevronLeft /> Previous</button>
            <button className="live-session-secondary" onClick={() => setPlaying((value) => !value)}>{playing ? <HiOutlinePause /> : <HiOutlinePlay />}{playing ? "Pause" : "Play"}</button>
            <span>{new Date((new Date(replay.session.startedAt || 0)).getTime() + seconds * 1000).toLocaleTimeString()}</span>
            <input type="range" min="0" max={durationSeconds} value={seconds} onChange={(event) => { setPlaying(false); setSeconds(Number(event.target.value)); }} aria-label="Seek replay timeline" />
            <span>{Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, "0")}</span>
            <button
              className="live-session-secondary"
              onClick={() => {
                setPlaying(false);
                setSeconds(Math.ceil(nextSlideEvent.offsetMs / 1000));
              }}
              disabled={!nextSlideEvent}
              aria-label="Go to next slide"
            >Next <HiOutlineChevronRight /></button>
          </div>
          <div className="live-replay-event-list"><strong>Lesson timeline</strong>
            {(replay.events || []).filter((event) => event.offsetMs <= seconds * 1000 && (!studentFilter || String(event.actor?.userId || event.payload?.studentId) === studentFilter)).slice(-8).map((event) => <span key={event.seq}>{Math.floor(event.offsetMs / 1000)}s · {event.type.replace(":", " ")}</span>)}
            {!(replay.events || []).some((event) => event.offsetMs <= seconds * 1000) && <span>Session has not started yet.</span>}
          </div>
        </section>
      )}
    </main>
  );
};

export default LiveLessonReviewPage;
