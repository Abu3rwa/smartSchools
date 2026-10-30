import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCalendar,
  HiOutlineCheck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineEnvelope,
  HiOutlinePlus,
  HiOutlineUserPlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportService from "../../../../services/supportService.js";
import { setCurrentAcademicYear } from "../../../../store/slices/uiSlice";
import "./SupportHubPage.css";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const isArabic = (language) => String(language || "").startsWith("ar");
const pick = (en, ar, arabic) => (arabic ? ar || en : en || ar);

const monthLabel = (month, language) => {
  const date = new Date(2026, Number(month) - 1, 1);
  return new Intl.DateTimeFormat(isArabic(language) ? "ar-EG" : "en-GB", { month: "long" }).format(date);
};

const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const statusTone = (status) => ({
  submitted: "done",
  opened: "open",
  sent: "waiting",
  draft: "waiting",
  published: "live",
  approved: "ready",
  closed: "muted",
}[status] || "waiting");

const SurveyStatusChip = ({ status }) => {
  const { t } = useTranslation("support");
  return <span className={`support-chip is-${statusTone(status)}`}>{t(`status.${status}`, { defaultValue: status })}</span>;
};

const CodeDialog = ({ codes, onClose }) => {
  const { t } = useTranslation("support");
  if (!codes?.length) return null;
  const copyAll = async () => {
    const text = codes.map((entry) => `${entry.name}: ${entry.code}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("codes.copied"));
    } catch {
      toast.error(t("codes.copyFailed"));
    }
  };
  return (
    <div className="support-modal-backdrop" role="dialog" aria-modal="true" aria-label={t("codes.title")}>
      <div className="support-modal">
        <div className="support-modal-head">
          <div>
            <h2>{t("codes.title")}</h2>
            <p>{t("codes.body")}</p>
          </div>
          <button type="button" className="support-icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <HiOutlineXMark size={18} />
          </button>
        </div>
        <ul className="support-code-list">
          {codes.map((entry) => (
            <li key={`${entry.name}-${entry.code}`}>
              <span>{entry.name}</span>
              <code>{entry.code}</code>
            </li>
          ))}
        </ul>
        <div className="support-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={copyAll}>
            {t("codes.copyAll")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
};

const TaskRow = ({ task, scope, onCheckIn, busy, readOnly, t }) => {
  const [note, setNote] = useState(task.note2 || "");
  const [noteOpen, setNoteOpen] = useState(false);

  const statuses = scope === "class"
    ? [
        { key: "done", label: t("plan.done"), icon: <HiOutlineCheck size={14} /> },
        { key: "didnt_fit", label: t("plan.didntFit"), icon: <HiOutlineXMark size={14} /> },
        { key: "need_help", label: t("plan.needHelp"), icon: <HiOutlineArrowPath size={14} /> },
      ]
    : [];

  return (
    <li className={`support-task ${task.status ? `is-${task.status}` : ""}`}>
      <div className="support-task-main">
        <span className="support-task-title">{task.title}</span>
        {task.note && <span className="support-task-note">{task.note}</span>}
      </div>
      {scope === "class" && !readOnly && (
        <div className="support-task-controls">
          <div className="support-task-status" role="group" aria-label={t("plan.checkInLabel")}>
            {statuses.map((status) => (
              <button
                key={status.key}
                type="button"
                className={`support-status-btn is-${status.key} ${task.status === status.key ? "is-active" : ""}`}
                disabled={busy}
                aria-pressed={task.status === status.key}
                onClick={() => onCheckIn(task.id, status.key, note)}
              >
                {status.icon}
                <span>{status.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="support-note-toggle" onClick={() => setNoteOpen((open) => !open)}>
            {noteOpen ? t("plan.hideNote") : t("plan.addNote")}
          </button>
          {noteOpen && (
            <input
              className="support-note-input"
              value={note}
              maxLength={300}
              placeholder={t("plan.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => task.status && onCheckIn(task.id, task.status, note)}
            />
          )}
        </div>
      )}
      {scope === "home" && task.status && (
        <span className={`support-family-mark is-${task.status}`}>
          {t(`plan.familyMark.${task.status}`)}
        </span>
      )}
    </li>
  );
};

const PlanPanel = ({ detail, actionBusy, onDraft, onApprove, onPublish, onCheckIn }) => {
  const { t, i18n } = useTranslation("support");
  const arabic = isArabic(i18n.language);
  const plan = detail.plan;
  const submitted = (detail.surveys || []).filter((survey) => survey.status === "submitted").length;

  if (!plan) {
    return (
      <section className="support-card support-plan-panel">
        <div className="support-card-head">
          <h2>{t("plan.title")}</h2>
        </div>
        <div className="support-empty-inline">
          <HiOutlineClipboardDocumentCheck size={30} />
          <p>{submitted > 0 ? t("plan.readyToDraft") : t("plan.waitingForSurveys")}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitted === 0 || actionBusy}
          onClick={onDraft}
        >
          {actionBusy ? t("plan.drafting") : t("plan.createDraft")}
        </button>
      </section>
    );
  }

  const tone = statusTone(plan.status);

  return (
    <section className="support-card support-plan-panel">
      <div className="support-card-head">
        <h2>{t("plan.title")}</h2>
        <span className={`support-chip is-${tone}`}>{t(`plan.status.${plan.status}`)}</span>
      </div>

      <p className="support-plan-source">
        {t("plan.builtFrom", { teachers: plan.teacherCount, parents: plan.parentCount })}
      </p>

      <div className="support-goals">
        {plan.goals.map((goal) => (
          <article key={goal.id} className={`support-goal is-${goal.domain}`}>
            <div className="support-goal-head">
              <span className={`support-domain is-${goal.domain}`}>{t(`domain.${goal.domain}`)}</span>
              <h3>{pick(goal.title, goal.titleAr, arabic)}</h3>
              <p>{pick(goal.description, goal.descriptionAr, arabic)}</p>
            </div>
            <div className="support-goal-columns">
              <div className="support-goal-column">
                <h4>{t("plan.atHome")}</h4>
                <ul>
                  {goal.homeTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                      scope="home"
                      t={t}
                      readOnly
                      busy={actionBusy}
                      onCheckIn={onCheckIn}
                    />
                  ))}
                </ul>
              </div>
              <div className="support-goal-column">
                <h4>{t("plan.inClass")}</h4>
                <ul>
                  {goal.classTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={{ ...task, title: pick(task.title, task.titleAr, arabic), note: pick(task.note, task.noteAr, arabic) }}
                      scope="class"
                      t={t}
                      busy={actionBusy}
                      readOnly={plan.status !== "published"}
                      onCheckIn={onCheckIn}
                    />
                  ))}
                </ul>
              </div>
            </div>
            <p className="support-success">
              <span>{t("plan.successLook")}</span>
              {pick(goal.successLook, goal.successLookAr, arabic)}
            </p>
          </article>
        ))}
      </div>

      <div className="support-plan-footer">
        <div className="support-progress-inline">
          <span>{t("plan.classProgress")}</span>
          <strong>{plan.classProgress.done}/{plan.classProgress.total}</strong>
        </div>
        <div className="support-progress-inline">
          <span>{t("plan.homeProgress")}</span>
          <strong>{plan.homeProgress.done}/{plan.homeProgress.total}</strong>
        </div>
        {plan.status === "draft" && (
          <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={onApprove}>
            {actionBusy ? t("plan.saving") : t("plan.approve")}
          </button>
        )}
        {plan.status === "approved" && (
          <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={onPublish}>
            {actionBusy ? t("plan.publishing") : t("plan.publish")}
          </button>
        )}
      </div>
    </section>
  );
};

const SurveysPanel = ({ detail, actionBusy, inviteBusy, onInvite, onNewCode, onAddExternal }) => {
  const { t } = useTranslation("support");
  const [form, setForm] = useState({ name: "", email: "", subjectId: "" });
  const [formOpen, setFormOpen] = useState(false);
  const pending = detail.respondents.filter((row) => row.surveyStatus !== "submitted");

  const submit = async (event) => {
    event.preventDefault();
    const ok = await onAddExternal(form);
    if (ok) {
      setForm({ name: "", email: "", subjectId: "" });
      setFormOpen(false);
    }
  };

  return (
    <section className="support-card support-surveys-panel">
      <div className="support-card-head">
        <h2>{t("surveys.title")}</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={inviteBusy || pending.length === 0}
          onClick={() => onInvite(pending.map((row) => row.id))}
        >
          <HiOutlineEnvelope size={15} />
          {inviteBusy ? t("surveys.sending") : t("surveys.sendAll")}
        </button>
      </div>
      <p className="support-muted">{t("surveys.body")}</p>

      <ul className="support-respondent-list">
        {detail.respondents.map((row) => (
          <li key={row.id + (row.subject?.id || "")} className="support-respondent">
            <span className="support-avatar" aria-hidden="true">{initials(row.name)}</span>
            <div className="support-respondent-main">
              <strong>{row.name}</strong>
              <span>{row.audience === "parent" ? t("surveys.parent") : row.subject?.name || t("surveys.teacher")}</span>
              <span className="support-respondent-meta">
                {row.email || t("surveys.noEmail")}
                {row.codeHint && <em> · {t("surveys.codeHint")} {row.codeHint}</em>}
              </span>
            </div>
            <div className="support-respondent-actions">
              <SurveyStatusChip status={row.surveyStatus} />
              {row.surveyStatus !== "submitted" && (
                <>
                  <button
                    type="button"
                    className="support-icon-btn"
                    title={t("surveys.send")}
                    aria-label={t("surveys.send")}
                    disabled={inviteBusy || actionBusy}
                    onClick={() => onInvite([row.id])}
                  >
                    <HiOutlineEnvelope size={16} />
                  </button>
                  <button
                    type="button"
                    className="support-icon-btn"
                    title={t("surveys.newCode")}
                    aria-label={t("surveys.newCode")}
                    disabled={actionBusy}
                    onClick={() => onNewCode(row.id, row.name)}
                  >
                    <HiOutlineArrowPath size={16} />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!formOpen ? (
        <button type="button" className="support-link-btn" onClick={() => setFormOpen(true)}>
          <HiOutlineUserPlus size={15} />
          {t("surveys.addTeacher")}
        </button>
      ) : (
        <form className="support-external-form" onSubmit={submit}>
          <p>{t("surveys.addTeacherBody")}</p>
          <div className="support-field-row">
            <label>
              <span>{t("surveys.teacherName")}</span>
              <input
                value={form.name}
                required
                maxLength={120}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              <span>{t("surveys.teacherEmail")}</span>
              <input
                type="email"
                value={form.email}
                required
                maxLength={200}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label>
              <span>{t("surveys.subject")}</span>
              <select
                value={form.subjectId}
                required
                onChange={(event) => setForm({ ...form, subjectId: event.target.value })}
              >
                <option value="">{t("surveys.chooseSubject")}</option>
                {detail.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="support-form-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFormOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={actionBusy}>
              {actionBusy ? t("surveys.adding") : t("surveys.add")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

const SupportHubPage = () => {
  const { t, i18n } = useTranslation("support");
  const dispatch = useDispatch();

  const [classes, setClasses] = useState([]);
  const [academicYear, setAcademicYear] = useState("");
  const [classId, setClassId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [codes, setCodes] = useState([]);

  const loadClasses = useCallback(async () => {
    try {
      const data = await supportService.getClasses();
      setClasses(data.classes || []);
      setAcademicYear(data.academicYear || "");
      // The API falls back to the school's current year when a homeroom-scoped account
      // has no class in the requested year; sync the global year so cycle and create
      // calls below use the same effective year.
      if (data.academicYear && data.academicYear !== localStorage.getItem("currentAcademicYear")) {
        dispatch(setCurrentAcademicYear(data.academicYear));
      }
      setClassId((current) => current || data.classes?.[0]?.id || "");
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast.error(error.response?.data?.message || t("errors.loadClasses"));
    } finally {
      setLoading(false);
    }
  }, [t, dispatch]);

  const loadOverview = useCallback(async (nextClassId = classId, nextMonth = month) => {
    if (!nextClassId) return;
    setOverviewBusy(true);
    try {
      const data = await supportService.getClassCycles({ classId: nextClassId, month: nextMonth });
      setOverview(data);
      setAcademicYear(data.academicYear || "");
    } catch (error) {
      setOverview(null);
      toast.error(error.response?.data?.message || t("errors.loadCycles"));
    } finally {
      setOverviewBusy(false);
    }
  }, [classId, month, t]);

  useEffect(() => { loadClasses(); }, [loadClasses]);
  useEffect(() => {
    if (classId) loadOverview(classId, month);
  }, [classId, month, loadOverview]);

  const openCycle = async (cycleId) => {
    if (!cycleId) return;
    setDetailBusy(true);
    try {
      const data = await supportService.getCycle(cycleId);
      setDetail(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.loadCycle"));
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshDetail = async () => {
    if (detail?.cycle?.id) await openCycle(detail.cycle.id);
    await loadOverview();
  };

  const startMonth = async () => {
    if (!classId) return;
    setActionBusy(true);
    try {
      const result = await supportService.createCycles({ classId, month });
      const createdCodes = (result.parentCodes || []).map((entry) => ({
        name: entry.student?.name || "",
        code: entry.code,
      }));
      if (createdCodes.length) setCodes(createdCodes);
      toast.success(t("cycles.created", { created: result.cyclesCreated }));
      await loadOverview();
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.create"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDraft = async () => {
    setActionBusy(true);
    try {
      const plan = await supportService.generateDraft(detail.cycle.id);
      setDetail((current) => ({ ...current, plan }));
      toast.success(t("plan.draftCreated"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.draft"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = async () => {
    setActionBusy(true);
    try {
      const plan = await supportService.approvePlan(detail.cycle.id);
      setDetail((current) => ({ ...current, plan }));
      toast.success(t("plan.approved"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.approve"));
    } finally {
      setActionBusy(false);
    }
  };

  const handlePublish = async () => {
    setActionBusy(true);
    try {
      const plan = await supportService.publishPlan(detail.cycle.id);
      setDetail((current) => ({ ...current, plan }));
      toast.success(t("plan.published"));
      await refreshDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.publish"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckIn = async (taskId, status, note) => {
    setActionBusy(true);
    try {
      const saved = await supportService.checkIn(detail.cycle.id, { taskId, status, note });
      setDetail((current) => {
        const goals = current.plan.goals.map((goal) => ({
          ...goal,
          classTasks: goal.classTasks.map((task) => (
            task.id === saved.taskId
              ? { ...task, status: saved.status, note2: saved.note, updatedAt: saved.updatedAt }
              : task
          )),
        }));
        const done = goals.reduce((sum, goal) => sum + goal.classTasks.filter((task) => task.status === "done").length, 0);
        const total = goals.reduce((sum, goal) => sum + goal.classTasks.length, 0);
        return {
          ...current,
          plan: { ...current.plan, goals, classProgress: { ...current.plan.classProgress, done, total } },
        };
      });
    } catch (error) {
      toast.error(error.response?.data?.message || t("errors.checkIn"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleInvite = async (respondentIds) => {
    setInviteBusy(true);
    try {
      const result = await supportService.sendInvites(detail.cycle.id, respondentIds);
      if (result.sent > 0) {
        toast.success(t("surveys.sent", { sent: result.sent }));
      } else {
        const reason = result.results?.find((row) => row.reason)?.reason;
        toast.error(reason === "no-email" ? t("surveys.noEmailForSend") : t("surveys.sendFailed"));
      }
      await refreshDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || t("surveys.sendFailed"));
    } finally {
      setInviteBusy(false);
    }
  };

  const handleNewCode = async (respondentId, name) => {
    setActionBusy(true);
    try {
      const result = await supportService.rotateCode(detail.cycle.id, respondentId);
      setCodes([{ name, code: result.code }]);
      await refreshDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || t("codes.resetFailed"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddExternal = async (form) => {
    setActionBusy(true);
    try {
      const result = await supportService.addExternalTeacher(detail.cycle.id, form);
      setCodes([{ name: form.name, code: result.code }]);
      toast.success(t("surveys.teacherAdded"));
      await refreshDetail();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || t("surveys.addFailed"));
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const summary = useMemo(() => {
    const rows = overview?.rows || [];
    const surveysTotal = rows.reduce((sum, row) => sum + row.counts.total, 0);
    const surveysSubmitted = rows.reduce((sum, row) => sum + row.counts.submitted, 0);
    const published = rows.filter((row) => row.plan?.status === "published").length;
    return { students: rows.length, surveysTotal, surveysSubmitted, published };
  }, [overview]);

  if (loading) {
    return (
      <div className="support-hub">
        <div className="loading-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (loadFailed && !classes.length) {
    return (
      <div className="support-hub">
        <header className="support-hub-header">
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("subtitle")}</p>
        </header>
        <div className="support-empty">
          <h2>{t("loadError.title")}</h2>
          <p>{t("loadError.body")}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setLoading(true); loadClasses(); }}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!classes.length) {
    return (
      <div className="support-hub">
        <header className="support-hub-header">
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("subtitle")}</p>
        </header>
        <div className="support-empty">
          <HiOutlineUserPlus size={44} />
          <h2>{t("noClasses.title")}</h2>
          <p>{t("noClasses.body")}</p>
          {academicYear && (
            <p className="support-empty-year">
              <HiOutlineCalendar size={14} />
              {t("noClasses.yearNote", { year: academicYear })}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="support-hub">
      <header className="support-hub-header">
        <div>
          <h1>{t("title")}</h1>
          <p className="text-muted">
            {t("subtitle")}
            {academicYear && (
              <span className="support-year-chip">
                <HiOutlineCalendar size={13} />
                {academicYear}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="support-toolbar">
        <label>
          <span>{t("toolbar.class")}</span>
          <select value={classId} onChange={(event) => { setDetail(null); setClassId(event.target.value); }}>
            {classes.map((classRoom) => (
              <option key={classRoom.id} value={classRoom.id}>
                {classRoom.name}{classRoom.section ? ` · ${classRoom.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("toolbar.month")}</span>
          <select value={month} onChange={(event) => { setDetail(null); setMonth(Number(event.target.value)); }}>
            {MONTHS.map((value) => (
              <option key={value} value={value}>{monthLabel(value, i18n.language)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={actionBusy || overviewBusy} onClick={startMonth}>
          <HiOutlinePlus size={16} />
          {actionBusy ? t("toolbar.starting") : t("toolbar.startMonth")}
        </button>
      </div>

      {!detail ? (
        <>
          {overviewBusy && !overview ? (
            <div className="loading-container"><div className="spinner" /></div>
          ) : (
            <>
              <div className="support-summary-strip">
                <div><strong>{summary.students}</strong><span>{t("summary.students")}</span></div>
                <div><strong>{summary.surveysSubmitted}/{summary.surveysTotal}</strong><span>{t("summary.surveys")}</span></div>
                <div><strong>{summary.published}</strong><span>{t("summary.published")}</span></div>
              </div>

              <div className="support-roster">
                <div className="support-roster-head" aria-hidden="true">
                  <span>{t("table.student")}</span>
                  <span>{t("table.surveys")}</span>
                  <span>{t("table.plan")}</span>
                  <span />
                </div>
                {(overview?.rows || []).map((row) => (
                  <div key={row.student.id} className="support-roster-row">
                    <div className="support-roster-student">
                      <span className="support-avatar" aria-hidden="true">{initials(row.student.name)}</span>
                      <div>
                        <strong>{row.student.name}</strong>
                        <span>{row.student.class}</span>
                      </div>
                    </div>
                    <div className="support-roster-surveys">
                      {row.cycleId ? (
                        <>
                          <span className="support-mini-count">
                            {t("table.teacherCount", { done: row.counts.teacherSubmitted, total: row.counts.teacherTotal })}
                          </span>
                          <span className="support-mini-count">
                            {t("table.parentCount", { done: row.counts.parentSubmitted || 0, total: row.counts.parentTotal || 0 })}
                          </span>
                        </>
                      ) : (
                        <span className="support-muted">{t("table.notStarted")}</span>
                      )}
                    </div>
                    <div className="support-roster-plan">
                      {row.plan ? <SurveyStatusChip status={row.plan.status} /> : <span className="support-muted">—</span>}
                    </div>
                    <div className="support-roster-action">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!row.cycleId || detailBusy}
                        onClick={() => openCycle(row.cycleId)}
                      >
                        {t("table.open")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {summary.students > 0 && summary.surveysTotal === 0 && (
                <p className="support-start-hint">{t("toolbar.startHint", { month: monthLabel(month, i18n.language) })}</p>
              )}
            </>
          )}
        </>
      ) : (
        <div className="support-detail">
          <button type="button" className="support-back" onClick={() => setDetail(null)}>
            <HiOutlineArrowLeft size={15} />
            {t("detail.back")}
          </button>

          <div className="support-detail-head">
            <div className="support-detail-person">
              <span className="support-avatar is-large" aria-hidden="true">{initials(detail.cycle.student?.name)}</span>
              <div>
                <h2>{detail.cycle.student?.name}</h2>
                <p>
                  {detail.cycle.student?.class}
                  <span> · {monthLabel(detail.cycle.month, i18n.language)} {detail.cycle.academicYear}</span>
                </p>
              </div>
            </div>
            <div className="support-detail-status">
              <span className="support-muted">{t("detail.round", { round: detail.cycle.round })}</span>
              {detail.plan && <SurveyStatusChip status={detail.plan.status} />}
            </div>
          </div>

          <div className="support-detail-grid">
            <PlanPanel
              detail={detail}
              actionBusy={actionBusy}
              onDraft={handleDraft}
              onApprove={handleApprove}
              onPublish={handlePublish}
              onCheckIn={handleCheckIn}
            />
            <SurveysPanel
              detail={detail}
              actionBusy={actionBusy}
              inviteBusy={inviteBusy}
              onInvite={handleInvite}
              onNewCode={handleNewCode}
              onAddExternal={handleAddExternal}
            />
            <section className="support-card support-comment-panel">
              <div className="support-card-head">
                <h2>{t("comments.title")}</h2>
              </div>
              {detail.comments.length === 0 ? (
                <p className="support-muted">{t("comments.empty")}</p>
              ) : (
                <ul className="support-comment-list">
                  {detail.comments.map((comment, index) => (
                    <li key={index}>
                      <span>{comment.audience === "parent" ? t("comments.parent") : comment.subject || t("comments.teacher")}</span>
                      <p>{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <CodeDialog codes={codes} onClose={() => setCodes([])} />
    </div>
  );
};

export default SupportHubPage;
