import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineClipboardDocumentCheck,
  HiOutlineEnvelopeOpen,
  HiOutlineXMark,
} from "react-icons/hi2";
import parentSupportService from "../../../../services/supportParentService.js";
import SurveyForm from "../../../../components/support/SurveyForm.jsx";
import "./ParentSupportPage.css";

const isArabic = (language) => String(language || "").startsWith("ar");
const pick = (en, ar, arabic) => (arabic ? ar || en : en || ar);

const monthLabel = (month, language) => {
  if (!month) return "";
  const date = new Date(2026, Number(month) - 1, 1);
  return new Intl.DateTimeFormat(isArabic(language) ? "ar-EG" : "en-GB", { month: "long" }).format(date);
};

const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const goalState = (goal) => {
  const tasks = [...(goal.homeTasks || []), ...(goal.classTasks || [])];
  if (!tasks.some((task) => task.status)) return null;
  if (tasks.some((task) => task.status === "need_help")) return "needsHelp";
  if (tasks.every((task) => task.status === "done")) return "done";
  return "onTrack";
};

const PlanStatusChip = ({ status }) => {
  const { t } = useTranslation("support");
  return <span className={`parent-support-chip is-${status}`}>{t(`plan.status.${status}`, { defaultValue: status })}</span>;
};

