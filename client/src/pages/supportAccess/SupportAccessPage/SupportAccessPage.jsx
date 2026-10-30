import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineKey,
  HiOutlineLanguage,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportAccessService from "../../../services/supportAccessService.js";
import SurveyForm from "../../../components/support/SurveyForm.jsx";
import "./SupportAccessPage.css";

const TOKEN_KEY = "support.accessToken";
const isArabic = (language) => String(language || "").startsWith("ar");
const pick = (en, ar, arabic) => (arabic ? ar || en : en || ar);

const monthLabel = (month, language) => {
  if (!month) return "";
  const date = new Date(2026, Number(month) - 1, 1);
  return new Intl.DateTimeFormat(isArabic(language) ? "ar-EG" : "en-GB", { month: "long" }).format(date);
};

const StatusChip = ({ status }) => {
  const { t } = useTranslation("support");
  return <span className={`access-chip is-${status}`}>{t(`status.${status}`, { defaultValue: status })}</span>;
};

const HomeTask = ({ task, planId, token, busy, onCheckIn, t }) => {
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
          onBlur={() => task.status && onCheckIn(planId, task.id, task.status, note)}
        />
      )}
    </li>
  );
};

const PlanBlock = ({ plan, previous, arabic, token, busy, onCheckIn, t }) => (
  <section className="access-plan">
    <div className="access-plan-head">
      <div>
        <p>{t("parent.monthPlan", { month: monthLabel(plan.month, arabic ? "ar" : "en") })}</p>
        <h3>{t("parent.planTitle")}</h3>
      </div>
      <StatusChip status={plan.status} />
    </div>

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
                  key={task.id}
                  task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                  planId={plan.id}
                  token={token}
                  busy={busy}
                  onCheckIn={onCheckIn}
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
  const autoTried = useRef(false);

  const clearSession = useCallback((message = "") => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setHub(null);
    setOpenSurvey(null);
    setNotice(message);
    setLoading(false);
  }, []);

  const loadHub = useCallback(async (accessToken) => {
    try {
      const data = await supportAccessService.hub(accessToken);
      setHub(data);
      setNotice("");
    } catch (error) {
      const status = error.response?.status;
      clearSession(status === 401 ? t("access.expiredBody") : "");
      if (status !== 401) toast.error(error.response?.data?.message || t("access.loadFailed"));
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
      setHub({ respondent: data.respondent, school: data.school, student: data.student, surveys: data.surveys, plans: data.plans });
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
      await supportAccessService.saveSurvey(token, openSurvey.id, answers);
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
      await supportAccessService.submitSurvey(token, openSurvey.id, answers);
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
          const done = goals.reduce((sum, goal) => sum + goal.homeTasks.filter((task) => task.status === "done").length, 0);
          const total = goals.reduce((sum, goal) => sum + goal.homeTasks.length, 0);
          return { ...plan, goals, homeProgress: { ...plan.homeProgress, done, total } };
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
      ) : (
        <main className="access-hub">
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
              <h2>{t("access.surveysTitle")}</h2>
              <span>{hub.surveys.length}</span>
            </div>
            {hub.surveys.length === 0 ? (
              <p className="access-muted">{t("access.noSurveys")}</p>
            ) : (
              <ul className="access-survey-list">
                {hub.surveys.map((survey) => (
                  <li key={survey.id} className="access-survey-row">
                    <div>
                      <strong>
                        {monthLabel(survey.month, i18n.language)}
                        {survey.subject?.name ? ` · ${survey.subject.name}` : ""}
                      </strong>
                      <span>
                        {hub.student?.name}
                        {survey.dueDate ? ` · ${t("access.dueBy")}` : ""}
                      </span>
                    </div>
                    <StatusChip status={survey.status} />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={surveyBusy || survey.status === "submitted"}
                      onClick={() => openSurveyById(survey.id)}
                    >
                      {survey.status === "submitted" ? t("access.submitted") : t("access.openSurvey")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {openSurvey && (
            <section className="access-section access-survey-open">
              <div className="access-section-head">
                <h2>{t("access.surveyTitle")}</h2>
                <button type="button" className="access-close" onClick={() => setOpenSurvey(null)}>
                  <HiOutlineXMark size={17} />
                </button>
              </div>
              <SurveyForm
                survey={openSurvey}
                saving={surveyBusy}
                submitting={surveyBusy}
                onSave={handleSaveSurvey}
                onSubmit={handleSubmitSurvey}
              />
            </section>
          )}

          {respondent?.kind === "parent" && hub.plans?.length > 0 && (
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
