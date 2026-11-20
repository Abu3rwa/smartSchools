import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import subjectService from "../../../services/subjectService";
import OceanBackdrop from "../../../components/skillpath/OceanBackdrop";
import "../../skillpath/skillpath.css";

const PERIODS = ["week", "month", "all"];
const POLL_MS = 45000;

const Trophy = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    <path d="M12 14v3M8.5 20h7M10 17h4l.7 3H9.3l.7-3Z" />
  </svg>
);

const Flame = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2c.6 3-1.7 4.3-3 6-1.4 1.8-2 3.4-2 5a5 5 0 0 0 10 0c0-1.2-.4-2.3-1-3.2-.3 1-1 1.7-1.8 2 .6-2.4-.2-5.4-2.2-7.8C11.4 3.3 11.7 2.6 12 2Z" />
  </svg>
);

const Chevron = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Crown = ({ rank }) => (
  <span className={`sp-board__crown sp-board__crown--${rank}`} aria-hidden="true">
    {rank === 1 ? (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.6 9.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L3 8Z" /></svg>
    ) : (
      <span className="sp-board__crown-num">{rank}</span>
    )}
  </span>
);

const Podium = ({ rows, myStudentId, t }) => (
  <div className="sp-board__podium">
    {rows.map((row, index) => (
      <div
        key={row.studentId}
        className={`sp-board__spot sp-board__spot--${row.rank}${row.studentId === myStudentId ? " is-me" : ""}`}
        style={{ "--i": index }}
      >
        <Crown rank={row.rank} />
        <span className="sp-board__avatar" aria-hidden="true">{row.displayName.trim().charAt(0)}</span>
        <span className="sp-board__spot-id">
          <strong dir="auto">{row.displayName}</strong>
          {row.studentId === myStudentId ? <span className="sp-board__you">{t("board.you")}</span> : null}
        </span>
        <span className="sp-board__xp" dir="ltr">{row.xp} {t("home.xp")}</span>
        <span className="sp-board__acc">{row.accuracy === null ? "—" : `${row.accuracy}%`}</span>
      </div>
    ))}
  </div>
);

const PillSelect = ({ label, value, onChange, children }) => (
  <label className="sp-pill">
    <span className="sp-pill__label">{label}</span>
    <span className="sp-pill__box">
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {children}
      </select>
      <Chevron className="sp-pill__chevron" />
    </span>
  </label>
);

const LiveStatus = ({ updatedAt, loading, t }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  let updated = null;
  if (!loading && seconds !== null) {
    if (seconds < 10) updated = t("board.updatedNow");
    else if (seconds < 60) updated = t("board.updatedSeconds", { count: seconds });
    else updated = t("board.updatedMinutes", { count: Math.floor(seconds / 60) });
  }

  return (
    <span className="sp-live">
      <i className="sp-live__dot" aria-hidden="true" />
      <span className="sp-live__text">
        {updated ? `${t("board.live")} · ${updated}` : t("board.live")}
      </span>
    </span>
  );
};

