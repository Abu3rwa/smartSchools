import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineSave } from 'react-icons/hi';
import { saveBehaviorSettings } from '../../../../api/behaviorApi';
import {
    BEHAVIOR_APPROVER_ROLES,
    BEHAVIOR_COUNTING_MODES,
    BEHAVIOR_TASK_TYPES,
    BEHAVIOR_VERIFIER_RULES,
    BEHAVIOR_ROLE_OPTIONS
} from './consequenceConstants';

const ROLE_CHIPS = BEHAVIOR_ROLE_OPTIONS;

const Toggle = ({ checked, onChange, children, disabled }) => (
    <label className="bc-check">
        <input type="checkbox" checked={Boolean(checked)} onChange={onChange} disabled={disabled} />
        {children}
    </label>
);

const ChipGroup = ({ options, selected = [], onToggle, disabled }) => (
    <div className="bc-chips">
        {options.map((option) => (
            <button
                type="button"
                key={option}
                className={`bc-chip ${selected.includes(option) ? 'is-on' : ''}`}
                onClick={() => onToggle(option)}
                disabled={disabled}
            >
                {option}
            </button>
        ))}
    </div>
);

const RulesSetupPanel = ({ isAdmin, settings, onSaved }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setForm(settings || null);
        setLoaded(Boolean(settings));
    }, [settings]);

    if (!loaded || !form) return <div className="bc-loading">{t('common.loading')}</div>;

    const setPath = (path, value) => setForm((prev) => {
        const next = { ...prev };
        const keys = path.split('.');
        let cursor = next;
        keys.forEach((key, index) => {
            if (index === keys.length - 1) {
                cursor[key] = value;
                return;
            }
            cursor[key] = { ...(cursor[key] || {}) };
            cursor = cursor[key];
        });
        return next;
    });

    const toggleRole = (path, role) => {
        const current = path.split('.').reduce((cursor, key) => cursor?.[key], form) || [];
        setPath(path, current.includes(role)
            ? current.filter((entry) => entry !== role)
            : [...current, role]);
    };

    const setVerifierRule = (taskType, patch) => setForm((prev) => {
        const rows = [...(prev.verifier?.perTaskType || [])];
        const index = rows.findIndex((row) => row.taskType === taskType);
        if (index === -1) {
            rows.push({ taskType, rule: 'logging-staff', role: null, ...patch });
        } else {
            rows[index] = { ...rows[index], ...patch };
        }
        return { ...prev, verifier: { ...(prev.verifier || {}), perTaskType: rows } };
    });

    const save = async () => {
        setSaving(true);
        try {
            const payload = await saveBehaviorSettings({
                enabled: form.enabled,
                counting: form.counting,
                approval: {
                    defaultRequired: form.approval?.defaultRequired,
                    approverRoles: form.approval?.approverRoles || [],
                    backupApproverRoles: form.approval?.backupApproverRoles || [],
                    reminderIntervalHours: form.approval?.reminderIntervalHours,
                    escalationAfterHours: form.approval?.escalationAfterHours
                },
                cc: { roles: form.cc?.roles || [] },
                sendDelayMinutes: form.sendDelayMinutes,
                sendDelayMaxMinutes: form.sendDelayMaxMinutes,
                verifier: form.verifier,
                duplicateWindowMinutes: form.duplicateWindowMinutes,
                apologyMinWords: form.apologyMinWords,
                seriousIncident: { allowedRoles: form.seriousIncident?.allowedRoles || [] },
                // The whole nested block is replaced on save, so every field in it
                // has to go back, including the switch itself.
                emailDelivery: {
                    enabled: form.emailDelivery?.enabled === true,
                    defaultLanguage: form.emailDelivery?.defaultLanguage || 'en',
                    supportedLanguages: form.emailDelivery?.supportedLanguages?.length
                        ? form.emailDelivery.supportedLanguages
                        : ['en']
                }
            });
            toast.success(t('setup.savedToast'));
            setForm(payload?.settings || form);
            onSaved?.(payload?.settings);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('setup.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('setup.rulesTitle')}</h2>
                    <p>{isAdmin ? t('setup.rulesSubtitle') : t('setup.readOnlyHint')}</p>
                </div>
                {isAdmin && (
                    <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                        <HiOutlineSave /> {saving ? t('common.saving') : t('common.saveChanges')}
                    </button>
                )}
            </div>

            <div className="bc-sections">
                <div className="bc-section">
                    <h3>{t('setup.featureTitle')}</h3>
                    <Toggle
                        checked={form.enabled}
                        disabled={!isAdmin}
                        onChange={(event) => setPath('enabled', event.target.checked)}
                    >
                        {t('setup.featureEnabled')}
                    </Toggle>
                    <p className="bc-hint">{t('setup.featureHint')}</p>
                </div>

                <div className="bc-section">
                    <h3>{t('setup.countingTitle')}</h3>
                    <div className="bc-field">
                        <label htmlFor="bc-counting-mode">{t('setup.countingMode')}</label>
                        <select
                            id="bc-counting-mode"
                            value={form.counting?.mode || 'school_year'}
                            onChange={(event) => setPath('counting.mode', event.target.value)}
                            disabled={!isAdmin}
                        >
                            {BEHAVIOR_COUNTING_MODES.map((mode) => (
                                <option key={mode} value={mode}>{t(`countingModes.${mode}`)}</option>
                            ))}
                        </select>
                        <p className="bc-hint">{t(`countingHints.${form.counting?.mode || 'school_year'}`)}</p>
                    </div>

                    {form.counting?.mode === 'rolling_days' && (
                        <div className="bc-field">
                            <label htmlFor="bc-rolling-days">{t('setup.rollingDays')}</label>
                            <input
                                id="bc-rolling-days"
                                type="number"
                                min="1"
                                max="366"
                                value={form.counting?.rollingDays ?? 90}
                                onChange={(event) => setPath('counting.rollingDays', Number(event.target.value))}
                                disabled={!isAdmin}
                            />
                        </div>
                    )}

                    <div className="bc-field">
                        <label htmlFor="bc-academic-year">{t('setup.academicYear')}</label>
                        <input
                            id="bc-academic-year"
                            value={form.counting?.academicYear || ''}
                            onChange={(event) => setPath('counting.academicYear', event.target.value || null)}
                            placeholder={t('setup.academicYearPlaceholder')}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="bc-field">
                        <label htmlFor="bc-duplicate-window">{t('setup.duplicateWindow')}</label>
                        <input
                            id="bc-duplicate-window"
                            type="number"
                            min="0"
                            max="1440"
                            value={form.duplicateWindowMinutes ?? 30}
                            onChange={(event) => setPath('duplicateWindowMinutes', Number(event.target.value))}
                            disabled={!isAdmin}
                        />
                        <p className="bc-hint">{t('setup.duplicateWindowHint')}</p>
                    </div>
                </div>

                <div className="bc-section">
                    <h3>{t('setup.approvalTitle')}</h3>
                    <Toggle
                        checked={form.approval?.defaultRequired}
                        disabled={!isAdmin}
                        onChange={(event) => setPath('approval.defaultRequired', event.target.checked)}
                    >
                        {t('setup.approvalDefault')}
                    </Toggle>
                    <p className="bc-hint">{t('setup.approvalDefaultHint')}</p>

                    <div className="bc-field">
                        <label>{t('setup.approverRoles')}</label>
                        <ChipGroup
                            options={ROLE_CHIPS}
                            selected={form.approval?.approverRoles || BEHAVIOR_APPROVER_ROLES}
                            onToggle={(role) => toggleRole('approval.approverRoles', role)}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="bc-field">
                        <label>{t('setup.backupRoles')}</label>
                        <ChipGroup
                            options={ROLE_CHIPS}
                            selected={form.approval?.backupApproverRoles || []}
                            onToggle={(role) => toggleRole('approval.backupApproverRoles', role)}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="bc-form-grid">
                        <div className="bc-field">
                            <label htmlFor="bc-reminder-hours">{t('setup.reminderHours')}</label>
                            <input
                                id="bc-reminder-hours"
                                type="number"
                                min="1"
                                max="168"
                                value={form.approval?.reminderIntervalHours ?? 24}
                                onChange={(event) => setPath('approval.reminderIntervalHours', Number(event.target.value))}
                                disabled={!isAdmin}
                            />
                        </div>
                        <div className="bc-field">
                            <label htmlFor="bc-escalation-hours">{t('setup.escalationHours')}</label>
                            <input
                                id="bc-escalation-hours"
                                type="number"
                                min="1"
                                max="720"
                                value={form.approval?.escalationAfterHours ?? 48}
                                onChange={(event) => setPath('approval.escalationAfterHours', Number(event.target.value))}
                                disabled={!isAdmin}
                            />
                        </div>
                    </div>

                    <div className="bc-alert bc-alert-info">
                        <div>
                            <strong>{t('setup.noAutoSend')}</strong>
                            {t('setup.noAutoSendBody')}
                        </div>
                    </div>
                </div>

                <div className="bc-section">
                    <h3>{t('setup.notificationTitle')}</h3>
                    <Toggle
                        checked={form.emailDelivery?.enabled}
                        disabled={!isAdmin}
                        onChange={(event) => setPath('emailDelivery.enabled', event.target.checked)}
                    >
                        {t('setup.emailDeliveryToggle')}
                    </Toggle>
                    <p className="bc-hint">{t('setup.emailDeliveryHint')}</p>

                    <div className="bc-field">
                        <label>{t('setup.ccRoles')}</label>
                        <ChipGroup
                            options={ROLE_CHIPS}
                            selected={form.cc?.roles || []}
                            onToggle={(role) => toggleRole('cc.roles', role)}
                            disabled={!isAdmin}
                        />
                        <p className="bc-hint">{t('setup.ccRolesHint')}</p>
                    </div>

                    <div className="bc-form-grid">
                        <div className="bc-field">
                            <label htmlFor="bc-delay">{t('setup.sendDelay')}</label>
                            <input
                                id="bc-delay"
                                type="number"
                                min="0"
                                max="240"
                                value={form.sendDelayMinutes ?? 0}
                                onChange={(event) => setPath('sendDelayMinutes', Number(event.target.value))}
                                disabled={!isAdmin}
                            />
                        </div>
                        <div className="bc-field">
                            <label htmlFor="bc-delay-max">{t('setup.sendDelayMax')}</label>
                            <input
                                id="bc-delay-max"
                                type="number"
                                min="0"
                                max="240"
                                value={form.sendDelayMaxMinutes ?? 240}
                                onChange={(event) => setPath('sendDelayMaxMinutes', Number(event.target.value))}
                                disabled={!isAdmin}
                            />
                        </div>
                    </div>

                    <div className="bc-field">
                        <label htmlFor="bc-language">{t('setup.language')}</label>
                        <select
                            id="bc-language"
                            value={form.emailDelivery?.defaultLanguage || 'en'}
                            onChange={(event) => setPath('emailDelivery.defaultLanguage', event.target.value)}
                            disabled={!isAdmin}
                        >
                            <option value="en">English</option>
                            <option value="ar">العربية</option>
                        </select>
                        <p className="bc-hint">{t('setup.languageHint')}</p>
                    </div>

                    <div className={`bc-alert ${form.emailDelivery?.enabled ? 'bc-alert-info' : 'bc-alert-warning'}`}>
                        <div>
                            <strong>
                                {form.emailDelivery?.enabled
                                    ? t('setup.deliveryOnNote')
                                    : t('setup.deliveryOffNote')}
                            </strong>
                            {form.emailDelivery?.enabled
                                ? t('setup.deliveryOnBody')
                                : t('setup.deliveryOffBody')}
                        </div>
                    </div>
                </div>

                <div className="bc-section">
                    <h3>{t('setup.verifierTitle')}</h3>
                    <div className="bc-field">
                        <label htmlFor="bc-verifier-default">{t('setup.verifierDefault')}</label>
                        <select
                            id="bc-verifier-default"
                            value={form.verifier?.defaultRule || 'logging-staff'}
                            onChange={(event) => setPath('verifier.defaultRule', event.target.value)}
                            disabled={!isAdmin}
                        >
                            {BEHAVIOR_VERIFIER_RULES.map((rule) => (
                                <option key={rule} value={rule}>{t(`verifierRules.${rule}`)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bc-field">
                        <label>{t('setup.verifierPerType')}</label>
                        {(form.verifier?.perTaskType || []).map((row) => (
                            <div className="bc-consequence-row" key={row.taskType} style={{ marginTop: '0.35rem' }}>
                                <span style={{ fontSize: '0.8rem' }}>{t(`taskTypes.${row.taskType}`)}</span>
                                <select
                                    value={row.rule}
                                    onChange={(event) => setVerifierRule(row.taskType, { rule: event.target.value })}
                                    disabled={!isAdmin}
                                >
                                    {BEHAVIOR_VERIFIER_RULES.map((rule) => (
                                        <option key={rule} value={rule}>{t(`verifierRules.${rule}`)}</option>
                                    ))}
                                </select>
                                <input
                                    value={row.role || ''}
                                    onChange={(event) => setVerifierRule(row.taskType, { role: event.target.value || null })}
                                    placeholder={t('setup.verifierRole')}
                                    disabled={!isAdmin || row.rule !== 'specific-role'}
                                />
                                <span />
                                <button
                                    type="button"
                                    className="bc-icon-btn"
                                    onClick={() => setPath(
                                        'verifier.perTaskType',
                                        (form.verifier?.perTaskType || []).filter((entry) => entry.taskType !== row.taskType)
                                    )}
                                    disabled={!isAdmin}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <select
                            value=""
                            onChange={(event) => {
                                if (!event.target.value) return;
                                setVerifierRule(event.target.value, { rule: form.verifier?.defaultRule || 'logging-staff' });
                            }}
                            disabled={!isAdmin}
                            style={{ marginTop: '0.4rem' }}
                        >
                            <option value="">{t('setup.verifierAdd')}</option>
                            {BEHAVIOR_TASK_TYPES
                                .filter((taskType) => !(form.verifier?.perTaskType || []).some((row) => row.taskType === taskType))
                                .map((taskType) => (
                                    <option key={taskType} value={taskType}>{t(`taskTypes.${taskType}`)}</option>
                                ))}
                        </select>
                    </div>
                </div>

                <div className="bc-section">
                    <h3>{t('setup.seriousTitle')}</h3>
                    <div className="bc-field">
                        <label>{t('setup.seriousRoles')}</label>
                        <ChipGroup
                            options={ROLE_CHIPS}
                            selected={form.seriousIncident?.allowedRoles || []}
                            onToggle={(role) => toggleRole('seriousIncident.allowedRoles', role)}
                            disabled={!isAdmin}
                        />
                        <p className="bc-hint">{t('setup.seriousRolesHint')}</p>
                    </div>

                    <div className="bc-field">
                        <label htmlFor="bc-apology-words">{t('setup.apologyWords')}</label>
                        <input
                            id="bc-apology-words"
                            type="number"
                            min="0"
                            max="2000"
                            value={form.apologyMinWords ?? 100}
                            onChange={(event) => setPath('apologyMinWords', Number(event.target.value))}
                            disabled={!isAdmin}
                        />
                        <p className="bc-hint">{t('setup.apologyWordsHint')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RulesSetupPanel;
