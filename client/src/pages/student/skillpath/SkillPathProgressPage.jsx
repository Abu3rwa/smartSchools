import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import "../../skillpath/skillpath.css";

const Stat = ({ value, label, hint }) => (
  <div className="sp-stat">
    <strong>{value}</strong>
    <span>{label}</span>
    {hint ? <span style={{ display: "block", marginTop: 2 }}>{hint}</span> : null}
  </div>
);

const SkillPathProgressPage = () => {
  const { t, i18n } = useFeatureNamespaces(["skillpath"]);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await skillpathService.getStudentProgress();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({
        loading: false,
        error: error?.response?.data?.message || t("errors.loadProgress"),
        data: null
      });
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const data = state.data;
  const profile = data?.profile;
  const totals = data?.totals || { attempts: 0, correct: 0, firstAttemptCorrect: 0 };
  const practiceAccuracy = totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : null;
  const firstTryAccuracy = totals.attempts > 0
    ? Math.round((totals.firstAttemptCorrect / totals.attempts) * 100)
    : null;
  const goal = profile?.weeklyGoalDays || 3;
  const days = useMemo(
    () => Array.from({ length: goal }, (_, index) => index < (data?.week?.daysThisWeek || 0)),
    [goal, data?.week?.daysThisWeek]
  );

  if (state.loading && !data) {
    return <div className="sp-page sp-loading">{t("common.loading")}</div>;
  }

  if (state.error && !data) {
    return (
      <div className="sp-page">
        <div className="sp-error">{state.error}</div>
        <button type="button" className="sp-btn" onClick={load}>{t("common.retry")}</button>
      </div>
    );
  }

  return (
    <div className="sp-page" dir={i18n.dir()}>
      <header className="sp-header">
        <div>
          <h1>{t("progress.title")}</h1>
          <p>{t("progress.subtitle")}</p>
        </div>
        <div className="sp-actions">
          <Link className="sp-btn" to="/portal/skillpath">{t("progress.backHome")}</Link>
        </div>
      </header>

      <section className="sp-hero">
        <div className="sp-hero__text">
          <span className="sp-hero__kicker">{t("progress.kicker")}</span>
          <h2>{t("progress.levelTitle", { level: profile?.level || 1 })}</h2>
          <p>{t("progress.xpToNext", { xp: profile?.intoLevel || 0, next: profile?.nextLevelAt || 100 })}</p>
          <div className="sp-bar" style={{ marginTop: 12 }} aria-hidden="true">
            <i
              style={{
                width: `${profile ? Math.min(100, Math.round((profile.intoLevel / profile.nextLevelAt) * 100)) : 0}%`
              }}
            />
          </div>
        </div>
        <div className="sp-hero__stats">
          <Stat value={profile?.xp || 0} label={t("home.xp")} />
          <Stat value={profile?.streakWeeks || 0} label={t("home.streakWeeks")} />
          <Stat value={profile?.longestStreakWeeks || 0} label={t("progress.longestStreak")} />
        </div>
      </section>

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("progress.thisWeek")}</h3>
        </div>
        <div className="sp-card">
          <div className="sp-goal" aria-label={t("home.weekGoal", { done: data?.week?.daysThisWeek || 0, goal })}>
            {days.map((done, index) => (
              <span key={index} className={`sp-goal__dot${done ? " is-done" : ""}`} aria-hidden="true">
                {done ? "✓" : index + 1}
              </span>
            ))}
          </div>
          <p>{t("home.weekGoal", { done: data?.week?.daysThisWeek || 0, goal })}</p>
          <p>{t("progress.streakHint")}</p>
        </div>
      </section>

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("progress.evidenceTitle")}</h3>
        </div>
        <div className="sp-card">
          <div className="sp-hero__stats" style={{ gap: "var(--spacing-xl)" }}>
            <Stat value={totals.attempts} label={t("progress.answersLogged")} />
            <Stat
              value={practiceAccuracy === null ? "—" : `${practiceAccuracy}%`}
              label={t("progress.practiceAccuracy")}
              hint={t("progress.ofAnswers", { correct: totals.correct, total: totals.attempts })}
            />
            <Stat
              value={firstTryAccuracy === null ? "—" : `${firstTryAccuracy}%`}
              label={t("progress.firstTry")}
              hint={t("progress.firstTryHint")}
            />
          </div>
          <p className="sp-play__foot-note" style={{ marginTop: 10 }}>{t("progress.evidenceNote")}</p>
        </div>
      </section>

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("progress.skillsTitle")}</h3>
        </div>
        {data?.skills?.length ? (
          <div className="sp-card" style={{ padding: "4px 16px" }}>
            {data.skills.map((skill) => (
              <div key={skill.skillId} className="sp-skill-row">
                <div className="sp-skill-row__name">
                  <strong>{i18n.language === "ar" && skill.nameAr ? skill.nameAr : skill.name}</strong>
                  <span>
                    {t("progress.skillDetail", {
                      items: skill.distinctItems,
                      answers: skill.attempts
                    })}
                  </span>
                </div>
                <div className="sp-skill-row__bar">
                  <div className="sp-bar" aria-hidden="true">
                    <i style={{ width: `${skill.accuracy || 0}%` }} />
                  </div>
                  <b>{skill.accuracy === null ? "—" : `${skill.accuracy}%`}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sp-empty">{t("progress.noSkills")}</div>
        )}
      </section>

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("progress.sessionsTitle")}</h3>
        </div>
        {data?.sessions?.length ? (
          <div className="sp-card">
            {data.sessions.map((session) => (
              <div key={session._id} className="sp-skill-row">
                <div className="sp-skill-row__name">
                  <strong>{session.mode === "quiz" ? t("home.modeQuiz") : t("home.modePractice")}</strong>
                  <span>
                    {session.completedAt
                      ? new Date(session.completedAt).toLocaleDateString(i18n.language)
                      : ""}
                  </span>
                </div>
                <div className="sp-skill-row__bar" style={{ justifyContent: "flex-end" }}>
                  <span className="sp-chip">
                    {t("progress.sessionScore", {
                      correct: session.correct,
                      total: session.answered
                    })}
                  </span>
                  <b>{session.accuracy === null ? "—" : `${session.accuracy}%`}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sp-empty">{t("progress.noSessions")}</div>
        )}
      </section>
    </div>
  );
};

export default SkillPathProgressPage;
