import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import supportService from "../../services/supportService.js";
import { errorText } from "./supportUi.js";

const LABELS = ["support", "intervention", "wellbeing", "learning_support"];
const APPROVAL_MODES = ["owner_release", "counselor_approve", "admin_approve"];
const OWNER_FALLBACKS = ["homeroom", "nominator", "counselor", "admin"];
const NOTIFICATIONS = ["invitation", "reminder", "reminderEscalation", "planPublished", "closure"];
const INTEGRATIONS = ["parentUpdates", "newsletter", "observations"];

const toForm = (settings) => ({
  enabled: settings.enabled === true,
  label: settings.label,
  roles: [...(settings.roles || [])],
  approvalMode: settings.approvalMode,
  ownerFallback: settings.ownerFallback,
  caseloadCap: settings.caseloadCap,
  studentAgeMin: settings.studentAgeMin,
  studentAgeMax: settings.studentAgeMax,
  defaultSurveyLength: settings.defaultSurveyLength,
  maxSurveyLength: settings.maxSurveyLength,
  reminderDays: settings.reminderDays,
  reminderCount: settings.reminderCount,
  autoSuggestions: settings.autoSuggestions === true,
  aiPlanDrafts: settings.aiPlanDrafts === true,
  suggestionWindowDays: settings.suggestionWindowDays,
  suggestionAttendanceRate: settings.suggestionAttendanceRate,
  suggestionFailingGrades: settings.suggestionFailingGrades,
  suggestionBehaviorIncidents: settings.suggestionBehaviorIncidents,
  severityCadence: { ...(settings.severityCadence || {}) },
  notifications: { ...(settings.notifications || {}) },
  integrations: { ...(settings.integrations || {}) },
});

