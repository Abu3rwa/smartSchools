import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlinePencilSquare,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import {
  dateLabel,
  errorText,
  pick,
  revisionConflict,
  statusTone,
} from "./supportUi.js";

const OUTCOMES = ["met", "partially_met", "not_met", "insufficient_evidence"];
const CHECKIN_OPTIONS = ["done", "didnt_fit", "need_help"];

const toEditor = (version) => ({
  headline: version.headline || "",
  headlineAr: version.headlineAr || "",
  summary: version.summary || "",
  summaryAr: version.summaryAr || "",
  studentEvidenceIncluded: version.studentEvidenceIncluded === true,
  goals: (version.goals || []).map((goal) => ({
    id: goal.id,
    concern: goal.concern,
    domain: goal.domain,
    subject: goal.subject,
    subjectName: goal.subjectName,
    sourceRole: goal.sourceRole,
    title: goal.title,
    titleAr: goal.titleAr,
    description: goal.description,
    descriptionAr: goal.descriptionAr,
    successLook: goal.successLook,
    successLookAr: goal.successLookAr,
    baseline: goal.baseline,
    targetDate: goal.targetDate,
    responsibleRole: goal.responsibleRole,
    homeTasks: goal.homeTasks,
    classTasks: goal.classTasks,
  })),
});

const CheckInButtons = ({ value, disabled, onChange, t }) => (
  <div className="support-task-controls" role="group">
    {CHECKIN_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        className={`support-task-status ${value === option ? `is-active is-${option}` : ""}`}
        aria-pressed={value === option}
        disabled={disabled}
        onClick={() => onChange(option)}
      >
        {option === "done" ? <HiOutlineCheck size={14} /> : option === "didnt_fit" ? <HiOutlineXMark size={14} /> : <HiOutlineArrowPath size={14} />}
        <span>{t(`plan.checkIn.${option}`)}</span>
      </button>
    ))}
  </div>
);

const GoalEditor = ({ goal, index, arabic, onChange, onRemove, canRemove, t }) => {
  const set = (key, value) => onChange(index, key, value);
  return (
    <fieldset className="support-fieldset support-goal-editor">
      <legend>
        {t("planEditor.goal", { n: index + 1 })}
        {goal.subjectName ? ` · ${goal.subjectName}` : ""}
      </legend>
      <div className="support-field-row is-two">
        <label>
          <span>{t("planEditor.goalTitle")}</span>
          <input value={goal.title} maxLength={200} onChange={(event) => set("title", event.target.value)} />
        </label>
        <label>
          <span>{t("planEditor.goalTitleAr")}</span>
          <input dir="rtl" value={goal.titleAr} maxLength={200} onChange={(event) => set("titleAr", event.target.value)} />
        </label>
      </div>
      <label className="support-field-row">
        <span>{t("planEditor.goalDescription")}</span>
        <textarea rows={2} maxLength={600} value={goal.description} onChange={(event) => set("description", event.target.value)} />
      </label>
      <label className="support-field-row">
        <span>{t("planEditor.goalDescriptionAr")}</span>
        <textarea dir="rtl" rows={2} maxLength={600} value={goal.descriptionAr} onChange={(event) => set("descriptionAr", event.target.value)} />
      </label>
      <div className="support-field-row is-two">
        <label>
          <span>{t("plan.successLook")}</span>
          <input value={goal.successLook} maxLength={400} onChange={(event) => set("successLook", event.target.value)} />
        </label>
        <label>
          <span>{t("planEditor.responsible")}</span>
          <select value={goal.responsibleRole || ""} onChange={(event) => set("responsibleRole", event.target.value)}>
            <option value="">{t("planEditor.responsibleNone")}</option>
            {["teacher", "counselor", "family", "student", "school"].map((role) => (
              <option key={role} value={role}>{t(`plan.responsible.${role}`)}</option>
            ))}
          </select>
        </label>
      </div>
      {goal.homeTasks.length > 0 && (
        <div className="support-goal-preview">
          <span>{t("plan.atHome")}</span>
          <ul>{goal.homeTasks.map((task) => <li key={task.id}>{pick(task.title, task.titleAr, arabic)}</li>)}</ul>
        </div>
      )}
      {goal.classTasks.length > 0 && (
        <div className="support-goal-preview">
          <span>{t("plan.inClass")}</span>
          <ul>{goal.classTasks.map((task) => <li key={task.id}>{pick(task.title, task.titleAr, arabic)}</li>)}</ul>
        </div>
      )}
      <button type="button" className="support-link-btn is-danger" disabled={!canRemove} onClick={() => onRemove(index)}>
        <HiOutlineTrash size={14} />
        {t("planEditor.removeGoal")}
      </button>
    </fieldset>
  );
};

