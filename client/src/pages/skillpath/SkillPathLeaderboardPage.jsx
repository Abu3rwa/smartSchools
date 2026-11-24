import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { selectUser } from "../../store/slices/authSlice";
import { useFeatureNamespaces } from "../../i18n/useFeatureNamespaces";
import skillpathService from "../../services/skillpathService";
import subjectService from "../../services/subjectService";
import teacherService from "../../services/teacherService";
import classService from "../../services/classService";
import studentService from "../../services/studentService";
import OceanBackdrop from "../../components/skillpath/OceanBackdrop";
import Medal3D from "../../components/skillpath/Medal3D";
import { buildBoardParams, climbStatus, splitPodium } from "./utils/skillpathBoard";
import "./skillpath.css";

const PERIODS = ["week", "month", "all"];
const POLL_MS = 45000;
const NOTE_LIMIT = 300;

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

const HowToClimb = ({ t }) => (
  <section className="sp-board__rules" aria-label={t("board.howTitle")}>
    <div className="sp-board__rules-head">
      <span className="sp-board__rules-badge" aria-hidden="true">?</span>
      <h2>{t("board.howTitle")}</h2>
    </div>
    <ul className="sp-board__rules-list">
      <li>
        <strong>{t("board.howXpTitle")}</strong>
        <span>{t("board.howXp")}</span>
      </li>
      <li>
        <strong>{t("board.howCapTitle")}</strong>
        <span>{t("board.howCap")}</span>
      </li>
      <li>
        <strong>{t("board.howTieTitle")}</strong>
        <span>{t("board.howTie")}</span>
      </li>
      <li>
        <strong>{t("board.howStreakTitle")}</strong>
        <span>{t("board.howStreak")}</span>
      </li>
    </ul>
  </section>
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

const Switch = ({ checked, disabled, label, ariaLabel, onChange }) => (
  <label className="sp-switch">
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
    />
    <span className="sp-switch__track" aria-hidden="true" />
    <span className="sp-switch__text">{label}</span>
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

const Modal = ({ title, closeLabel, onClose, children }) => (
  <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className="sp-modal">
      <div className="sp-modal__head">
        <h3>{title}</h3>
        <button type="button" className="sp-icon-btn" onClick={onClose} aria-label={closeLabel}>×</button>
      </div>
      <div className="sp-modal__body">{children}</div>
    </div>
  </div>
);

const normalizeStaffClasses = (response) => {
  const rows = response?.data?.classes || response?.classes || [];
  const byId = new Map();
  rows.forEach((row) => {
    const cls = row.class || row;
    if (cls?._id && !byId.has(String(cls._id))) byId.set(String(cls._id), cls);
  });
  return Array.from(byId.values());
};

const SkillPathLeaderboardPage = ({ staff = false }) => {
  const { t, i18n } = useFeatureNamespaces(["skillpath"]);
  const user = useSelector(selectUser);
  const isAdmin = ["admin", "super_admin"].includes(user?.role)
    || (Array.isArray(user?.roles) && user.roles.some((role) => ["admin", "super_admin"].includes(role)));

  const [meta, setMeta] = useState({ loading: true, error: null, classes: [], subjects: [] });
  const [scope, setScope] = useState("class");
  const [period, setPeriod] = useState("week");
  const [subjectKey, setSubjectKey] = useState("all");
  const [classId, setClassId] = useState("");
  const [board, setBoard] = useState({ loading: true, error: null, data: null });
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [toggling, setToggling] = useState(false);
  const [rewardForm, setRewardForm] = useState(null);
  const [roster, setRoster] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const classesPromise = staff
          ? (isAdmin ? classService.getClasses({ limit: "all" }) : teacherService.getMyClasses())
          : skillpathService.getMyClasses();
        const [classData, subjectData, rewardData] = await Promise.all([
          classesPromise,
          subjectService.getSubjects({ limit: "all", isActive: true }).catch(() => null),
          staff ? null : skillpathService.getMyRewards().catch(() => null)
        ]);
        if (cancelled) return;
        const classes = staff ? normalizeStaffClasses(classData) : classData?.classes || [];
        setMeta({
          loading: false,
          error: null,
          classes,
          subjects: subjectData?.data?.subjects || []
        });
        // Staff rewards are fetched per class by the class-scope effect below.
        if (!staff) setRewards(rewardData?.rewards || []);
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
  }, [staff, isAdmin, t]);

  useEffect(() => {
    if (meta.loading || (scope === "class" && !classId)) return undefined;
    let cancelled = false;
    let timer = null;

    const load = async (quiet) => {
      if (!quiet) {
        setBoard((prev) => ({ ...prev, loading: true, error: null }));
      }
      try {
        const params = buildBoardParams({
          scope,
          period,
          subjectKey,
          classId,
          limit: staff ? 100 : undefined
        });
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
  }, [meta.loading, scope, period, subjectKey, classId, refresh, staff, t]);

  const available = board.data?.available === true;

  useEffect(() => {
    if (!staff) return undefined;
    if (scope !== "class" || !classId || !available) {
      setRewards([]);
      return undefined;
    }
    let cancelled = false;
    skillpathService.getClassRewards(classId)
      .then((data) => { if (!cancelled) setRewards(data?.rewards || []); })
      .catch(() => { if (!cancelled) setRewards([]); });
    return () => { cancelled = true; };
  }, [staff, scope, classId, available, refresh]);

  const data = board.data;
  const classDisabled = scope === "class" && data?.available === false && data?.reason === "class_disabled";
  const featureLocked = data?.available === false && data?.reason === "feature_locked";
  const classEnabled = !classDisabled;
  const rows = useMemo(() => (available ? data.rows || [] : []), [available, data]);
  const myRow = staff ? null : data?.myRow || null;
  const myStudentId = myRow?.studentId || null;
  const leaderXp = rows.length ? rows[0].xp : 0;
  const { podium, rest: listRows } = useMemo(() => splitPodium(rows), [rows]);
  const climb = useMemo(() => climbStatus(rows, myRow), [rows, myRow]);
  const hasPractice = rows.some((row) => row.xp > 0);
  const periodLabel = (value) => t(`board.window${value.charAt(0).toUpperCase()}${value.slice(1)}`);

  const toggleClass = async () => {
    if (toggling || !classId) return;
    setToggling(true);
    try {
      await skillpathService.setClassLeaderboard(classId, !classEnabled);
      toast.success(t(classEnabled ? "board.disabledToast" : "board.enabledToast"));
      setRefresh((value) => value + 1);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    } finally {
      setToggling(false);
    }
  };

  const openReward = useCallback(async () => {
    setRewardForm({ studentId: "", note: "", periodType: "week", periodKey: "" });
    setRoster([]);
    try {
      const response = await studentService.getStudentsByClass(classId);
      setRoster(response?.data?.students || []);
    } catch {
      setRoster([]);
    }
  }, [classId]);

  const sendReward = async (event) => {
    event.preventDefault();
    if (!rewardForm) return;
    if (!rewardForm.studentId) {
      toast.error(t("board.rewardStudentRequired"));
      return;
    }
    if (!rewardForm.note.trim()) {
      toast.error(t("board.rewardNoteRequired"));
      return;
    }
    setSending(true);
    try {
      await skillpathService.giveReward(classId, {
        studentId: rewardForm.studentId,
        note: rewardForm.note.trim(),
        periodType: rewardForm.periodType,
        ...(rewardForm.periodType === "custom" && rewardForm.periodKey.trim()
          ? { periodKey: rewardForm.periodKey.trim() }
          : {})
      });
      toast.success(t("board.rewardSent"));
      setRewardForm(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    } finally {
      setSending(false);
    }
  };

  if (meta.loading) {
    return <div className="sp-page sp-board sp-loading">{t("common.loading")}</div>;
  }

  return (
    <div className="sp-page sp-board sp-board--ocean sp-board--full" dir={i18n.dir()}>
      <OceanBackdrop />

      <header className="sp-board__top">
        <div className="sp-board__brand">
          <Medal3D />
          <div className="sp-board__brand-text">
            <h1>{t("board.title")}</h1>
            {staff ? null : <p>{t("board.subtitle")}</p>}
          </div>
        </div>
        <div className="sp-board__tools">
          <LiveStatus updatedAt={updatedAt} loading={board.loading} t={t} />

          {meta.classes.length ? (
            <PillSelect
              label={t("board.classLabel")}
              value={scope === "school" ? "__all" : classId}
              onChange={(value) => {
                if (value === "__all") {
                  setScope("school");
                  return;
                }
                setScope("class");
                setClassId(value);
              }}
            >
              {meta.classes.map((cls) => (
                <option key={cls._id} value={String(cls._id)}>
                  {cls.name}{cls.section ? ` ${cls.section}` : ""}
                </option>
              ))}
              <option value="__all">{t("board.scopeAll")}</option>
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

          {staff && scope === "class" && meta.classes.length && !featureLocked ? (
            <Switch
              checked={classEnabled}
              disabled={toggling || board.loading}
              label={t("board.toggleShort")}
              ariaLabel={t("board.toggleLabel")}
              onChange={toggleClass}
            />
          ) : null}

          {staff && scope === "class" && available ? (
            <button type="button" className="sp-board__reward-btn" onClick={openReward}>
              {t("board.giveReward")}
            </button>
          ) : null}

          <Link className="sp-btn sp-btn--ghost sp-board__back" to={staff ? "/portal/skillpath-studio" : "/portal/skillpath"}>
            {staff ? t("board.backStudio") : t("board.backHome")}
          </Link>
        </div>
      </header>

      {meta.error ? <div className="sp-error">{meta.error}</div> : null}

      {!meta.classes.length ? (
        <p className="sp-board__note">{staff ? t("board.noClassesStaff") : t("board.noClasses")}</p>
      ) : null}

      {board.error ? <div className="sp-error">{board.error}</div> : null}

      {board.loading ? (
        <div className="sp-board__skeleton" aria-hidden="true">
          <span /><span /><span />
        </div>
      ) : null}

      {!board.loading && featureLocked ? (
        <div className="sp-empty">{staff ? t("board.offFeatureStaff") : t("board.offFeature")}</div>
      ) : null}
      {!board.loading && classDisabled ? (
        <div className="sp-empty">{staff ? t("board.offClassStaff") : t("board.offClass")}</div>
      ) : null}

      {!board.loading && available && !staff ? <HowToClimb t={t} /> : null}

      {!board.loading && available ? (
        <section className="sp-board__arena">
          {podium.length ? <Podium rows={podium} myStudentId={myStudentId} t={t} /> : null}

          {myRow ? (
            <div className="sp-board__mine">
              <strong>{t("board.myRank", { rank: myRow.rank, total: data.totalRanked })}</strong>
              <span dir="ltr">{myRow.xp} {t("home.xp")}</span>
              <span>{myRow.accuracy === null ? "—" : `${myRow.accuracy}%`}</span>
              {climb?.kind === "gap" ? (
                <span className="sp-board__climb">
                  {t("board.climbGap", { gap: climb.gap, name: climb.aboveName })}
                </span>
              ) : null}
              {climb?.kind === "tie" ? (
                <span className="sp-board__climb">{t("board.climbTie", { name: climb.aboveName })}</span>
              ) : null}
              {climb?.kind === "top" ? (
                <span className="sp-board__climb">{t("board.climbTop")}</span>
              ) : null}
            </div>
          ) : null}

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
                    <span className="sp-board__attempts" dir="ltr" title={t("report.answered")}>{row.attempts}</span>
                    <span className="sp-board__streak" title={t("home.streakWeeks")}>
                      <Flame />{row.streakWeeks}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="sp-empty">{t("board.empty")}</div>
          )}
        </section>
      ) : null}

      {available || !staff ? (
        <section className="sp-board__rewards">
          <h2>{staff ? t("board.rewardsClassTitle") : t("board.rewardsTitle")}</h2>
          {rewards.length ? (
            <div className="sp-board__reward-list">
              {rewards.map((reward) => (
                <div key={reward._id} className="sp-board__reward">
                  {staff ? <strong dir="auto">{reward.studentName}</strong> : null}
                  <p dir="auto">{reward.note}</p>
                  <span>
                    {t("board.rewardFrom", { name: staff ? reward.issuedByName : reward.teacherName })}
                    {" · "}
                    {t(`board.rewardPeriod.${reward.periodType}`, { defaultValue: reward.periodKey })}
                    {" · "}
                    {new Date(reward.createdAt).toLocaleDateString(i18n.language)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="sp-board__note">{t(staff ? "board.rewardsEmptyStaff" : "board.rewardsEmpty")}</p>
          )}
        </section>
      ) : null}

      {rewardForm ? (
        <Modal title={t("board.giveReward")} closeLabel={t("common.close")} onClose={() => setRewardForm(null)}>
          <form className="sp-form" onSubmit={sendReward}>
            <label>
              <span>{t("board.rewardStudent")}</span>
              <select
                value={rewardForm.studentId}
                onChange={(event) => setRewardForm((prev) => ({ ...prev, studentId: event.target.value }))}
              >
                <option value="">{t("board.chooseStudent")}</option>
                {roster.map((student) => (
                  <option key={student._id} value={String(student._id)}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("board.rewardNote")}</span>
              <textarea
                rows={4}
                dir="auto"
                maxLength={NOTE_LIMIT}
                value={rewardForm.note}
                placeholder={t("board.rewardNotePlaceholder")}
                onChange={(event) => setRewardForm((prev) => ({ ...prev, note: event.target.value }))}
              />
              <span className="sp-play__foot-note">
                {t("board.rewardNoteCount", { count: rewardForm.note.length, max: NOTE_LIMIT })}
              </span>
            </label>
            <div className="sp-form__row">
              <label>
                <span>{t("board.rewardPeriodLabel")}</span>
                <select
                  value={rewardForm.periodType}
                  onChange={(event) => setRewardForm((prev) => ({ ...prev, periodType: event.target.value }))}
                >
                  <option value="week">{t("board.rewardPeriod.week")}</option>
                  <option value="month">{t("board.rewardPeriod.month")}</option>
                  <option value="custom">{t("board.rewardPeriod.custom")}</option>
                </select>
              </label>
              {rewardForm.periodType === "custom" ? (
                <label>
                  <span>{t("board.rewardCustomKey")}</span>
                  <input
                    type="text"
                    dir="auto"
                    maxLength={20}
                    value={rewardForm.periodKey}
                    onChange={(event) => setRewardForm((prev) => ({ ...prev, periodKey: event.target.value }))}
                  />
                </label>
              ) : null}
            </div>
            <div className="sp-actions">
              <button type="button" className="sp-btn" onClick={() => setRewardForm(null)}>{t("common.cancel")}</button>
              <button type="submit" className="sp-btn sp-btn--primary" disabled={sending}>
                {sending ? t("common.working") : t("board.giveReward")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};

export default SkillPathLeaderboardPage;