const NumberField = ({ label, hint, value, min, max, disabled, onChange }) => (
  <label>
    <span>{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    {hint && <em className="support-field-hint">{hint}</em>}
  </label>
);

const Toggle = ({ label, checked, disabled, onChange }) => (
  <label className="support-check is-inline">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const SettingsPanel = ({ onChange }) => {
  const { t } = useTranslation("support");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await supportService.getSettings();
      setData(value);
      setForm(toForm(value.settings));
    } catch (error) {
      toast.error(errorText(error, t("errors.loadSettings")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setNested = (group, key, value) => setForm((current) => ({
    ...current,
    [group]: { ...current[group], [key]: value },
  }));

  const toggleRole = (role) => {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((row) => row !== role)
        : [...current.roles, role],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await supportService.updateSettings(form);
      setData(updated);
      setForm(toForm(updated.settings));
      toast.success(t("settings.saved"));
      if (onChange) onChange();
    } catch (error) {
      toast.error(errorText(error, t("errors.saveSettings")));
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = () => {
    if (!data?.defaults) return;
    setForm(toForm(data.defaults));
  };

  if (loading || !form) {
    return <div className="support-empty-inline"><div className="spinner" /></div>;
  }

  const canManage = data?.canManage === true;
  const disabled = !canManage;

  return (
    <div className="support-settings">
      <div className="support-settings-head">
        <div>
          <h2>{t("settings.title")}</h2>
          <p className="support-muted">{t("settings.body")}</p>
        </div>
        {canManage && (
          <div className="support-card-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={resetDefaults}>
              {t("settings.resetDefaults")}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        )}
      </div>

      {!canManage && <p className="support-muted">{t("settings.readOnly")}</p>}

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.general")}</h2></div>
        <div className="support-field-row is-three">
          <label>
            <span>{t("settings.label")}</span>
            <select value={form.label} disabled={disabled} onChange={(event) => set("label", event.target.value)}>
              {LABELS.map((key) => <option key={key} value={key}>{t(`settings.labelOption.${key}`)}</option>)}
            </select>
          </label>
          <Toggle
            label={t("settings.enabled")}
            checked={form.enabled}
            disabled={disabled}
            onChange={(value) => set("enabled", value)}
          />
        </div>
        <p className="support-field-hint">{t("settings.enabledHint")}</p>
        <fieldset className="support-fieldset">
          <legend>{t("settings.roles")}</legend>
          <p className="support-muted">{t("settings.rolesBody")}</p>
          <div className="support-check-grid is-compact">
            {(data.availableRoles || []).map((role) => (
              <label key={role} className="support-check">
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  disabled={disabled}
                  onChange={() => toggleRole(role)}
                />
                <span><strong>{t(`settings.role.${role}`)}</strong></span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.workflow")}</h2></div>
        <div className="support-field-row is-three">
          <label>
            <span>{t("settings.approvalMode")}</span>
            <select value={form.approvalMode} disabled={disabled} onChange={(event) => set("approvalMode", event.target.value)}>
              {APPROVAL_MODES.map((key) => <option key={key} value={key}>{t(`settings.approval.${key}`)}</option>)}
            </select>
          </label>
          <label>
            <span>{t("settings.ownerFallback")}</span>
            <select value={form.ownerFallback} disabled={disabled} onChange={(event) => set("ownerFallback", event.target.value)}>
              {OWNER_FALLBACKS.map((key) => <option key={key} value={key}>{t(`settings.fallback.${key}`)}</option>)}
            </select>
          </label>
          <NumberField
            label={t("settings.caseloadCap")}
            hint={t("settings.caseloadHint")}
            value={form.caseloadCap}
            min={0}
            max={50}
            disabled={disabled}
            onChange={(value) => set("caseloadCap", value)}
          />
        </div>
        <div className="support-field-row is-three">
          {["watch", "support", "intensive"].map((severity) => (
            <NumberField
              key={severity}
              label={t("settings.cadence", { severity: t(`severity.${severity}`) })}
              value={form.severityCadence[severity]}
              min={1}
              max={365}
              disabled={disabled}
              onChange={(value) => setNested("severityCadence", severity, value)}
            />
          ))}
        </div>
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.surveys")}</h2></div>
        <div className="support-field-row is-three">
          <NumberField
            label={t("settings.studentAgeMin")}
            value={form.studentAgeMin}
            min={0}
            max={25}
            disabled={disabled}
            onChange={(value) => set("studentAgeMin", value)}
          />
          <NumberField
            label={t("settings.studentAgeMax")}
            value={form.studentAgeMax}
            min={0}
            max={25}
            disabled={disabled}
            onChange={(value) => set("studentAgeMax", value)}
          />
          <NumberField
            label={t("settings.defaultSurveyLength")}
            value={form.defaultSurveyLength}
            min={1}
            max={20}
            disabled={disabled}
            onChange={(value) => set("defaultSurveyLength", value)}
          />
        </div>
        <p className="support-field-hint">{t("settings.studentAgeHint")}</p>
        <div className="support-field-row is-three">
          <NumberField
            label={t("settings.maxSurveyLength")}
            value={form.maxSurveyLength}
            min={1}
            max={20}
            disabled={disabled}
            onChange={(value) => set("maxSurveyLength", value)}
          />
          <NumberField
            label={t("settings.reminderDays")}
            value={form.reminderDays}
            min={1}
            max={30}
            disabled={disabled}
            onChange={(value) => set("reminderDays", value)}
          />
          <NumberField
            label={t("settings.reminderCount")}
            value={form.reminderCount}
            min={0}
            max={5}
            disabled={disabled}
            onChange={(value) => set("reminderCount", value)}
          />
        </div>
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.suggestions")}</h2></div>
        <Toggle
          label={t("settings.autoSuggestions")}
          checked={form.autoSuggestions}
          disabled={disabled}
          onChange={(value) => set("autoSuggestions", value)}
        />
        <p className="support-field-hint">{t("settings.autoSuggestionsHint")}</p>
        <div className="support-field-row is-three">
          <NumberField
            label={t("settings.suggestionWindowDays")}
            value={form.suggestionWindowDays}
            min={7}
            max={180}
            disabled={disabled}
            onChange={(value) => set("suggestionWindowDays", value)}
          />
          <NumberField
            label={t("settings.suggestionAttendanceRate")}
            value={form.suggestionAttendanceRate}
            min={1}
            max={100}
            disabled={disabled}
            onChange={(value) => set("suggestionAttendanceRate", value)}
          />
          <NumberField
            label={t("settings.suggestionFailingGrades")}
            value={form.suggestionFailingGrades}
            min={1}
            max={20}
            disabled={disabled}
            onChange={(value) => set("suggestionFailingGrades", value)}
          />
        </div>
        <NumberField
          label={t("settings.suggestionBehaviorIncidents")}
          value={form.suggestionBehaviorIncidents}
          min={1}
          max={20}
          disabled={disabled}
          onChange={(value) => set("suggestionBehaviorIncidents", value)}
        />
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.notifications")}</h2></div>
        <div className="support-check-grid is-compact">
          {NOTIFICATIONS.map((key) => (
            <Toggle
              key={key}
              label={t(`settings.notify.${key}`)}
              checked={form.notifications[key] === true}
              disabled={disabled}
              onChange={(value) => setNested("notifications", key, value)}
            />
          ))}
        </div>
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.ai")}</h2></div>
        <Toggle
          label={t("settings.aiPlanDrafts")}
          checked={form.aiPlanDrafts}
          disabled={disabled}
          onChange={(value) => set("aiPlanDrafts", value)}
        />
        <p className="support-field-hint">{t("settings.aiPlanDraftsHint")}</p>
      </section>

      <section className="support-card">
        <div className="support-card-head"><h2>{t("settings.integrations")}</h2></div>
        <div className="support-check-grid is-compact">
          {INTEGRATIONS.map((key) => (
            <Toggle
              key={key}
              label={t(`settings.integration.${key}`)}
              checked={form.integrations[key] === true}
              disabled={disabled}
              onChange={(value) => setNested("integrations", key, value)}
            />
          ))}
        </div>
      </section>

      {canManage && (
        <div className="support-settings-footer">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
