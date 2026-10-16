import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HiOutlineArrowDownTray, HiOutlineArrowLeft, HiOutlinePause, HiOutlinePlay } from "react-icons/hi2";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../../config/api";
import LiveLessonSlide from "../../components/liveLessons/LiveLessonSlide";
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

const LiveLessonReviewPage = ({ mode }) => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [replay, setReplay] = useState(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [reportStudentId, setReportStudentId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [performance, setPerformance] = useState(null);
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
    if (mode !== "report" || report?.session?.status !== "ended") return undefined;
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
  }, [mode, report?.session?.status, report?.session?.subject, report?.session?.subjectId, sessionId]);

  useEffect(() => {
    if (mode !== "report" || report?.session?.status !== "ended" || !gradeSubjectId) {
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
  }, [mode, report?.session?.status, gradeSubjectId, gradeMaxMarks, behaviorDeductionPerIncident, sessionId]);

  useEffect(() => {
    const classId = report?.session?.class?._id || report?.session?.class;
    if (mode !== "report" || report?.session?.status !== "ended" || !classId || !performanceRange.from || !performanceRange.to) {
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
  }, [mode, report?.session?.status, report?.session?.class, performanceRange.from, performanceRange.to]);

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
  const availableGradeSubjects = report?.session?.subjectId
    ? gradeSubjects.filter((subject) => subject._id === report.session.subjectId)
    : gradeSubjects;

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

  if (error) return <main className="live-review-page"><div className="live-error-banner">{error}<button onClick={() => navigate("/portal/live-lessons")}>Back to lessons</button></div></main>;
  if ((mode === "report" && !report) || (mode === "replay" && !replay)) return <main className="live-review-page"><div className="live-loading">Loading session review…</div></main>;

  return (
    <main className="live-review-page">
      <header className="live-review-header">
        <button className="live-session-back" onClick={() => navigate("/portal/live-lessons")}><HiOutlineArrowLeft /> Back</button>
        <div><span className="live-eyebrow">{mode === "report" ? "SESSION REPORT" : "SESSION REPLAY"}</span><h1>{replay?.lesson?.title || report?.session?.title || "Live lesson review"}</h1></div>
      </header>
      {mode === "report" ? (
        <div className="live-report-layout">
          <section className="live-review-card live-report-class-section">
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
              <div><strong>{report.summary?.rosterCount || 0}</strong><span>Students</span></div>
              <div><strong>{report.summary?.joinedCount || 0}</strong><span>Joined</span></div>
              <div><strong>{report.summary?.questionCount || 0}</strong><span>Questions</span></div>
              <div><strong>{report.summary?.submittedAnswers || 0}</strong><span>Answers submitted</span></div>
            </div>
          </section>
          {report.session.status === "ended" && (
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
                    <div><strong>{performance.summary.participationRate}%</strong><span>Students participating</span></div>
                    <div><strong>{performance.summary.averageEngagementRate}%</strong><span>Answer completion</span></div>
                    <div><strong>{performance.summary.averageAccuracyRate}%</strong><span>Accuracy</span></div>
                    <div><strong>{performance.summary.averageSessionMinutes}m</strong><span>Avg. session</span></div>
                  </div>
                  {performance.sessions.length ? (
                    <div className="live-performance-chart" aria-label="Class attendance, participation, and accuracy trend chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={performance.sessions} margin={{ top: 10, right: 18, left: -15, bottom: 5 }}>
                          <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            formatter={(value) => [`${value}%`]}
                            contentStyle={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                            labelStyle={{ color: "var(--text-primary)" }}
                            itemStyle={{ color: "var(--text-secondary)" }}
                          />
                          <Legend wrapperStyle={{ color: "var(--text-secondary)" }} />
                          <Line type="monotone" dataKey="attendanceRate" name="Attendance" stroke="#168078" strokeWidth={3} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="engagementRate" name="Participation" stroke="#ed9d37" strokeWidth={3} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="accuracyRate" name="Accuracy" stroke="#5576c5" strokeWidth={3} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="live-performance-status">No completed live lessons were found in this period.</p>}
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
                      <td>{student.engagementRate}%</td><td>{student.accuracyRate}%</td><td>{student.answers}</td>
                    </tr>)}</tbody>
                  </table></div>
                  {performanceStudentIds.length > 150 && <p className="live-report-export-error">Batch PDF exports are limited to 150 students. Deselect some students.</p>}
                </>
              ) : <p className="live-performance-status">Choose a date range to view this class report.</p>}
            </section>
          )}
          <section className="live-review-card live-report-class-section">
            <div className="live-report-section-heading">
              <div><h2>Question results</h2><p>See how the class responded to each check for understanding.</p></div>
              <span className="live-report-count">{(report.perQuestion || []).length} questions</span>
            </div>
            {(report.perQuestion || []).length ? (
              <div className="live-report-question-grid">
                {report.perQuestion.map((question, index) => (
                  <article className="live-question-result" key={question.slideId}>
                    <div className="live-question-result-heading">
                      <span className="live-question-number">Question {index + 1}</span>
                      <span className={`live-question-state ${question.closed ? "closed" : question.opened ? "opened" : ""}`}>
                        {question.closed ? "Closed" : question.opened ? question.pending ? "In progress" : "Answered" : "Not opened"}
                      </span>
                    </div>
                    {question.title && <span className="live-question-title">{question.title}</span>}
                    <h3>{question.prompt}</h3>
                    <div className="live-question-metrics">
                      <div><strong>{question.answered}</strong><span>Answered</span></div>
                      <div><strong>{question.correct}</strong><span>Correct</span></div>
                      <div><strong>{question.wrong}</strong><span>Incorrect</span></div>
                      <div><strong>{question.closed ? question.unanswered : question.opened ? question.pending : "—"}</strong><span>{question.closed ? "Unanswered" : question.opened ? "Pending" : "Remaining"}</span></div>
                    </div>
                    {question.answered > 0 && (
                      <div className="live-question-accuracy" aria-label={`${question.percentCorrect}% answered correctly`}>
                        <span style={{ width: `${question.percentCorrect}%` }} />
                      </div>
                    )}
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
                    <div className="live-question-result-footer">
                      <span>{question.answered ? `${question.percentCorrect}% correct` : "No answers yet"}</span>
                      <span>{question.answered} of {report.summary?.rosterCount || 0} responses</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p>No question slides were included.</p>}
          </section>
          <section className="live-review-card live-report-class-section">
            <div className="live-report-section-heading">
              <div><h2>Student participation</h2><p>Select a student to view their individual answers below.</p></div>
              <div className="live-report-export-actions no-print">
                <span className="live-report-count">{(report.perStudent || []).length} students</span>
                <button className="live-session-secondary" onClick={() => downloadSessionPdf(selectedStudentIds)} disabled={!selectedStudentIds.length || selectedStudentIds.length > 150 || reportExporting}>
                  <HiOutlineArrowDownTray /> Download selected PDF ({selectedStudentIds.length})
                </button>
              </div>
            </div>
            {selectedStudentIds.length > 150 && <p className="live-report-export-error">Batch PDF exports are limited to 150 students. Deselect some students.</p>}
            <div className="live-report-table-wrap"><table><thead><tr><th>Select</th><th>Student</th><th>Answered</th><th>Correct</th><th>Wrong</th><th>Score</th><th>Away</th></tr></thead><tbody>
              {(report.perStudent || []).map((student) => <tr key={student.studentId} className="live-report-student-row" data-student-id={student.studentId}><td><input aria-label={`Select ${student.name} session report`} type="checkbox" checked={selectedStudentIds.includes(student.studentId)} onChange={() => toggleSessionStudent(student.studentId)} /></td><td><button className="live-report-student-link no-print" onClick={() => setReportStudentId(student.studentId)}>{student.name}</button></td><td>{student.answered}</td><td>{student.correct}</td><td>{student.wrong}</td><td>{student.scorePercent}%</td><td>{student.totalAwaySeconds}s</td></tr>)}
            </tbody></table></div>
          </section>
          <section className="live-review-card live-report-student-section">
            <div className="live-report-heading">
              <div>
                <h2>Individual student report</h2>
                <p>Review submitted answers and response times for one student.</p>
                <label className="no-print">Student
                  <select value={selectedReportStudent?.studentId || ""} onChange={(event) => setReportStudentId(event.target.value)}>
                    {(report.perStudent || []).map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}
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
                  <span><strong>{selectedReportStudent.coveragePercent}%</strong> coverage</span>
                  <span><strong>{selectedReportStudent.totalAwaySeconds}s</strong> away</span>
                </div>
                <div className="live-report-table-wrap">
                  <table><thead><tr><th>#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Result</th><th>Submitted</th><th>Response time</th></tr></thead>
                    <tbody>{selectedReportStudent.answerDetails.map((answer) => <tr key={answer.slideId}>
                      <td>{answer.questionNumber}</td>
                      <td>{answer.title && <strong>{answer.title}: </strong>}{answer.prompt}</td>
                      <td>{answer.selectedAnswer || "—"}</td>
                      <td>{answer.correctAnswer}</td>
                      <td>{answer.status === "answered" ? answer.isCorrect ? "Correct" : "Incorrect" : answer.status.replace(/_/g, " ")}</td>
                      <td>{answer.submittedAt ? new Date(answer.submittedAt).toLocaleTimeString() : "—"}</td>
                      <td>{answer.latencyMs != null ? `${(answer.latencyMs / 1000).toFixed(1)}s` : "—"}</td>
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
          <section className="live-review-card live-report-class-section">
            <div className="live-report-section-heading">
              <div><h2>All student answers</h2><p>Expanded details for the full class. Open a student to review their responses.</p></div>
              <span className="live-report-count">{(report.perStudent || []).length} students</span>
            </div>
            {(report.perStudent || []).map((student) => (
              <details className="live-report-answer-group" key={student.studentId}>
                <summary><span>{student.name}</span><small>{student.answered}/{report.summary?.questionCount || 0} answered · {student.correct} correct · {student.scorePercent}%</small></summary>
                <div className="live-report-table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Result</th><th>Submitted</th></tr></thead><tbody>
                  {student.answerDetails.map((answer) => <tr key={answer.slideId}><td>{answer.questionNumber}</td><td>{answer.prompt}</td><td>{answer.selectedAnswer || "—"}</td><td>{answer.correctAnswer}</td><td>{answer.status === "answered" ? answer.isCorrect ? "Correct" : "Incorrect" : answer.status.replace(/_/g, " ")}</td><td>{answer.submittedAt ? new Date(answer.submittedAt).toLocaleTimeString() : "—"}</td></tr>)}
                </tbody></table></div>
                {student.presenceEvents.some((event) => event.reason === "visibility_hidden" || event.reason === "visibility_visible") && (
                  <ul className="live-report-presence-list">
                    {student.presenceEvents.filter((event) => event.reason === "visibility_hidden" || event.reason === "visibility_visible")
                      .map((event, index) => <li key={`${event.at}-${index}`}>{event.reason === "visibility_hidden" ? "Tab hidden" : "Tab visible"} · {new Date(event.at).toLocaleString()}</li>)}
                  </ul>
                )}
              </details>
            ))}
          </section>
          {report.session.status === "ended" && (
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
          )}
        </div>
      ) : (
        <section className="live-review-card live-replay-player">
          <div className="live-replay-topline"><div><h2>Recorded session</h2><span>{replay.session.startedAt ? new Date(replay.session.startedAt).toLocaleString() : "Session has not started"}</span></div>
            <label>Filter student<select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}><option value="">Everyone</option>{replay.students.map((student) => <option key={student.studentId} value={student.studentId}>{student.name}</option>)}</select></label>
          </div>
          <LiveLessonSlide slide={replayState?.slide} index={replayState?.currentSlideIndex || 0} total={replay.lesson?.slides?.length || 0} language={replay.lesson?.language} allowScripts hidden={replayState?.slideHidden}>
            {replayState?.slide?.question && (
              <section className="live-question-card live-replay-question">
                <div className="live-question-topline"><span>QUESTION</span><span>{replayState.revealed ? "Results revealed" : replayState.questionOpen ? "Answers were open" : "Question was closed"}</span></div>
                <h2>{replayState.slide.question.prompt}</h2>
                <div className="live-answer-options">
                  {replayState.slide.question.options.map((option) => {
                    const optionAnswers = replayState.answers.filter((event) => event.payload?.selectedOptionId === option.id);
                    return <div className="live-answer-option" key={option.id}><span>{option.id.toUpperCase()}</span>{option.text}<small>{optionAnswers.length} responses</small></div>;
                  })}
                </div>
              </section>
            )}
          </LiveLessonSlide>
          {replayState?.paused && <div className="live-replay-paused">The live session was paused at this point.</div>}
          {replayState?.slide?.question && (
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
            <button className="live-session-secondary" onClick={() => setPlaying((value) => !value)}>{playing ? <HiOutlinePause /> : <HiOutlinePlay />}{playing ? "Pause" : "Play"}</button>
            <span>{new Date((new Date(replay.session.startedAt || 0)).getTime() + seconds * 1000).toLocaleTimeString()}</span>
            <input type="range" min="0" max={durationSeconds} value={seconds} onChange={(event) => { setPlaying(false); setSeconds(Number(event.target.value)); }} aria-label="Seek replay timeline" />
            <span>{Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, "0")}</span>
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
