import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HiOutlineBookOpen,
  HiOutlineChartBar,
  HiOutlineClipboardList,
  HiOutlineFire,
  HiOutlineLightningBolt,
  HiOutlinePlay,
  HiOutlineSparkles,
  HiOutlineTrendingUp
} from "react-icons/hi";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import "../../skillpath/skillpath.css";

const Ring = ({ value, max, size = 84, label, sub }) => {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="sp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="sp-ring__label">
        <strong>{label}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
};

const StudentSkillPathPage = () => {
  const { t, i18n } = useFeatureNamespaces(["skillpath"]);
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [starting, setStarting] = useState("");

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await skillpathService.getStudentHome();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.response?.data?.message || t("errors.loadHome"),
        data: null
      });
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const start = async (payload) => {
    const key = payload.assignmentId || payload.packId || "start";
    setStarting(key);
    try {
      const data = await skillpathService.startSession(payload);
      navigate(`/portal/skillpath/play/${data.session._id}`);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.response?.data?.message || t("errors.start")
      }));
      setStarting("");
    }
  };

  const profile = state.data?.profile;
  const week = state.data?.week || { daysThisWeek: 0 };
  const goal = profile?.weeklyGoalDays || 3;
  const levelPercent = profile ? Math.round((profile.intoLevel / profile.nextLevelAt) * 100) : 0;
  const days = useMemo(
    () => Array.from({ length: goal }, (_, index) => index < week.daysThisWeek),
    [goal, week.daysThisWeek]
  );

  if (state.loading && !state.data) {
    return <div className="sp-page sp-loading">{t("common.loading")}</div>;
  }

  if (state.error && !state.data) {
    return (
      <div className="sp-page">
        <div className="sp-error">{state.error}</div>
        <button type="button" className="sp-btn" onClick={load}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const data = state.data;
  const firstName = data?.student?.firstName || "";

  return (
    <div className="sp-page sp-page--home" dir={i18n.dir()}>
      {state.error ? <div className="sp-error">{state.error}</div> : null}

      <section className="sp-hero sp-hero--home">
        <div className="sp-hero-main">
          <div className="sp-hero-top">
            <span className="sp-hero__kicker">
              <HiOutlineSparkles size={13} />
              {t("home.kicker")}
            </span>
            <div className="sp-hero-links">
              <Link className="sp-hero-link" to="/portal/skillpath/leaderboard">
                <HiOutlineChartBar size={14} />
                {t("board.title")}
              </Link>
              <Link className="sp-hero-link" to="/portal/skillpath/progress">
                <HiOutlineTrendingUp size={14} />
                {t("home.progressLink")}
              </Link>
            </div>
          </div>
          <h2>{firstName ? t("home.greeting", { name: firstName }) : t("home.title")}</h2>
          <p className="sp-hero__lead">{t("home.heroCopy")}</p>
          <div className="sp-hero-goal">
            <div className="sp-goal" aria-label={t("home.weekGoal", { done: week.daysThisWeek, goal })}>
              {days.map((done, index) => (
                <span key={index} className={`sp-goal__dot${done ? " is-done" : ""}`} aria-hidden="true">
                  {done ? "✓" : index + 1}
                </span>
              ))}
            </div>
            <span>{t("home.weekGoal", { done: week.daysThisWeek, goal })}</span>
          </div>
        </div>
        <div className="sp-hero__stats">
          <Ring
            value={levelPercent}
            max={100}
            label={t("home.levelShort", { level: profile?.level || 1 })}
            sub={t("home.levelLabel")}
          />
          <div className="sp-hstat">
            <span className="sp-hstat-icon" aria-hidden="true"><HiOutlineLightningBolt size={15} /></span>
            <div>
              <strong>{profile?.xp || 0}</strong>
              <span>{t("home.xp")}</span>
            </div>
          </div>
          <div className="sp-hstat">
            <span className="sp-hstat-icon" aria-hidden="true"><HiOutlineFire size={15} /></span>
            <div>
              <strong>{profile?.streakWeeks || 0}</strong>
              <span>{t("home.streakWeeks")}</span>
            </div>
          </div>
        </div>
      </section>

      {data?.inProgress?.length > 0 ? (
        <section className="sp-section">
          <div className="sp-section__head sp-section__head--rich">
            <span className="sp-sec-plate is-amber" aria-hidden="true"><HiOutlinePlay size={14} /></span>
            <h3>{t("home.continueTitle")}</h3>
            <span className="sp-count">{data.inProgress.length}</span>
          </div>
          <div className="sp-grid">
            {data.inProgress.map((session) => (
              <article key={session._id} className="sp-card sp-card--continue">
                <div className="sp-card-top">
                  <span className="sp-card-plate is-amber" aria-hidden="true"><HiOutlinePlay size={14} /></span>
                  <h4>{session.packTitle || t("home.continueTitle")}</h4>
                </div>
                <p>{t("home.continueCopy", { answered: session.answered, total: session.total })}</p>
                <div className="sp-bar" aria-hidden="true">
                  <i style={{ width: `${session.total > 0 ? (session.answered / session.total) * 100 : 0}%` }} />
                </div>
                <div className="sp-card__foot">
                  <span className="sp-chip">{t("home.items", { count: session.total })}</span>
                  <Link className="sp-btn sp-btn--primary" to={`/portal/skillpath/play/${session._id}`}>
                    {t("home.resume")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sp-section">
        <div className="sp-section__head sp-section__head--rich">
          <span className="sp-sec-plate is-blue" aria-hidden="true"><HiOutlineClipboardList size={14} /></span>
          <h3>{t("home.assignments")}</h3>
          <span className="sp-count">{data?.assignments?.length || 0}</span>
        </div>
        {data?.assignments?.length ? (
          <div className="sp-grid">
            {data.assignments.map((assignment) => {
              const disabled = assignment.attemptsLeft === 0 || assignment.overdue;
              return (
                <article key={assignment._id} className={`sp-card sp-card--assignment${assignment.overdue ? " is-overdue" : ""}`}>
                  <div className="sp-card-top">
                    <span className="sp-card-plate is-blue" aria-hidden="true"><HiOutlineClipboardList size={14} /></span>
                    <h4>{assignment.pack?.title || t("home.untitledPack")}</h4>
                  </div>
                  <div className="sp-card__meta">
                    <span className="sp-chip">
                      {assignment.mode === "quiz" ? t("home.modeQuiz") : t("home.modePractice")}
                    </span>
                    <span className="sp-chip">{t("home.items", { count: assignment.itemCount })}</span>
                    {assignment.dueDate ? (
                      <span className={`sp-chip ${assignment.overdue ? "sp-chip--danger" : "sp-chip--due"}`}>
                        {assignment.overdue
                          ? t("home.overdue")
                          : t("home.dueOn", {
                              date: new Date(assignment.dueDate).toLocaleDateString(i18n.language)
                            })}
                      </span>
                    ) : null}
                    {!assignment.overdue ? (
                      <span className="sp-chip">
                        {t("home.attemptsLeft", { count: assignment.attemptsLeft })}
                      </span>
                    ) : null}
                  </div>
                  <div className="sp-card__foot">
                    <span className="sp-chip sp-chip--done">
                      {t("home.completedCount", { count: assignment.completed })}
                    </span>
                    <button
                      type="button"
                      className="sp-btn sp-btn--primary"
                      disabled={disabled || starting === assignment._id}
                      onClick={() => start({ assignmentId: assignment._id })}
                    >
                      {disabled ? t("home.unavailable") : t("home.start")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sp-empty">{t("home.noAssignments")}</div>
        )}
      </section>

      <section className="sp-section">
        <div className="sp-section__head sp-section__head--rich">
          <span className="sp-sec-plate is-emerald" aria-hidden="true"><HiOutlineBookOpen size={14} /></span>
          <h3>{t("home.practiceSets")}</h3>
          <span className="sp-count">{data?.practicePacks?.length || 0}</span>
        </div>
        {data?.practicePacks?.length ? (
          <div className="sp-grid">
            {data.practicePacks.map((pack) => (
              <article key={pack._id} className="sp-card sp-card--practice">
                <div className="sp-card-top">
                  <span className="sp-card-plate is-emerald" aria-hidden="true"><HiOutlineBookOpen size={14} /></span>
                  <h4>{pack.title}</h4>
                </div>
                {pack.description ? <p>{pack.description}</p> : null}
                <div className="sp-card__meta">
                  <span className="sp-chip">{t("home.items", { count: pack.itemCount })}</span>
                  {pack.gradeLevels?.length ? (
                    <span className="sp-chip">{t("home.grade", { grade: pack.gradeLevels.join(", ") })}</span>
                  ) : null}
                </div>
                <div className="sp-card__foot">
                  <span />
                  <button
                    type="button"
                    className="sp-btn"
                    disabled={starting === pack._id || pack.itemCount === 0}
                    onClick={() => start({ packId: pack._id })}
                  >
                    {t("home.practice")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="sp-empty">{t("home.noPacks")}</div>
        )}
      </section>

      <section className="sp-section">
        <div className="sp-section__head sp-section__head--rich">
          <span className="sp-sec-plate is-purple" aria-hidden="true"><HiOutlineTrendingUp size={14} /></span>
          <h3>{t("home.skillsTitle")}</h3>
          <Link className="sp-chip" to="/portal/skillpath/progress">
            {t("home.skillsLink")}
          </Link>
        </div>
        {data?.skills?.length ? (
          <div className="sp-card" style={{ padding: "4px 16px" }}>
            {data.skills.map((skill) => (
              <div key={skill.skillId} className="sp-skill-row">
                <div className="sp-skill-row__name">
                  <strong>{i18n.language === "ar" && skill.nameAr ? skill.nameAr : skill.name}</strong>
                  <span>{t("home.skillItems", { count: skill.distinctItems })}</span>
                </div>
                <div className="sp-skill-row__bar">
                  <div className="sp-bar" aria-hidden="true">
                    <i style={{ width: `${skill.accuracy || 0}%` }} />
                  </div>
                  <b>{skill.accuracy === null || skill.accuracy === undefined ? "—" : `${skill.accuracy}%`}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sp-empty">{t("home.noSkills")}</div>
        )}
      </section>
    </div>
  );
};

export default StudentSkillPathPage;
