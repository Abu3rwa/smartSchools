import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { selectUser } from "../../../store/slices/authSlice";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import subjectService from "../../../services/subjectService";
import teacherService from "../../../services/teacherService";
import classService from "../../../services/classService";
import studentService from "../../../services/studentService";
import "../../skillpath/skillpath.css";

const PERIODS = ["week", "month", "all"];
const NOTE_LIMIT = 300;

const Modal = ({ title, onClose, children }) => (
  <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className="sp-modal">
      <div className="sp-modal__head">
        <h3>{title}</h3>
        <button type="button" className="sp-icon-btn" onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="sp-modal__body">{children}</div>
    </div>
  </div>
);

const SkillPathBoardPage = () => {
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
        const [classResponse, subjectData] = await Promise.all([
          isAdmin
            ? classService.getClasses({ limit: "all" })
            : teacherService.getMyClasses(),
          subjectService.getSubjects({ limit: "all", isActive: true }).catch(() => null)
        ]);
        if (cancelled) return;
        const rows = classResponse?.data?.classes || classResponse?.classes || [];
        const byId = new Map();
        rows.forEach((row) => {
          const cls = row.class || row;
          if (cls?._id && !byId.has(String(cls._id))) byId.set(String(cls._id), cls);
        });
        const classes = Array.from(byId.values());
        setMeta({
          loading: false,
          error: null,
          classes,
          subjects: subjectData?.data?.subjects || []
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
  }, [isAdmin, t]);

  useEffect(() => {
    if (meta.loading || (scope === "class" && !classId)) return undefined;
    let cancelled = false;
    const load = async () => {
      setBoard((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const params = { scope, window: period, limit: 100 };
        if (scope === "class") params.classId = classId;
        if (subjectKey !== "all") params.subjectId = subjectKey;
        const data = await skillpathService.getLeaderboard(params);
        if (cancelled) return;
        setBoard({ loading: false, error: null, data });
        if (scope === "class") {
          const rewardData = await skillpathService.getClassRewards(classId).catch(() => ({ rewards: [] }));
          if (!cancelled) setRewards(rewardData?.rewards || []);
        } else {
          setRewards([]);
        }
      } catch (error) {
        if (cancelled) return;
        setBoard({
          loading: false,
          error: error?.response?.data?.message || t("errors.loadBoard"),
          data: null
        });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [meta.loading, scope, period, subjectKey, classId, refresh, t]);

  const data = board.data;
  const classDisabled = scope === "class" && data?.available === false && data?.reason === "class_disabled";
  const featureLocked = data?.available === false && data?.reason === "feature_locked";
  const classEnabled = !classDisabled;

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
      const rewardData = await skillpathService.getClassRewards(classId).catch(() => ({ rewards: [] }));
      setRewards(rewardData?.rewards || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    } finally {
      setSending(false);
    }
  };

  if (meta.loading) {
    return <div className="sp-page sp-loading">{t("common.loading")}</div>;
  }

  const rows = data?.available ? data.rows || [] : [];
  const periodLabel = (value) => t(`board.window${value.charAt(0).toUpperCase()}${value.slice(1)}`);

  return (
    <div className="sp-page sp-board" dir={i18n.dir()}>
      <header className="sp-header">
        <div>
          <h1>{t("board.title")}</h1>
          <p>{t("board.staffSubtitle")}</p>
        </div>
        <div className="sp-actions">
          <Link className="sp-btn sp-btn--ghost" to="/portal/skillpath-studio">{t("board.backStudio")}</Link>
        </div>
      </header>

      {meta.error ? <div className="sp-error">{meta.error}</div> : null}

      <div className="sp-board__controls">
        <div className="sp-chips" role="group" aria-label={t("board.scopeLabel")}>
          {meta.classes.length ? (
            <button
              type="button"
              className={`sp-chip sp-chip--btn${scope === "class" ? " is-active" : ""}`}
              aria-pressed={scope === "class"}
              onClick={() => setScope("class")}
            >
              {t("board.scopeClass")}
            </button>
          ) : null}
          <button
            type="button"
            className={`sp-chip sp-chip--btn${scope === "school" ? " is-active" : ""}`}
            aria-pressed={scope === "school"}
            onClick={() => setScope("school")}
          >
            {t("board.scopeSchool")}
          </button>
        </div>
        <div className="sp-chips" role="group" aria-label={t("board.windowLabel")}>
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              className={`sp-chip sp-chip--btn${period === value ? " is-active" : ""}`}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {periodLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {scope === "class" && meta.classes.length ? (
        <div className="sp-board__class-row">
          <label className="sp-board__class">
            <span>{t("board.classLabel")}</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              {meta.classes.map((cls) => (
                <option key={cls._id} value={String(cls._id)}>
                  {cls.name}{cls.section ? ` ${cls.section}` : ""}
                </option>
              ))}
            </select>
          </label>
          {!featureLocked ? (
            <label className="sp-check">
              <input
                type="checkbox"
                checked={classEnabled}
                disabled={toggling || board.loading}
                onChange={toggleClass}
              />
              <span>{t("board.toggleLabel")}</span>
            </label>
          ) : null}
          {data?.available ? (
            <button type="button" className="sp-btn" onClick={openReward}>
              {t("board.giveReward")}
            </button>
          ) : null}
        </div>
      ) : null}
      {scope === "class" && !meta.classes.length ? (
        <p className="sp-play__foot-note">{t("board.noClassesStaff")}</p>
      ) : null}
      {scope === "class" && !featureLocked ? (
        <p className="sp-play__foot-note">{t("board.toggleHint")}</p>
      ) : null}

      <div className="sp-chips sp-board__subjects" role="group" aria-label={t("studio.subject")}>
        <button
          type="button"
          className={`sp-chip sp-chip--btn${subjectKey === "all" ? " is-active" : ""}`}
          aria-pressed={subjectKey === "all"}
          onClick={() => setSubjectKey("all")}
        >
          {t("studio.subjectAll")}
        </button>
        {meta.subjects.map((subject) => (
          <button
            key={subject._id}
            type="button"
            className={`sp-chip sp-chip--btn${subjectKey === String(subject._id) ? " is-active" : ""}`}
            aria-pressed={subjectKey === String(subject._id)}
            onClick={() => setSubjectKey(String(subject._id))}
          >
            {subject.name}
          </button>
        ))}
        <button
          type="button"
          className={`sp-chip sp-chip--btn${subjectKey === "general" ? " is-active" : ""}`}
          aria-pressed={subjectKey === "general"}
          onClick={() => setSubjectKey("general")}
        >
          {t("studio.subjectGeneral")}
        </button>
      </div>

      {board.error ? <div className="sp-error">{board.error}</div> : null}
      {board.loading ? <div className="sp-loading">{t("common.loading")}</div> : null}

      {!board.loading && featureLocked ? (
        <div className="sp-empty">{t("board.offFeatureStaff")}</div>
      ) : null}
      {!board.loading && classDisabled ? (
        <div className="sp-empty">{t("board.offClassStaff")}</div>
      ) : null}

      {!board.loading && data?.available ? (
        rows.length ? (
          <div className="sp-scroll">
            <table className="sp-table sp-board__table">
              <thead>
                <tr>
                  <th>{t("board.colRank")}</th>
                  <th>{t("board.colStudent")}</th>
                  <th>{t("home.xp")}</th>
                  <th>{t("report.accuracy")}</th>
                  <th>{t("report.answered")}</th>
                  <th>{t("home.streakWeeks")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.rank}</td>
                    <td dir="auto">{row.displayName}</td>
                    <td dir="ltr">{row.xp}</td>
                    <td>{row.accuracy === null ? "—" : `${row.accuracy}%`}</td>
                    <td>{row.attempts}</td>
                    <td>{row.streakWeeks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sp-empty">{t("board.empty")}</div>
        )
      ) : null}

      {scope === "class" && data?.available ? (
        <section className="sp-board__rewards">
          <h2>{t("board.rewardsClassTitle")}</h2>
          {rewards.length ? (
            <div className="sp-board__reward-list">
              {rewards.map((reward) => (
                <div key={reward._id} className="sp-board__reward">
                  <strong dir="auto">{reward.studentName}</strong>
                  <p dir="auto">{reward.note}</p>
                  <span>
                    {t("board.rewardFrom", { name: reward.issuedByName })}
                    {" · "}
                    {t(`board.rewardPeriod.${reward.periodType}`, { defaultValue: reward.periodKey })}
                    {" · "}
                    {new Date(reward.createdAt).toLocaleDateString(i18n.language)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="sp-play__foot-note">{t("board.rewardsEmpty")}</p>
          )}
        </section>
      ) : null}

      {rewardForm ? (
        <Modal title={t("board.giveReward")} onClose={() => setRewardForm(null)}>
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

export default SkillPathBoardPage;