const CasePlan = ({ data, reload }) => {
  const { t, i18n } = useTranslation("support");
  const arabic = String(i18n.language || "").startsWith("ar");
  const caseId = data.case.id;
  const canManage = data.case.canManage && data.case.status === "active";

  const [versions, setVersions] = useState([]);
  const [canApprove, setCanApprove] = useState(false);
  const [selectedId, setSelectedId] = useState(data.plan?.id || data.planVersions?.[0]?.id || "");
  const [editor, setEditor] = useState(null);
  const [outcomeNote, setOutcomeNote] = useState({});
  const [busy, setBusy] = useState("");

  const loadVersions = useCallback(async () => {
    try {
      const value = await supportService.getVersions(caseId);
      setVersions(value.versions || []);
      setCanApprove(value.canApprove === true);
      setSelectedId((current) => (
        (value.versions || []).some((row) => row.id === current)
          ? current
          : (value.versions || [])[0]?.id || ""
      ));
    } catch (error) {
      toast.error(errorText(error, t("errors.loadPlan")));
    }
  }, [caseId, t]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const selected = useMemo(
    () => versions.find((row) => row.id === selectedId) || null,
    [versions, selectedId],
  );

  useEffect(() => {
    setEditor(selected?.status === "draft" ? toEditor(selected) : null);
  }, [selected]);

  const startDraft = async (useAi) => {
    setBusy(useAi ? "draft-ai" : "draft-manual");
    try {
      const result = await supportService.draftPlan(caseId, { useAi });
      toast.success(t("planEditor.drafted", { version: result.version.version }));
      if (result.warnings?.length) {
        toast(t("planEditor.draftWarnings", { n: result.warnings.length }), { icon: "!" });
      }
      await loadVersions();
      setSelectedId(result.version.id);
      await reload();
    } catch (error) {
      toast.error(errorText(error, t("errors.draft")));
    } finally {
      setBusy("");
    }
  };

  const saveEditor = async () => {
    if (!editor || !selected) return;
    setBusy("save");
    try {
      const patch = {
        headline: editor.headline,
        headlineAr: editor.headlineAr,
        summary: editor.summary,
        summaryAr: editor.summaryAr,
        studentEvidenceIncluded: editor.studentEvidenceIncluded,
        goals: editor.goals,
      };
      const saved = await supportService.updateVersion(caseId, selected.id, selected.revision, patch);
      setVersions((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      toast.success(t("planEditor.saved"));
    } catch (error) {
      if (revisionConflict(error)) {
        toast.error(t("planEditor.conflict"));
        await loadVersions();
      } else {
        toast.error(errorText(error, t("errors.savePlan")));
      }
    } finally {
      setBusy("");
    }
  };

  const updateGoal = (index, key, value) => {
    setEditor((current) => {
      if (!current) return current;
      const goals = current.goals.map((goal, position) => (
        position === index ? { ...goal, [key]: value } : goal
      ));
      return { ...current, goals };
    });
  };

  const removeGoal = (index) => {
    setEditor((current) => {
      if (!current) return current;
      const goals = current.goals.filter((_, position) => position !== index);
      return { ...current, goals };
    });
  };

  const applyVersion = (version) => {
    setVersions((current) => current.map((row) => (row.id === version.id ? version : row)));
  };

  const approve = async () => {
    if (!selected) return;
    setBusy("approve");
    try {
      applyVersion(await supportService.approveVersion(caseId, selected.id));
      toast.success(t("planEditor.approved"));
      await loadVersions();
    } catch (error) {
      toast.error(errorText(error, t("errors.approve")));
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy("publish");
    try {
      const result = await supportService.publishVersion(caseId, selected.id);
      applyVersion(result.version);
      toast.success(t(result.alreadyPublished ? "planEditor.alreadyLive" : "planEditor.published", { n: result.notified || 0 }));
      await loadVersions();
      await reload();
    } catch (error) {
      toast.error(errorText(error, t("errors.publish")));
    } finally {
      setBusy("");
    }
  };

  const setOutcome = async (goal, value) => {
    if (!selected) return;
    setBusy(`outcome-${goal.id}`);
    try {
      applyVersion(await supportService.setGoalOutcome(caseId, selected.id, goal.id, {
        outcome: value,
        note: outcomeNote[goal.id] || goal.outcomeNote || "",
      }));
      toast.success(t("planEditor.outcomeSaved"));
    } catch (error) {
      toast.error(errorText(error, t("errors.outcome")));
    } finally {
      setBusy("");
    }
  };

  const checkIn = async (task, status) => {
    setBusy(`task-${task.id}`);
    try {
      await supportService.checkIn(caseId, { taskId: task.id, scope: "class", status });
      await reload();
      toast.success(t("planEditor.checkInSaved"));
    } catch (error) {
      toast.error(errorText(error, t("errors.checkIn")));
    } finally {
      setBusy("");
    }
  };

  const checkInFor = (taskId) => (data.checkIns || []).find((row) => row.taskId === taskId && row.scope === "class") || null;
  const publishedPlan = data.plan;
  const editingDraft = editor && selected?.status === "draft";

  return (
    <div className="support-plan-tab">
      <section className="support-card">
        <div className="support-card-head">
          <div>
            <h2>{t("planEditor.title")}</h2>
            <p className="support-muted">{t("planEditor.body")}</p>
          </div>
          {canManage && (
            <div className="support-card-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => startDraft(false)}>
                {busy === "draft-manual" ? t("common.working") : t("planEditor.draftManual")}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => startDraft(true)}>
                <HiOutlineSparkles size={15} />
                {busy === "draft-ai" ? t("common.working") : t("planEditor.draftAi")}
              </button>
            </div>
          )}
        </div>
        <p className="support-privacy-note">{t("planEditor.aiPrivacy")}</p>

        {versions.length === 0 ? (
          <p className="support-muted">{t("planEditor.none")}</p>
        ) : (
          <div className="support-version-list">
            {versions.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`support-version-row ${selectedId === row.id ? "is-active" : ""}`}
                onClick={() => setSelectedId(row.id)}
              >
                <span className="support-version-number">{t("planEditor.version", { n: row.version })}</span>
                <span className="support-version-meta">
                  {dateLabel(row.createdAt, i18n.language)}
                  {row.publishedAt ? ` · ${t("planEditor.liveSince", { date: dateLabel(row.publishedAt, i18n.language) })}` : ""}
                </span>
                <span className={`support-chip ${statusTone(row.status)}`}>{t(`planEditor.status.${row.status}`)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="support-card">
          <div className="support-card-head">
            <div>
              <h2>{selected.headline || t("planEditor.untitled")}</h2>
              <p className="support-muted">
                {t("planEditor.versionMeta", {
                  version: selected.version,
                  revision: selected.revision,
                })}
              </p>
            </div>
            <div className="support-card-actions">
              {selected.status === "draft" && canApprove && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={approve}>
                  <HiOutlineCheck size={15} />
                  {busy === "approve" ? t("common.working") : t("planEditor.approve")}
                </button>
              )}
              {["draft", "approved"].includes(selected.status) && canManage && (
                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={publish}>
                  {busy === "publish" ? t("common.working") : t("planEditor.publish")}
                </button>
              )}
              {editingDraft && (
                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={saveEditor}>
                  <HiOutlinePencilSquare size={15} />
                  {busy === "save" ? t("common.saving") : t("planEditor.save")}
                </button>
              )}
            </div>
          </div>

          {selected.focusKeys?.length > 0 && (
            <div className="support-tag-row">
              {selected.focusKeys.map((key) => (
                <em key={`focus-${key}`} className="is-focus">{t(`concern.${key}`, { defaultValue: key })}</em>
              ))}
              {selected.strengthKeys.map((key) => (
                <em key={`strength-${key}`} className="is-strength">{t(`concern.${key}`, { defaultValue: key })}</em>
              ))}
            </div>
          )}

          {editingDraft ? (
            <div className="support-plan-editor">
              <div className="support-field-row is-two">
                <label>
                  <span>{t("planEditor.headline")}</span>
                  <input
                    value={editor.headline}
                    maxLength={200}
                    onChange={(event) => setEditor((current) => ({ ...current, headline: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t("planEditor.headlineAr")}</span>
                  <input
                    dir="rtl"
                    value={editor.headlineAr}
                    maxLength={200}
                    onChange={(event) => setEditor((current) => ({ ...current, headlineAr: event.target.value }))}
                  />
                </label>
              </div>
              <label className="support-field-row">
                <span>{t("planEditor.summary")}</span>
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={editor.summary}
                  onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))}
                />
              </label>
              <label className="support-field-row">
                <span>{t("planEditor.summaryAr")}</span>
                <textarea
                  dir="rtl"
                  rows={3}
                  maxLength={1200}
                  value={editor.summaryAr}
                  onChange={(event) => setEditor((current) => ({ ...current, summaryAr: event.target.value }))}
                />
              </label>
              <label className="support-check is-inline">
                <input
                  type="checkbox"
                  checked={editor.studentEvidenceIncluded}
                  onChange={(event) => setEditor((current) => ({ ...current, studentEvidenceIncluded: event.target.checked }))}
                />
                <span>{t("planEditor.studentEvidence")}</span>
              </label>
              {editor.goals.map((goal, index) => (
                <GoalEditor
                  key={goal.id}
                  goal={goal}
                  index={index}
                  arabic={arabic}
                  onChange={updateGoal}
                  onRemove={removeGoal}
                  canRemove={editor.goals.length > 1}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <>
              {selected.summary && <p className="support-plan-summary">{pick(selected.summary, selected.summaryAr, arabic)}</p>}
              {selected.goals.map((goal, index) => (
                <article key={goal.id} className={`support-plan-goal is-${goal.domain}`}>
                  <header>
                    <span className="support-goal-n" aria-hidden="true">{index + 1}</span>
                    <div>
                      <h3>{pick(goal.title, goal.titleAr, arabic)}</h3>
                      <p className="support-goal-meta">
                        {[goal.subjectName, goal.sourceRole && t(`plan.sourceRole.${goal.sourceRole}`)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {goal.outcome && (
                      <span className={`support-chip ${goal.outcome === "met" ? "is-done" : goal.outcome === "not_met" ? "is-overdue" : "is-ready"}`}>
                        {t(`planEditor.outcomes.${goal.outcome}`)}
                      </span>
                    )}
                  </header>
                  {goal.description && <p>{pick(goal.description, goal.descriptionAr, arabic)}</p>}

                  {goal.homeTasks.length > 0 && (
                    <div className="support-plan-block">
                      <h4>{t("plan.atHome")}</h4>
                      <ul>
                        {goal.homeTasks.map((task) => <li key={task.id}>{pick(task.title, task.titleAr, arabic)}</li>)}
                      </ul>
                    </div>
                  )}

                  {goal.classTasks.length > 0 && (
                    <div className="support-plan-block">
                      <h4>{t("plan.inClass")}</h4>
                      <ul className="support-plan-tasks">
                        {goal.classTasks.map((task) => {
                          const checkInRow = publishedPlan?.id === selected.id ? checkInFor(task.id) : null;
                          return (
                            <li key={task.id}>
                              <span>{pick(task.title, task.titleAr, arabic)}</span>
                              {publishedPlan?.id === selected.id && canManage && (
                                <CheckInButtons
                                  value={checkInRow?.status || ""}
                                  disabled={busy === `task-${task.id}`}
                                  onChange={(status) => checkIn(task, status)}
                                  t={t}
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {goal.successLook && (
                    <p className="support-plan-success">
                      <span>{t("plan.successLook")}</span>
                      {pick(goal.successLook, goal.successLookAr, arabic)}
                    </p>
                  )}

                  {selected.status === "published" && canManage && (
                    <div className="support-goal-outcome">
                      <label>
                        <span>{t("planEditor.outcomeLabel")}</span>
                        <select
                          value={goal.outcome || ""}
                          disabled={busy === `outcome-${goal.id}`}
                          onChange={(event) => setOutcome(goal, event.target.value)}
                        >
                          <option value="">{t("planEditor.outcomeNone")}</option>
                          {OUTCOMES.map((option) => (
                            <option key={option} value={option}>{t(`planEditor.outcomes.${option}`)}</option>
                          ))}
                        </select>
                      </label>
                      <input
                        value={outcomeNote[goal.id] ?? goal.outcomeNote ?? ""}
                        maxLength={800}
                        placeholder={t("planEditor.outcomeNote")}
                        onChange={(event) => setOutcomeNote((current) => ({ ...current, [goal.id]: event.target.value }))}
                        onBlur={() => goal.outcome && setOutcome(goal, goal.outcome)}
                      />
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default CasePlan;