const HomeTask = ({ task, planId, busy, onCheckIn, t }) => {
  const [note, setNote] = useState(task.note2 || "");
  const [noteOpen, setNoteOpen] = useState(false);

  const options = [
    { key: "done", label: t("plan.done"), icon: <HiOutlineCheck size={15} /> },
    { key: "didnt_fit", label: t("plan.didntFit"), icon: <HiOutlineXMark size={15} /> },
    { key: "need_help", label: t("plan.needHelp"), icon: <HiOutlineArrowPath size={15} /> },
  ];

  return (
    <li className={`parent-support-task ${task.status ? `is-${task.status}` : ""}`}>
      <div className="parent-support-task-main">
        <span className="parent-support-task-title">{task.title}</span>
        {task.note && <span className="parent-support-task-note">{task.note}</span>}
      </div>

      <div className="parent-support-task-controls" role="group" aria-label={t("parent.taskLabel")}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`parent-support-status ${task.status === option.key ? `is-active is-${option.key}` : ""}`}
            disabled={busy}
            aria-pressed={task.status === option.key}
            onClick={() => onCheckIn(planId, task.id, option.key, note)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      <button type="button" className="parent-support-note-toggle" onClick={() => setNoteOpen((open) => !open)}>
        {noteOpen ? t("plan.hideNote") : t("plan.addNote")}
      </button>
      {noteOpen && (
        <input
          className="parent-support-note-input"
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

const ClassTask = ({ task, t }) => (
  <li className={`parent-support-task is-class ${task.status ? `is-${task.status}` : ""}`}>
    <span className="parent-support-task-title">{task.title}</span>
    {task.note && <span className="parent-support-task-note">{task.note}</span>}
    <span className={`parent-support-teacher-mark ${task.status ? `is-${task.status}` : "is-waiting"}`}>
      {task.status ? t(`plan.teacherMark.${task.status}`) : t("plan.teacherMark.waiting")}
    </span>
  </li>
);

const ThisMonthCard = ({ plan, previous, t }) => {
  const done = plan.homeProgress?.done ?? 0;
  const total = plan.homeProgress?.total ?? 0;
  const needHelp = plan.homeProgress?.needHelp ?? 0;
  const open = Math.max(total - done - needHelp, 0);
  const share = (value) => (total ? `${(value / total) * 100}%` : "0%");

  return (
    <section className="parent-support-card parent-support-month">
      <div className="parent-support-card-head">
        <h2>{t("parent.progressTitle")}</h2>
      </div>
      <p className="parent-support-month-count">
        <strong>{done}</strong> / {total}
      </p>
      <p className="parent-support-month-label">{t("parent.progressLabel")}</p>
      <div className="parent-support-bar" aria-hidden="true">
        {done > 0 && <i className="is-done" style={{ width: share(done) }} />}
        {needHelp > 0 && <i className="is-help" style={{ width: share(needHelp) }} />}
        {open > 0 && <i className="is-open" style={{ width: share(open) }} />}
      </div>
      <p className="parent-support-legend">
        <span><b className="is-done" />{t("parent.progressDone", { n: done })}</span>
        <span><b className="is-help" />{t("parent.progressHelp", { n: needHelp })}</span>
        <span><b className="is-open" />{t("parent.progressNotYet", { n: open })}</span>
      </p>
      {plan.classProgress?.total > 0 && (
        <p className="parent-support-class-line">
          {t("parent.classSteps", { done: plan.classProgress.done, total: plan.classProgress.total })}
        </p>
      )}
      {previous && (
        <p className="parent-support-compare">
          {t("parent.lastMonth", {
            homeDone: previous.homeProgress?.done ?? 0,
            homeTotal: previous.homeProgress?.total ?? 0,
            classDone: previous.classProgress?.done ?? 0,
            classTotal: previous.classProgress?.total ?? 0,
          })}
        </p>
      )}
    </section>
  );
};

const WhoSeesCard = ({ t }) => (
  <section className="parent-support-card parent-support-who">
    <div className="parent-support-card-head">
      <h2>{t("parent.whoTitle")}</h2>
    </div>
    <p>{t("parent.whoHomeroom")}</p>
    <p>{t("parent.whoTeachers")}</p>
    <p>{t("parent.whoFamily")}</p>
  </section>
);

const PlanCard = ({ plan, arabic, busy, onCheckIn, t }) => {
  const goals = plan.goals || [];
  return (
    <section className="parent-support-card parent-support-plan">
      <div className="parent-support-plan-head">
        <div>
          <p className="parent-support-eyebrow">{t("parent.monthPlan", { month: monthLabel(plan.month, arabic ? "ar" : "en") })}</p>
          <h2>{t("parent.planTitle")}</h2>
        </div>
        <PlanStatusChip status={plan.status} />
      </div>

      {plan.summary && <p className="parent-support-summary">{plan.summary}</p>}

      {(plan.strengthKeys?.length > 0 || plan.focusKeys?.length > 0) && (
        <div className="parent-support-tags">
          {plan.strengthKeys?.length > 0 && (
            <div>
              <span>{t("parent.strengths")}</span>
              <div className="parent-support-tag-row">
                {plan.strengthKeys.map((key) => (
                  <em key={`strength-${key}`} className="is-strength">{t(`concern.${key}`, { defaultValue: key })}</em>
                ))}
              </div>
            </div>
          )}
          {plan.focusKeys?.length > 0 && (
            <div>
              <span>{t("parent.focus")}</span>
              <div className="parent-support-tag-row">
                {plan.focusKeys.map((key) => (
                  <em key={`focus-${key}`} className="is-focus">{t(`concern.${key}`, { defaultValue: key })}</em>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="parent-support-goals">
        {goals.map((goal, index) => {
          const state = goalState(goal);
          return (
            <article key={goal.id} className={`parent-support-goal is-${goal.domain}`}>
              <div className="parent-support-goal-head">
                <span className="parent-support-goal-n" aria-hidden="true">{index + 1}</span>
                <h3>{pick(goal.title, goal.titleAr, arabic)}</h3>
                {state && <span className={`parent-support-goal-chip is-${state}`}>{t(`parent.goalStatus.${state}`)}</span>}
              </div>
              <span className={`parent-support-domain is-${goal.domain}`}>{t(`domain.${goal.domain}`)}</span>
              {goal.description && <p className="parent-support-goal-text">{pick(goal.description, goal.descriptionAr, arabic)}</p>}

              <div className="parent-support-goal-block">
                <h4>{t("plan.atHome")}</h4>
                {goal.homeTasks.length === 0 ? (
                  <p className="parent-support-muted">{t("parent.noHomeTasks")}</p>
                ) : (
                  <ul>
                    {goal.homeTasks.map((task) => (
                      <HomeTask
                        key={task.id}
                        task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                        planId={plan.id}
                        busy={busy}
                        onCheckIn={onCheckIn}
                        t={t}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {goal.classTasks.length > 0 && (
                <div className="parent-support-goal-block is-class">
                  <h4>{t("plan.inClass")}</h4>
                  <ul>
                    {goal.classTasks.map((task) => (
                      <ClassTask
                        key={task.id}
                        task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                        t={t}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {goal.successLook && (
                <p className="parent-support-success">
                  <span>{t("plan.successLook")}</span>
                  {pick(goal.successLook, goal.successLookAr, arabic)}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

const SurveyCard = ({ survey, child, arabic, busy, onSave, onSubmit, t }) => {
  const [open, setOpen] = useState(false);
  const finished = survey.status === "submitted";

  return (
    <section className={`parent-support-card parent-support-survey ${open ? "is-open" : ""}`}>
      <div className="parent-support-survey-head">
        <span className="parent-support-survey-icon" aria-hidden="true">
          <HiOutlineEnvelopeOpen size={20} />
        </span>
        <div>
          <h2>{finished ? t("parent.surveyDoneTitle") : t("parent.surveyTitle")}</h2>
          <p>
            {finished
              ? t("parent.surveyDoneBody", { name: child.student.firstName || child.student.name })
              : t("parent.surveyBody", {
                  month: monthLabel(survey.month, arabic ? "ar" : "en"),
                  name: child.student.firstName || child.student.name,
                })}
          </p>
        </div>
        {!finished && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen((value) => !value)}>
            {open ? t("common.close") : t("parent.startSurvey")}
            <HiOutlineChevronDown size={15} className={open ? "is-flipped" : ""} />
          </button>
        )}
      </div>

      {open && !finished && (
        <SurveyForm
          survey={survey}
          saving={busy}
          submitting={busy}
          onSave={onSave}
          onSubmit={onSubmit}
        />
      )}
    </section>
  );
};

const HistoryList = ({ history, arabic, t }) => {
  if (!history?.length) return null;
  return (
    <section className="parent-support-card parent-support-history">
      <div className="parent-support-card-head">
        <h2>{t("parent.historyTitle")}</h2>
      </div>
      <ul>
        {history.map((entry) => (
          <li key={entry.id}>
            <div>
              <span>{monthLabel(entry.month, arabic ? "ar" : "en")} {entry.academicYear}</span>
              {entry.homeProgress && (
                <em>
                  {t("parent.historyProgress", {
                    homeDone: entry.homeProgress.done,
                    homeTotal: entry.homeProgress.total,
                    classDone: entry.classProgress?.done ?? 0,
                    classTotal: entry.classProgress?.total ?? 0,
                  })}
                </em>
              )}
            </div>
            <PlanStatusChip status={entry.status} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const ParentSupportPage = () => {
  const { t, i18n } = useTranslation("support");
  const arabic = isArabic(i18n.language);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await parentSupportService.getOverview();
      setChildren(data.children || []);
      setChildId((current) => current || data.children?.[0]?.student?.id || "");
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.loadParent"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const child = useMemo(
    () => children.find((entry) => entry.student.id === childId) || children[0] || null,
    [children, childId],
  );

  const patchChild = (updater) => {
    setChildren((current) => current.map((entry) => (
      entry.student.id === child?.student.id ? updater(entry) : entry
    )));
  };

  const handleCheckIn = async (planId, taskId, status, note) => {
    setBusy(true);
    try {
      const saved = await parentSupportService.checkIn(planId, { taskId, status, note });
      patchChild((entry) => {
        if (!entry.plan) return entry;
        const goals = entry.plan.goals.map((goal) => ({
          ...goal,
          homeTasks: goal.homeTasks.map((task) => (
            task.id === saved.taskId
              ? { ...task, status: saved.status, note2: saved.note || "", updatedAt: saved.updatedAt }
              : task
          )),
        }));
        const done = goals.reduce((sum, goal) => sum + goal.homeTasks.filter((task) => task.status === "done").length, 0);
        const total = goals.reduce((sum, goal) => sum + goal.homeTasks.length, 0);
        return { ...entry, plan: { ...entry.plan, goals, homeProgress: { ...entry.plan.homeProgress, done, total } } };
      });
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.checkIn"));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSurvey = async (answers) => {
    if (!child?.survey) return;
    setBusy(true);
    try {
      await parentSupportService.saveSurvey(child.survey.id, answers);
      toast.success(t("survey.saved"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("survey.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitSurvey = async (answers) => {
    if (!child?.survey) return;
    setBusy(true);
    try {
      await parentSupportService.submitSurvey(child.survey.id, answers);
      patchChild((entry) => ({ ...entry, survey: entry.survey ? { ...entry.survey, status: "submitted" } : null }));
      toast.success(t("survey.submitted"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("survey.submitFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="parent-support">
        <div className="loading-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (!children.length) {
    return (
      <div className="parent-support">
        <header className="parent-support-header">
          <h1>{t("parent.title")}</h1>
          <p>{t("parent.subtitle")}</p>
        </header>
        <div className="parent-support-empty">
          <HiOutlineClipboardDocumentCheck size={42} />
          <h2>{t("parent.noChildrenTitle")}</h2>
          <p>{t("parent.noChildrenBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-support" dir={arabic ? "rtl" : "ltr"}>
      <header className="parent-support-header">
        <h1>{t("parent.title")}</h1>
        <p>{t("parent.subtitle")}</p>
      </header>

      {children.length > 1 && (
        <div className="parent-support-children" role="tablist" aria-label={t("parent.chooseChild")}>
          {children.map((entry) => (
            <button
              key={entry.student.id}
              type="button"
              role="tab"
              aria-selected={entry.student.id === child.student.id}
              className={`parent-support-child ${entry.student.id === child.student.id ? "is-active" : ""}`}
              onClick={() => setChildId(entry.student.id)}
            >
              <span className="parent-support-avatar" aria-hidden="true">{initials(entry.student.name)}</span>
              <span>
                <strong>{entry.student.name}</strong>
                <em>{entry.student.class}</em>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="parent-support-child-head">
        <span className="parent-support-avatar is-large" aria-hidden="true">{initials(child.student.name)}</span>
        <div>
          <h2>{child.student.name}</h2>
          <p>{child.student.class}{child.student.academicYear ? ` · ${child.student.academicYear}` : ""}</p>
        </div>
      </div>

      <div className="parent-support-layout">
        <div className="parent-support-main">
          {child.plan ? (
            <PlanCard
              plan={child.plan}
              arabic={arabic}
              busy={busy}
              onCheckIn={handleCheckIn}
              t={t}
            />
          ) : (
            <section className="parent-support-card parent-support-waiting">
              <HiOutlineClipboardDocumentCheck size={30} />
              <div>
                <h2>{t("parent.noPlanTitle")}</h2>
                <p>{child.survey ? t("parent.noPlanSurveyFirst") : t("parent.noPlanBody")}</p>
              </div>
            </section>
          )}
        </div>

        <aside className="parent-support-rail">
          {child.plan && <ThisMonthCard plan={child.plan} previous={child.history?.[0] || null} t={t} />}

          {child.survey && (
            <SurveyCard
              survey={child.survey}
              child={child}
              arabic={arabic}
              busy={busy}
              onSave={handleSaveSurvey}
              onSubmit={handleSubmitSurvey}
              t={t}
            />
          )}

          <WhoSeesCard t={t} />

          <HistoryList history={child.history} arabic={arabic} t={t} />
        </aside>
      </div>
    </div>
  );
};

export default ParentSupportPage;
