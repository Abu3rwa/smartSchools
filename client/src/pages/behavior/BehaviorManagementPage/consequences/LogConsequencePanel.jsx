import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineSparkles, HiOutlineExclamationCircle } from 'react-icons/hi';
import {
    fetchBehaviorTypes,
    previewBehaviorSuggestion,
    logBehaviorIncident
} from '../../../../api/behaviorApi';
import {
    countWords,
    formatDateTime,
    studentLabel,
    toDateTimeInput
} from './consequenceUtils';

const emptyForm = () => ({
    student: '',
    behaviorType: '',
    occurredAt: toDateTimeInput(),
    staffNotes: '',
    otherStudentsInvolved: [],
    appliedStepOrder: null,
    overrideReason: '',
    isSerious: false,
    seriousReason: ''
});

const LEVEL_GROUPS = [1, 2, 3, 4];

const LogConsequencePanel = ({ students = [], user = null, seriousRoles = [], onLogged }) => {
    const { t, i18n } = useTranslation(['behaviorConsequences']);
    const locale = i18n.resolvedLanguage;
    const [form, setForm] = useState(emptyForm);
    const [types, setTypes] = useState([]);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [studentQuery, setStudentQuery] = useState('');
    const requestRef = useRef(0);

    const canMarkSerious = useMemo(
        () => !seriousRoles.length || seriousRoles.includes(user?.role),
        [seriousRoles, user?.role]
    );

    useEffect(() => {
        let cancelled = false;
        fetchBehaviorTypes()
            .then((payload) => { if (!cancelled) setTypes(payload?.items || []); })
            .catch(() => { if (!cancelled) setTypes([]); });
        return () => { cancelled = true; };
    }, []);

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const visibleStudents = useMemo(() => {
        const query = studentQuery.trim().toLowerCase();
        if (!query) return students.slice(0, 50);
        return students.filter((student) => studentLabel(student).toLowerCase().includes(query)).slice(0, 50);
    }, [students, studentQuery]);

    const selectedStudent = students.find((student) => student._id === form.student) || null;

    // The preview is read-only: it reserves nothing until the log is confirmed.
    useEffect(() => {
        if (!form.student || !form.behaviorType) {
            setPreview(null);
            return undefined;
        }
        const timer = setTimeout(async () => {
            const requestId = requestRef.current + 1;
            requestRef.current = requestId;
            setPreviewLoading(true);
            try {
                const payload = await previewBehaviorSuggestion({
                    studentId: form.student,
                    behaviorTypeId: form.behaviorType,
                    occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined
                });
                if (requestRef.current === requestId) setPreview(payload);
            } catch (error) {
                if (requestRef.current === requestId) {
                    setPreview(null);
                    toast.error(error?.response?.data?.message || t('log.previewFailed'));
                }
            } finally {
                if (requestRef.current === requestId) setPreviewLoading(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [form.student, form.behaviorType, form.occurredAt, t]);

    const suggestion = preview?.suggestion || null;
    const steps = preview?.ladder?.steps || [];
    const overridden = Boolean(suggestion && form.appliedStepOrder && form.appliedStepOrder !== suggestion.order);
    const duplicate = preview?.duplicateWarning || null;
    const consequences = preview?.consequences || [];

    const submit = useCallback(async (mergeInto = null) => {
        if (!form.student || !form.behaviorType) {
            toast.error(t('log.pickStudentAndBehavior'));
            return;
        }
        if (overridden && !form.overrideReason.trim()) {
            toast.error(t('log.overrideReasonRequired'));
            return;
        }
        if (form.isSerious && !form.seriousReason.trim()) {
            toast.error(t('log.seriousReasonRequired'));
            return;
        }

        setSubmitting(true);
        try {
            const payload = await logBehaviorIncident({
                student: form.student,
                behaviorType: form.behaviorType,
                occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
                staffNotes: form.staffNotes.trim() || undefined,
                otherStudentsInvolved: form.otherStudentsInvolved.length ? form.otherStudentsInvolved : undefined,
                appliedStepOrder: form.appliedStepOrder || undefined,
                overrideReason: overridden ? form.overrideReason.trim() : undefined,
                isSerious: form.isSerious || undefined,
                seriousReason: form.isSerious ? form.seriousReason.trim() : undefined,
                mergeInto: mergeInto || undefined
            });

            if (payload?.merged) {
                toast.success(t('log.mergedToast'));
            } else {
                toast.success(payload?.approvalRequired
                    ? t('log.loggedAwaitingApproval')
                    : t('log.logged', { tasks: payload?.taskCount || 0 }));
                if (payload?.missingParentEmail) toast(t('log.missingParentEmail'), { icon: '✉️' });
                if (payload?.flagForAdmin) toast(t('log.flaggedForAdmin'), { icon: '🚩' });
            }

            setForm(emptyForm());
            setStudentQuery('');
            setPreview(null);
            onLogged?.();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('log.saveFailed'));
        } finally {
            setSubmitting(false);
        }
    }, [form, overridden, onLogged, t]);

    const wordCount = countWords(form.staffNotes);

    return (
        <div className="bc-split">
            <div className="bc-panel">
                <div className="bc-panel-head">
                    <div>
                        <h2>{t('log.title')}</h2>
                        <p>{t('log.subtitle')}</p>
                    </div>
                </div>

                <div className="bc-form-grid">
                    <div className="bc-field bc-field-full">
                        <label htmlFor="bc-student-search">{t('log.findStudent')}</label>
                        <input
                            id="bc-student-search"
                            value={studentQuery}
                            onChange={(event) => setStudentQuery(event.target.value)}
                            placeholder={t('log.findStudentPlaceholder')}
                            autoComplete="off"
                        />
                        <select
                            value={form.student}
                            onChange={(event) => setField('student', event.target.value)}
                            aria-label={t('log.student')}
                        >
                            <option value="">{t('log.studentOption')}</option>
                            {visibleStudents.map((student) => (
                                <option key={student._id} value={student._id}>
                                    {studentLabel(student)}
                                </option>
                            ))}
                        </select>
                        <p className="bc-hint">{t('log.studentCountHint', { shown: visibleStudents.length, total: students.length })}</p>
                    </div>

                    <div className="bc-field">
                        <label htmlFor="bc-behavior">{t('log.behavior')}</label>
                        <select
                            id="bc-behavior"
                            value={form.behaviorType}
                            onChange={(event) => setField('behaviorType', event.target.value)}
                        >
                            <option value="">{t('log.behaviorOption')}</option>
                            {LEVEL_GROUPS.map((level) => {
                                const group = types.filter((type) => type.level === level);
                                if (!group.length) return null;
                                return (
                                    <optgroup key={level} label={t(`levels.level${level}`)}>
                                        {group.map((type) => (
                                            <option key={type._id} value={type._id}>{type.name}</option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                        </select>
                        {types.length === 0 && <p className="bc-hint">{t('log.noTypesHint')}</p>}
                    </div>

                    <div className="bc-field">
                        <label htmlFor="bc-occurred">{t('log.occurredAt')}</label>
                        <input
                            id="bc-occurred"
                            type="datetime-local"
                            value={form.occurredAt}
                            onChange={(event) => setField('occurredAt', event.target.value)}
                        />
                    </div>

                    <div className="bc-field bc-field-full">
                        <label htmlFor="bc-notes">{t('log.notes')}</label>
                        <textarea
                            id="bc-notes"
                            value={form.staffNotes}
                            onChange={(event) => setField('staffNotes', event.target.value)}
                            placeholder={t('log.notesPlaceholder')}
                            maxLength={4000}
                        />
                        <p className="bc-hint">{t('log.notesPrivacy', { words: wordCount })}</p>
                    </div>

                    <div className="bc-field bc-field-full">
                        <label htmlFor="bc-others">{t('log.othersInvolved')}</label>
                        <select
                            id="bc-others"
                            multiple
                            size={4}
                            value={form.otherStudentsInvolved}
                            onChange={(event) => setField(
                                'otherStudentsInvolved',
                                Array.from(event.target.selectedOptions, (option) => option.value)
                            )}
                        >
                            {visibleStudents
                                .filter((student) => student._id !== form.student)
                                .map((student) => (
                                    <option key={student._id} value={student._id}>{studentLabel(student)}</option>
                                ))}
                        </select>
                        <p className="bc-hint">{t('log.othersHint')}</p>
                    </div>

                    {canMarkSerious && (
                        <div className="bc-field bc-field-full">
                            <label className="bc-check">
                                <input
                                    type="checkbox"
                                    checked={form.isSerious}
                                    onChange={(event) => setField('isSerious', event.target.checked)}
                                />
                                {t('log.seriousToggle')}
                            </label>
                            {form.isSerious && (
                                <input
                                    value={form.seriousReason}
                                    onChange={(event) => setField('seriousReason', event.target.value)}
                                    placeholder={t('log.seriousReasonPlaceholder')}
                                    maxLength={1000}
                                />
                            )}
                        </div>
                    )}

                    {suggestion && (
                        <div className="bc-field bc-field-full">
                            <label htmlFor="bc-step">{t('log.stepOverride')}</label>
                            <select
                                id="bc-step"
                                value={form.appliedStepOrder || suggestion.order || ''}
                                onChange={(event) => setField(
                                    'appliedStepOrder',
                                    event.target.value ? Number(event.target.value) : null
                                )}
                            >
                                {steps.map((step) => (
                                    <option key={step.order} value={step.order}>
                                        {step.order === suggestion.order
                                            ? t('log.suggestedStepOption', { order: step.order, title: step.title })
                                            : `${step.order}. ${step.title}`}
                                    </option>
                                ))}
                            </select>
                            {overridden && (
                                <input
                                    value={form.overrideReason}
                                    onChange={(event) => setField('overrideReason', event.target.value)}
                                    placeholder={t('log.overrideReasonPlaceholder')}
                                    maxLength={1000}
                                />
                            )}
                            <p className="bc-hint">{t('log.overrideHint')}</p>
                        </div>
                    )}
                </div>

                {duplicate?.found && (
                    <div className="bc-alert bc-alert-warning" style={{ marginTop: 'var(--spacing-md)' }}>
                        <HiOutlineExclamationCircle />
                        <div>
                            <strong>{t('log.duplicateTitle')}</strong>
                            {t('log.duplicateBody', {
                                when: formatDateTime(duplicate.occurredAt, locale),
                                window: duplicate.windowMinutes
                            })}
                            <div className="bc-alert-actions">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => submit(duplicate.incidentId)}
                                    disabled={submitting}
                                >
                                    {t('log.mergeDuplicate')}
                                </button>
                                <span className="bc-hint">{t('log.mergeHint')}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bc-actions" style={{ marginTop: 'var(--spacing-md)' }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => submit(null)}
                        disabled={submitting || !form.student || !form.behaviorType}
                    >
                        {submitting ? t('common.saving') : t('log.confirm')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => { setForm(emptyForm()); setPreview(null); }}
                        disabled={submitting}
                    >
                        {t('common.clear')}
                    </button>
                </div>
            </div>

            <aside className="bc-side">
                <div className="bc-suggestion">
                    {!preview && !previewLoading && (
                        <div className="bc-empty">
                            <HiOutlineSparkles />
                            <h3>{t('suggestion.emptyTitle')}</h3>
                            <p>{t('suggestion.emptyBody')}</p>
                        </div>
                    )}
                    {previewLoading && !preview && <div className="bc-loading">{t('common.loading')}</div>}
                    {preview && (
                        <>
                            <div className="bc-suggestion-top">
                                <span className="bc-occurrence">
                                    {t('suggestion.occurrence', { value: preview.suggestion.occurrence })}
                                </span>
                                <span className={`badge ${preview.approval?.required ? 'badge-warning' : 'badge-success'}`}>
                                    {preview.approval?.required ? t('suggestion.needsApproval') : t('suggestion.autoRelease')}
                                </span>
                            </div>
                            <h3>{preview.suggestion.title || t('suggestion.noStep')}</h3>
                            <p>
                                {preview.behaviorType?.name}
                                {' · '}
                                {t(`statuses.window.${preview.suggestion.window?.mode || 'school_year'}`)}
                            </p>
                            <p className="bc-hint" style={{ marginTop: '0.35rem' }}>
                                {t('suggestion.priorCount', { value: preview.suggestion.priorCount })}
                                {preview.suggestion.overflow === 'repeat_last' ? ` · ${t('suggestion.overflowRepeat')}` : ''}
                                {preview.suggestion.overflow === 'flag_for_admin' ? ` · ${t('suggestion.overflowFlag')}` : ''}
                            </p>

                            <div className="bc-ladder-strip">
                                {steps.map((step) => (
                                    <span
                                        key={step.order}
                                        className={`bc-step-chip ${step.order === (form.appliedStepOrder || preview.suggestion.order) ? 'is-suggested' : ''}`}
                                    >
                                        {step.order}. {step.title}
                                    </span>
                                ))}
                            </div>

                            {consequences.length > 0 && (
                                <ul className="bc-consequence-list">
                                    {consequences.map((consequence) => (
                                        <li key={`${consequence.taskType}-${consequence.title}`}>
                                            <span>{consequence.title}</span>
                                            <span className="bc-consequence-meta">
                                                {t('suggestion.dueInDays', { days: consequence.dueInDays })}
                                                {consequence.minWords ? ` · ${t('suggestion.minWords', { value: consequence.minWords })}` : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className="bc-alert bc-alert-info" style={{ marginTop: 'var(--spacing-md)' }}>
                                <div>
                                    <strong>{t('suggestion.familyPlan')}</strong>
                                    {t('suggestion.familyPlanBody')}
                                    {preview.approval?.required && (
                                        <p className="bc-hint">
                                            {t('suggestion.approvers', {
                                                roles: (preview.approval.approverRoles || []).join(', ') || t('common.none')
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <p className="bc-hint" style={{ marginTop: 'var(--spacing-sm)' }}>
                                {t('suggestion.noTransportNotice')}
                            </p>
                        </>
                    )}
                </div>

                {selectedStudent && (
                    <div className="bc-panel">
                        <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem' }}>{studentLabel(selectedStudent)}</h3>
                        <p className="bc-hint">{t('suggestion.selectedStudentHint')}</p>
                    </div>
                )}
            </aside>
        </div>
    );
};

export default LogConsequencePanel;
