import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentCheck,
  HiOutlineKey,
  HiOutlineLanguage,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportAccessService from "../../../services/supportAccessService.js";
import SurveyForm from "../../../components/support/SurveyForm.jsx";
import ErrorBanner from "../../../components/shared/ErrorBanner.jsx";
import { computeHomeProgress } from "../../../utils/supportProgress.js";
import "./SupportAccessPage.css";

const TOKEN_KEY = "support.accessToken";
const isArabic = (language) => String(language || "").startsWith("ar");
const pick = (en, ar, arabic) => (arabic ? ar || en : en || ar);

const monthLabel = (month, language) => {
  if (!month) return "";
  const date = new Date(2026, Number(month) - 1, 1);
  return new Intl.DateTimeFormat(isArabic(language) ? "ar-EG" : "en-GB", { month: "long" }).format(date);
};

const dueLabel = (dueDate, language) => {
  if (!dueDate) return "";
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(isArabic(language) ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }).format(date);
};

const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();

const surveyState = (status) => {
  if (status === "submitted" || status === "skipped") return "done";
  if (status === "opened") return "inProgress";
  return "notStarted";
};

const isFinished = (survey) => survey.status === "submitted" || survey.status === "skipped";

const isOverdue = (survey) => {
  if (!survey.dueDate || isFinished(survey)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(survey.dueDate) < today;
};

const groupSurveys = (surveys, language) => {
  const groups = new Map();
  for (const survey of surveys) {
    const key = `${survey.academicYear}|${survey.month}|${survey.subject?.id || survey.audience}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        month: survey.month,
        academicYear: survey.academicYear,
        subject: survey.subject?.name || "",
        surveys: [],
      });
    }
    groups.get(key).surveys.push(survey);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    surveys: [...group.surveys].sort((a, b) => (
      String(a.student?.name || "").localeCompare(String(b.student?.name || ""), language)
    )),
    done: group.surveys.filter(isFinished).length,
  }));
};

const SurveyRow = ({ survey, studentName, studentClass, language, disabled, onOpen, t }) => {
  const state = surveyState(survey.status);
  const due = dueLabel(survey.dueDate, language);
  const overdue = isOverdue(survey);
  const action = state === "inProgress" ? t("access.continue") : t("access.answer");
  return (
    <li className={`access-survey-row is-${state}`}>
      <span className="access-avatar" aria-hidden="true">{initials(studentName)}</span>
      <div className="access-survey-main">
        <strong>{studentName}</strong>
        <span>
          {studentClass}
          {due && (
            <em className={overdue ? "is-overdue" : ""}>
              {overdue ? t("access.overdue", { date: due }) : t("access.dueOn", { date: due })}
            </em>
          )}
        </span>
      </div>
      <span className={`access-state is-${state}`}>{t(`access.state.${state}`)}</span>
      {state !== "done" && (
        <button
          type="button"
          className={`btn btn-sm ${state === "inProgress" ? "btn-primary" : "btn-secondary"}`}
          disabled={disabled}
          aria-label={`${action}: ${studentName}`}
          onClick={() => onOpen(survey.id)}
        >
          {action}
        </button>
      )}
    </li>
  );
};

const StatusChip = ({ status, plan = false }) => {
  const { t } = useTranslation("support");
  const key = plan ? `plan.status.${status}` : `status.${status}`;
  return <span className={`access-chip is-${status}`}>{t(key, { defaultValue: status })}</span>;
};

const HomeTask = ({ task, planId, token, busy, onCheckIn, readOnly, t }) => {
  const [note, setNote] = useState(task.note2 || "");
  const [noteOpen, setNoteOpen] = useState(false);
  const options = [
    { key: "done", label: t("plan.done"), icon: <HiOutlineCheck size={14} /> },
    { key: "didnt_fit", label: t("plan.didntFit"), icon: <HiOutlineXMark size={14} /> },
    { key: "need_help", label: t("plan.needHelp"), icon: <HiOutlineArrowPath size={14} /> },
  ];
  return (
    <li className={`access-task ${task.status ? `is-${task.status}` : ""}`}>
      <div className="access-task-main">
        <span>{task.title}</span>
        {task.note && <em>{task.note}</em>}
      </div>
      {readOnly ? (
        task.status && (
          <span className={`access-family-mark is-${task.status}`}>
            {options.find((option) => option.key === task.status)?.label}
          </span>
        )
      ) : (
        <>
          <div className="access-task-controls" role="group" aria-label={t("parent.taskLabel")}>
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`access-status ${task.status === option.key ? `is-active is-${option.key}` : ""}`}
                disabled={busy}
                aria-pressed={task.status === option.key}
                onClick={() => onCheckIn(planId, task.id, option.key, note)}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="access-note-toggle" onClick={() => setNoteOpen((open) => !open)}>
            {noteOpen ? t("plan.hideNote") : t("plan.addNote")}
          </button>
          {noteOpen && (
            <input
              className="access-note-input"
              value={note}
              maxLength={300}
              placeholder={t("plan.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => task.status && note !== (task.note2 || "") && onCheckIn(planId, task.id, task.status, note)}
            />
          )}
        </>
      )}
    </li>
  );
};

const PlanBlock = ({ plan, previous, arabic, token, busy, onCheckIn, t }) => (
  <section className="access-plan">
    <div className="access-plan-head">
      <div>
        <p>{t("parent.monthPlan", { month: monthLabel(plan.month, arabic ? "ar" : "en") })}</p>
        <h3>{pick(plan.headline, plan.headlineAr, arabic) || t("parent.planTitle")}</h3>
      </div>
      <StatusChip status={plan.status} plan />
    </div>
    {pick(plan.summary, plan.summaryAr, arabic) && (
      <p className="access-plan-summary">{pick(plan.summary, plan.summaryAr, arabic)}</p>
    )}

    <div className="access-progress">
      <div>
        <span>{t("plan.homeProgress")}</span>
        <strong>{plan.homeProgress.done}/{plan.homeProgress.total}</strong>
      </div>
      <div>
        <span>{t("plan.classProgress")}</span>
        <strong>{plan.classProgress.done}/{plan.classProgress.total}</strong>
      </div>
    </div>
    {previous && (
      <p className="access-compare">
        {t("parent.lastMonth", {
          homeDone: previous.homeProgress?.done ?? 0,
          homeTotal: previous.homeProgress?.total ?? 0,
          classDone: previous.classProgress?.done ?? 0,
          classTotal: previous.classProgress?.total ?? 0,
        })}
      </p>
    )}

    <div className="access-goals">
      {plan.goals.map((goal) => (
        <article key={goal.id} className={`access-goal is-${goal.domain}`}>
          <span className={`access-domain is-${goal.domain}`}>{t(`domain.${goal.domain}`)}</span>
          <h4>{pick(goal.title, goal.titleAr, arabic)}</h4>
          {goal.description && <p>{pick(goal.description, goal.descriptionAr, arabic)}</p>}
          <div className="access-goal-block">
            <h5>{t("plan.atHome")}</h5>
            <ul>
              {goal.homeTasks.map((task) => (
                <HomeTask
                  key={`${plan.id}:${task.id}`}
                  task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                  planId={plan.id}
                  token={token}
                  busy={busy}
                  onCheckIn={onCheckIn}
                  readOnly={plan.status !== "published"}
                  t={t}
                />
              ))}
            </ul>
          </div>
          {goal.classTasks.length > 0 && (
            <div className="access-goal-block is-class">
              <h5>{t("plan.inClass")}</h5>
              <ul>
                {goal.classTasks.map((task) => (
                  <li key={task.id} className="access-class-task">
                    <span>{pick(task.title, task.titleAr, arabic)}</span>
                    <em className={task.status ? `is-${task.status}` : "is-waiting"}>
                      {task.status ? t(`plan.teacherMark.${task.status}`) : t("plan.teacherMark.waiting")}
                    </em>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {goal.successLook && (
            <p className="access-success">
              <span>{t("plan.successLook")}</span>
              {pick(goal.successLook, goal.successLookAr, arabic)}
            </p>
          )}
        </article>
      ))}
    </div>
  </section>
);

const SupportAccessPage = () => {
  const { t, i18n } = useTranslation("support");
  const arabic = isArabic(i18n.language);
  const initialCode = useRef(
    (new URLSearchParams(window.location.search).get("code") || "").replace(/\D/g, "").slice(0, 6),
  );
  const [code, setCode] = useState(initialCode.current);
  const [token, setToken] = useState(() => (initialCode.current ? "" : sessionStorage.getItem(TOKEN_KEY) || ""));
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [openSurvey, setOpenSurvey] = useState(null);
  const [surveyBusy, setSurveyBusy] = useState(false);
  const [hubError, setHubError] = useState(false);
  const [view, setView] = useState("todo");
  const [expanded, setExpanded] = useState({});
  const autoTried = useRef(false);

  const clearSession = useCallback((message = "") => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setHub(null);
    setOpenSurvey(null);
    setHubError(false);
    setNotice(message);
    setLoading(false);
  }, []);

  const loadHub = useCallback(async (accessToken) => {
    try {
      const data = await supportAccessService.hub(accessToken);
      setHub(data);
      setHubError(false);
      setNotice("");
    } catch (error) {
      const status = error.response?.status;
      if (status === 401) {
        clearSession(t("access.expiredBody"));
      } else {
        setHubError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [clearSession, t]);

  useEffect(() => {
    if (token) loadHub(token);
  }, [token, loadHub]);

  const resolveCode = useCallback(async (raw) => {
    const trimmed = String(raw || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setNotice(t("access.invalidFormat"));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const data = await supportAccessService.resolve(trimmed);
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setHub({
        enabled: data.enabled,
        respondent: data.respondent,
        school: data.school,
        student: data.student,
        surveys: data.surveys,
        plans: data.plans,
      });
      setCode("");
      if (window.location.search) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (error) {
      const status = error.response?.status;
      const errorCode = error.response?.data?.code;
      if (status === 429 || errorCode === "CODE_LOCKED") {
        setNotice(t("access.lockedBody"));
      } else if (errorCode === "CODE_INVALID") {
        setNotice(t("access.invalidBody"));
      } else {
        setNotice(t("access.genericError"));
      }
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (initialCode.current.length === 6) {
      sessionStorage.removeItem(TOKEN_KEY);
      resolveCode(initialCode.current);
    }
  }, [resolveCode]);

  const handleResolve = (event) => {
    event.preventDefault();
    resolveCode(code);
  };

  const openSurveyById = async (surveyId) => {
    if (!token) return;
    setSurveyBusy(true);
    try {
      const survey = await supportAccessService.getSurvey(token, surveyId);
      setOpenSurvey(survey);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setHub((current) => ({
        ...current,
        surveys: current.surveys.map((row) => (
          row.id === surveyId && row.status === "sent" ? { ...row, status: "opened" } : row
        )),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || t("access.loadSurveyFailed"));
    } finally {
      setSurveyBusy(false);
    }
  };

  const handleSaveSurvey = async (answers) => {
    setSurveyBusy(true);
    try {
      const saved = await supportAccessService.saveSurvey(token, openSurvey.id, answers, openSurvey.revision);
      setOpenSurvey((current) => ({ ...current, revision: saved.revision, lastSavedAt: saved.lastSavedAt }));
      toast.success(t("survey.saved"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("survey.saveFailed"));
    } finally {
      setSurveyBusy(false);
    }
  };

  const handleSubmitSurvey = async (answers) => {
    setSurveyBusy(true);
    try {
      await supportAccessService.submitSurvey(token, openSurvey.id, answers, openSurvey.revision);
      setOpenSurvey((current) => ({ ...current, status: "submitted" }));
      setHub((current) => ({
        ...current,
        surveys: current.surveys.map((row) => (row.id === openSurvey.id ? { ...row, status: "submitted" } : row)),
      }));
      toast.success(t("survey.submitted"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("survey.submitFailed"));
    } finally {
      setSurveyBusy(false);
    }
  };

  const markSurvey = async (nextStatus, action, successKey) => {
    setSurveyBusy(true);
    try {
      await action();
      setOpenSurvey((current) => ({ ...current, status: nextStatus, noConcerns: nextStatus === "submitted" && current.noConcerns }));
      setHub((current) => ({
        ...current,
        surveys: current.surveys.map((row) => (row.id === openSurvey.id ? { ...row, status: nextStatus } : row)),
      }));
      toast.success(t(successKey));
    } catch (error) {
      toast.error(error.response?.data?.message || t("survey.submitFailed"));
    } finally {
      setSurveyBusy(false);
    }
  };

  const handleNoConcerns = () => markSurvey(
    "submitted",
    () => supportAccessService.noConcerns(token, openSurvey.id),
    "survey.noConcernsSaved",
  );

  const handleSkip = () => markSurvey(
    "skipped",
    () => supportAccessService.skip(token, openSurvey.id),
    "survey.skipped",
  );

  const handleCheckIn = async (planId, taskId, status, note) => {
    setBusy(true);
    try {
      const saved = await supportAccessService.checkIn(token, planId, { taskId, status, note });
      setHub((current) => ({
        ...current,
        plans: current.plans.map((plan) => {
          if (plan.id !== planId) return plan;
          const goals = plan.goals.map((goal) => ({
            ...goal,
            homeTasks: goal.homeTasks.map((task) => (
              task.id === saved.taskId ? { ...task, status: saved.status, note2: saved.note || "" } : task
            )),
          }));
          const progress = computeHomeProgress(goals);
          return { ...plan, goals, homeProgress: { ...plan.homeProgress, ...progress } };
        }),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.checkIn"));
    } finally {
      setBusy(false);
    }
  };

  const changeLanguage = () => {
    i18n.changeLanguage(arabic ? "en" : "ar");
  };

  const respondent = hub?.respondent;
  const roleLabel = respondent?.kind === "parent" ? t("access.parentRole") : t("access.teacherRole");

  const surveys = useMemo(() => hub?.surveys || [], [hub]);
  const groups = useMemo(() => groupSurveys(surveys, i18n.language), [surveys, i18n.language]);
  const doneCount = surveys.filter(isFinished).length;
  const todoCount = surveys.length - doneCount;
  const studentOf = (survey) => survey?.student || hub?.student || null;

  const openGroup = openSurvey ? groups.find((group) => group.surveys.some((row) => row.id === openSurvey.id)) : null;
  const openRow = openGroup?.surveys.find((row) => row.id === openSurvey.id) || null;
  const openStudent = studentOf(openRow || openSurvey);
  const openIndex = openGroup ? openGroup.surveys.findIndex((row) => row.id === openSurvey.id) : -1;
  const nextSurvey = useMemo(() => {
    if (!openSurvey) return null;
    const ordered = groups.flatMap((group) => group.surveys);
    const start = ordered.findIndex((row) => row.id === openSurvey.id);
    const rotated = [...ordered.slice(start + 1), ...ordered.slice(0, Math.max(start, 0))];
    return rotated.find((row) => !isFinished(row)) || null;
  }, [groups, openSurvey]);

  const closeSurvey = () => {
    setOpenSurvey(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const groupOpen = (group, index) => expanded[group.key] ?? (
    index === 0 || (group.month === groups[0]?.month && group.academicYear === groups[0]?.academicYear)
  );

  return (
    <div className={`access-page ${arabic ? "is-rtl" : ""}`} dir={arabic ? "rtl" : "ltr"}>
      <header className="access-topbar">
        <div className="access-brand">
          <span className="access-brand-mark">S</span>
          <span>{hub?.school?.name || t("access.brand")}</span>
        </div>
        <button type="button" className="access-lang" onClick={changeLanguage}>
          <HiOutlineLanguage size={16} />
          {arabic ? "English" : "العربية"}
        </button>
      </header>

      {loading ? (
        <div className="access-loading"><div className="spinner" /></div>
      ) : hubError ? (
        <main className="access-hub">
          <ErrorBanner
            message={t("access.loadFailed")}
            onRetry={() => { setLoading(true); setHubError(false); loadHub(token); }}
            retryLabel={t("common.retry")}
          />
        </main>
      ) : !hub ? (
        <main className="access-gate">
          <div className="access-gate-card">
            <span className="access-gate-icon" aria-hidden="true"><HiOutlineKey size={26} /></span>
            <h1>{t("access.title")}</h1>
            <p>{t("access.subtitle")}</p>

            <form onSubmit={handleResolve}>
              <label htmlFor="support-code">{t("access.codeLabel")}</label>
              <input
                id="support-code"
                className="access-code-input"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              />
              {notice && <p className="access-notice" role="alert">{notice}</p>}
              <button type="submit" className="btn btn-primary" disabled={busy || code.length < 6}>
                {busy ? t("access.entering") : t("access.enter")}
              </button>
            </form>

            <p className="access-help">{t("access.help")}</p>
          </div>
        </main>
      ) : hub.enabled === false ? (
        <main className="access-hub">
          <section className="access-who">
            <div>
              <h1>{hub.school?.name || t("access.brand")}</h1>
            </div>
            <button type="button" className="access-exit" onClick={() => clearSession("")}>
              <HiOutlineArrowLeft size={15} />
              {t("access.changeCode")}
            </button>
          </section>
          <section className="access-section">
            <div className="access-all-done" role="status">
              <HiOutlineClipboardDocumentCheck size={30} />
              <strong>{t("access.disabledTitle")}</strong>
              <p>{t("access.disabledBody")}</p>
            </div>
          </section>
          <p className="access-foot">{t("access.foot")}</p>
        </main>
      ) : (
        <main className="access-hub">
          {!openSurvey ? (
            <>
              <section className="access-who">
                <div>
                  <span className="access-role">{roleLabel}</span>
                  <h1>{respondent?.name}</h1>
                  {hub.student && (
                    <p>{t("access.aboutStudent", { name: hub.student.name, className: hub.student.class })}</p>
                  )}
                </div>
                <button type="button" className="access-exit" onClick={() => clearSession("")}>
                  <HiOutlineArrowLeft size={15} />
                  {t("access.changeCode")}
                </button>
              </section>

              {notice && <p className="access-notice is-banner" role="alert">{notice}</p>}

              <section className="access-section">
                <div className="access-section-head">
                  <div className="access-section-title">
                    <h2>{t("access.surveysTitle")}</h2>
                    {surveys.length > 0 && (
                      <p>{t("access.surveysSummary", { open: todoCount, done: doneCount })}</p>
                    )}
                  </div>
                </div>

                {surveys.length === 0 ? (
                  <p className="access-muted">{t("access.noSurveys")}</p>
                ) : (
                  <>
                    <div className="access-tabs" role="tablist" aria-label={t("access.surveysTitle")}>
                      {[
                        { key: "todo", label: t("access.toAnswer"), n: todoCount },
                        { key: "done", label: t("access.doneTab"), n: doneCount },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={view === tab.key}
                          className={`access-tab ${view === tab.key ? "is-active" : ""}`}
                          onClick={() => setView(tab.key)}
                        >
                          {tab.label}
                          <b>{tab.n}</b>
                        </button>
                      ))}
                    </div>

                    {(view === "todo" ? todoCount : doneCount) === 0 ? (
                      view === "todo" ? (
                        <div className="access-all-done" role="status">
                          <HiOutlineCheckCircle size={30} />
                          <strong>{t("access.allDoneTitle")}</strong>
                          <p>{t("access.allDoneBody")}</p>
                        </div>
                      ) : (
                        <p className="access-muted">{t("access.noneDone")}</p>
                      )
                    ) : (
                      <div className="access-groups">
                        {groups.map((group, index) => {
                          const rows = group.surveys.filter((survey) => (
                            view === "done" ? isFinished(survey) : !isFinished(survey)
                          ));
                          if (!rows.length) return null;
                          const open = groupOpen(group, index);
                          const panelId = `access-group-${index}`;
                          const share = group.surveys.length ? (group.done / group.surveys.length) * 100 : 0;
                          return (
                            <div key={group.key} className="access-group">
                              <button
                                type="button"
                                className="access-group-head"
                                aria-expanded={open}
                                aria-controls={panelId}
                                onClick={() => setExpanded((current) => ({ ...current, [group.key]: !open }))}
                              >
                                <span className="access-group-title">
                                  <strong>
                                    {[monthLabel(group.month, i18n.language), group.subject].filter(Boolean).join(" · ")}
                                  </strong>
                                  <em>{t("access.groupProgress", { done: group.done, total: group.surveys.length })}</em>
                                </span>
                                <span className="access-group-bar" aria-hidden="true">
                                  <i style={{ width: `${share}%` }} />
                                </span>
                                <HiOutlineChevronDown size={16} className={`access-group-chevron ${open ? "is-flipped" : ""}`} />
                              </button>
                              {open && (
                                <ul id={panelId} className="access-survey-list">
                                  {rows.map((survey) => {
                                    const student = studentOf(survey);
                                    return (
                                      <SurveyRow
                                        key={survey.id}
                                        survey={survey}
                                        studentName={student?.name || t("access.surveyTitle")}
                                        studentClass={student?.class || ""}
                                        language={i18n.language}
                                        disabled={surveyBusy}
                                        onOpen={openSurveyById}
                                        t={t}
                                      />
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="access-section access-survey-open">
              <button type="button" className="access-back" onClick={closeSurvey}>
                <HiOutlineArrowLeft size={15} />
                {t("access.allSurveys")}
              </button>

              <div className="access-survey-hero">
                <span className="access-avatar is-large" aria-hidden="true">{initials(openStudent?.name || "")}</span>
                <div>
                  <h2>{openStudent?.name || t("access.surveyTitle")}</h2>
                  <p>
                    {[
                      openStudent?.class,
                      openSurvey.subject?.name || openRow?.subject?.name,
                      monthLabel(openSurvey.month || openRow?.month, i18n.language),
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {openGroup && openGroup.surveys.length > 1 && (
                  <span className="access-position">
                    {t("access.position", { index: openIndex + 1, total: openGroup.surveys.length })}
                  </span>
                )}
              </div>

              {isFinished(openSurvey) ? (
                <div className="access-finished" role="status">
                  <HiOutlineCheckCircle size={36} />
                  <h3>{t("access.sentTitle")}</h3>
                  <p>{nextSurvey ? t("access.remaining", { n: todoCount }) : t("access.allDoneBody")}</p>
                  <div className="access-finished-actions">
                    {nextSurvey && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={surveyBusy}
                        onClick={() => openSurveyById(nextSurvey.id)}
                      >
                        {t("access.nextStudent", { name: studentOf(nextSurvey)?.name || "" })}
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={closeSurvey}>
                      {t("access.allSurveys")}
                    </button>
                  </div>
                </div>
              ) : (
                <SurveyForm
                  key={openSurvey.id}
                  survey={openSurvey}
                  saving={surveyBusy}
                  submitting={surveyBusy}
                  onSave={handleSaveSurvey}
                  onSubmit={handleSubmitSurvey}
                  onNoConcerns={handleNoConcerns}
                  onSkip={handleSkip}
                />
              )}
            </section>
          )}

          {!openSurvey && respondent?.kind === "parent" && hub.plans?.length > 0 && (
            <section className="access-section">
              <div className="access-section-head">
                <h2>{t("access.planTitle")}</h2>
                <HiOutlineClipboardDocumentCheck size={18} />
              </div>
              {hub.plans.map((plan, index) => (
                <PlanBlock
                  key={plan.id}
                  plan={plan}
                  previous={hub.plans[index + 1] || null}
                  arabic={arabic}
                  token={token}
                  busy={busy}
                  onCheckIn={handleCheckIn}
                  t={t}
                />
              ))}
            </section>
          )}

          <p className="access-foot">{t("access.foot")}</p>
        </main>
      )}
    </div>
  );
};

export default SupportAccessPage;