const SkillPathLeaderboardPage = () => {
  const { t, i18n } = useFeatureNamespaces(["skillpath"]);

  const [meta, setMeta] = useState({ loading: true, error: null, classes: [], subjects: [], rewards: [] });
  const [scope, setScope] = useState("class");
  const [period, setPeriod] = useState("week");
  const [subjectKey, setSubjectKey] = useState("all");
  const [classId, setClassId] = useState("");
  const [board, setBoard] = useState({ loading: true, error: null, data: null });
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [classData, subjectData, rewardData] = await Promise.all([
          skillpathService.getMyClasses(),
          subjectService.getSubjects({ limit: "all", isActive: true }),
          skillpathService.getMyRewards()
        ]);
        if (cancelled) return;
        const classes = classData?.classes || [];
        setMeta({
          loading: false,
          error: null,
          classes,
          subjects: subjectData?.data?.subjects || [],
          rewards: rewardData?.rewards || []
        });
        if (classes.length) {
          setClassId(String(classes[0]._id));
        } else {
          setScope("school");
        }
      } catch (error) {
        if (cancelled) return;
        setMeta((prev) => ({
          ...prev,
          loading: false,
          error: error?.response?.data?.message || t("errors.loadBoard")
        }));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (meta.loading || (scope === "class" && !classId)) return undefined;
    let cancelled = false;
    let timer = null;

    const load = async (quiet) => {
      if (!quiet) {
        setBoard((prev) => ({ ...prev, loading: true, error: null }));
      }
      try {
        const params = { scope, window: period };
        if (scope === "class") params.classId = classId;
        if (subjectKey !== "all") params.subjectId = subjectKey;
        const data = await skillpathService.getLeaderboard(params);
        if (cancelled) return;
        setBoard({ loading: false, error: null, data });
        setUpdatedAt(Date.now());
      } catch (error) {
        if (cancelled) return;
        setBoard((prev) => ({
          loading: false,
          error: error?.response?.data?.message || t("errors.loadBoard"),
          data: quiet ? prev.data : null
        }));
      }
    };

    const startPolling = () => {
      if (timer || document.hidden) return;
      timer = setInterval(() => load(true), POLL_MS);
    };
    const stopPolling = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
        load(true);
      }
    };

    load(false);
    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [meta.loading, scope, period, subjectKey, classId, t]);

  const data = board.data;
  const rows = useMemo(() => (data?.available ? data.rows || [] : []), [data]);
  const myRow = data?.myRow || null;
  const myStudentId = myRow?.studentId || null;
  const leaderXp = rows.length ? rows[0].xp : 0;
  const podium = rows.filter((row) => row.xp > 0).slice(0, 3);
  const podiumIds = new Set(podium.map((row) => row.studentId));
  const listRows = rows.filter((row) => !podiumIds.has(row.studentId));
  const periodLabel = (value) => t(`board.window${value.charAt(0).toUpperCase()}${value.slice(1)}`);
  const hasPractice = rows.some((row) => row.xp > 0);

  if (meta.loading) {
    return <div className="sp-page sp-board sp-loading">{t("common.loading")}</div>;
  }

  return (
    <div className="sp-page sp-board sp-board--ocean" dir={i18n.dir()}>
      <OceanBackdrop />

      <header className="sp-board__top">
        <div className="sp-board__brand">
          <span className="sp-board__trophy"><Trophy /></span>
          <div className="sp-board__brand-text">
            <h1>{t("board.title")}</h1>
            <p>{t("board.subtitle")}</p>
          </div>
        </div>
        <div className="sp-board__tools">
          <LiveStatus updatedAt={updatedAt} loading={board.loading} t={t} />

          {scope === "class" && meta.classes.length ? (
            <PillSelect label={t("board.classLabel")} value={classId} onChange={setClassId}>
              {meta.classes.map((cls) => (
                <option key={cls._id} value={String(cls._id)}>
                  {cls.name}{cls.section ? ` ${cls.section}` : ""}
                </option>
              ))}
            </PillSelect>
          ) : null}

          <PillSelect label={t("board.windowLabel")} value={period} onChange={setPeriod}>
            {PERIODS.map((value) => (
              <option key={value} value={value}>{periodLabel(value)}</option>
            ))}
          </PillSelect>

          <PillSelect label={t("studio.subject")} value={subjectKey} onChange={setSubjectKey}>
            <option value="all">{t("studio.subjectAll")}</option>
            {meta.subjects.map((subject) => (
              <option key={subject._id} value={String(subject._id)}>{subject.name}</option>
            ))}
            <option value="general">{t("studio.subjectGeneral")}</option>
          </PillSelect>

          {meta.classes.length ? (
            <PillSelect label={t("board.scopeLabel")} value={scope} onChange={setScope}>
              <option value="class">{t("board.scopeClass")}</option>
              <option value="school">{t("board.scopeSchool")}</option>
            </PillSelect>
          ) : null}

          <Link className="sp-btn sp-btn--ghost sp-board__back" to="/portal/skillpath">{t("board.backHome")}</Link>
        </div>
      </header>

      {meta.error ? <div className="sp-error">{meta.error}</div> : null}

      {!meta.classes.length ? (
        <p className="sp-board__note">{t("board.noClasses")}</p>
      ) : null}

      {board.error ? <div className="sp-error">{board.error}</div> : null}

      {board.loading ? (
        <div className="sp-board__skeleton" aria-hidden="true">
          <span /><span /><span />
        </div>
      ) : null}

      {!board.loading && data && !data.available ? (
        <div className="sp-empty">
          {data.reason === "class_disabled" ? t("board.offClass") : t("board.offFeature")}
        </div>
      ) : null}

      {!board.loading && data?.available ? (
        <section className="sp-board__arena">
          {podium.length ? <Podium rows={podium} myStudentId={myStudentId} t={t} /> : null}

          {rows.length ? (
            <>
              {!hasPractice ? <p className="sp-board__note sp-board__note--first">{t("board.beFirst")}</p> : null}
              <ol className="sp-board__list">
                {listRows.map((row, index) => (
                  <li
                    key={row.studentId}
                    className={`sp-board__row${row.studentId === myStudentId ? " is-me" : ""}`}
                    style={{ "--i": index }}
                  >
                    <span className="sp-board__rank" dir="ltr">{row.rank}</span>
                    <span className="sp-board__avatar" aria-hidden="true">{row.displayName.trim().charAt(0)}</span>
                    <span className="sp-board__name" dir="auto">
                      {row.displayName}
                      {row.studentId === myStudentId ? <span className="sp-board__you">{t("board.you")}</span> : null}
                    </span>
                    <span className="sp-board__meter" aria-hidden="true">
                      <span style={{ width: `${leaderXp > 0 ? Math.round((row.xp / leaderXp) * 100) : 0}%` }} />
                    </span>
                    <span className="sp-board__xp" dir="ltr">{row.xp} {t("home.xp")}</span>
                    <span className="sp-board__acc">{row.accuracy === null ? "—" : `${row.accuracy}%`}</span>
                    <span className="sp-board__streak" title={t("home.streakWeeks")}>
                      <Flame />{row.streakWeeks}
                    </span>
                  </li>
                ))}
              </ol>
              {myRow && !myRow.inTop ? (
                <div className="sp-board__mine">
                  <strong>{t("board.myRank", { rank: myRow.rank, total: data.totalRanked })}</strong>
                  <span dir="ltr">{myRow.xp} {t("home.xp")}</span>
                  <span>{myRow.accuracy === null ? "—" : `${myRow.accuracy}%`}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="sp-empty">{t("board.empty")}</div>
          )}
          <p className="sp-board__note">{t("play.xpNote")}</p>
        </section>
      ) : null}

      <section className="sp-board__rewards">
        <h2>{t("board.rewardsTitle")}</h2>
        {meta.rewards.length ? (
          <div className="sp-board__reward-list">
            {meta.rewards.map((reward) => (
              <div key={reward._id} className="sp-board__reward">
                <p dir="auto">{reward.note}</p>
                <span>
                  {t("board.rewardFrom", { name: reward.teacherName })}
                  {" · "}
                  {t(`board.rewardPeriod.${reward.periodType}`, { defaultValue: reward.periodKey })}
                  {" · "}
                  {new Date(reward.createdAt).toLocaleDateString(i18n.language)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="sp-board__note">{t("board.rewardsEmpty")}</p>
        )}
      </section>
    </div>
  );
};

export default SkillPathLeaderboardPage;