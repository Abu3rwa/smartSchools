import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../config/api';
import { selectUser } from '../../store/slices/authSlice';
import { toggleSelectedRuleId } from './selfCheckSelection';
import './StudentClassworkSelfCheckModal.css';

const RuleGroup = ({ title, rules, selectedRuleIds, onToggle, tone }) => {
    const { t } = useTranslation(['grades']);
    return (
        <section className={`classwork-self-check-group ${tone}`}>
            <h3>{title}</h3>
            {rules.length === 0 && <p className="classwork-self-check-empty">{t('grades:selfCheck.none')}</p>}
            {rules.map((rule) => (
                <label
                    key={rule.id}
                    className={`classwork-self-check-rule${selectedRuleIds.includes(rule.id) ? ' is-selected' : ''}`}
                >
                    <input
                        type="checkbox"
                        checked={selectedRuleIds.includes(rule.id)}
                        onChange={() => onToggle(rule.id)}
                    />
                    <span>{rule.label}</span>
                </label>
            ))}
        </section>
    );
};

const StudentClassworkSelfCheckModal = () => {
    const user = useSelector(selectUser);
    const { t, i18n } = useTranslation(['grades']);
    const isStudent = user?.role === 'student';
    const [checks, setChecks] = useState([]);
    const [dismissedIds, setDismissedIds] = useState(() => new Set());
    const [openId, setOpenId] = useState('');
    const [selectedRuleIds, setSelectedRuleIds] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const loadChecks = useCallback(async () => {
        try {
            const response = await api.get('/classwork-checks/mine');
            const list = response.data?.data?.checks;
            setChecks(Array.isArray(list) ? list : []);
        } catch {
            // A failed load just means no modal; the next app open tries again.
        }
    }, []);

    useEffect(() => {
        if (isStudent) loadChecks();
    }, [isStudent, loadChecks]);

    useEffect(() => {
        if (!isStudent) return undefined;
        const onVisibility = () => {
            if (document.visibilityState === 'visible') loadChecks();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [isStudent, loadChecks]);

    const activeCheck = checks.find((check) => check.id === openId) || null;

    useEffect(() => {
        if (!isStudent || activeCheck) return;
        const next = checks.find((check) => !check.submitted && !dismissedIds.has(check.id));
        if (next) {
            setOpenId(next.id);
            setSelectedRuleIds(next.selectedRuleIds || []);
            setError('');
        }
    }, [activeCheck, checks, dismissedIds, isStudent]);

    const isArabic = String(i18n.language || '').startsWith('ar');

    const subjectName = useCallback((check) => (
        isArabic && check.subject?.nameAr ? check.subject.nameAr : (check.subject?.name || '')
    ), [isArabic]);

    const dateLabel = (check) => {
        const date = new Date(`${check.date}T12:00:00`);
        if (Number.isNaN(date.getTime())) return check.date;
        return date.toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    };

    const ruleLabel = (rule) => (isArabic && rule.labelAr ? rule.labelAr : rule.label);

    const positiveRules = useMemo(
        () => (activeCheck?.rules || []).filter((rule) => Number(rule.value) > 0),
        [activeCheck]
    );
    const negativeRules = useMemo(
        () => (activeCheck?.rules || []).filter((rule) => Number(rule.value) < 0),
        [activeCheck]
    );

    const closeForNow = () => {
        if (openId) {
            setDismissedIds((previous) => {
                const next = new Set(previous);
                next.add(openId);
                return next;
            });
        }
        setOpenId('');
        setError('');
    };

    const reopen = (check) => {
        setOpenId(check.id);
        setSelectedRuleIds(check.selectedRuleIds || []);
        setError('');
    };

    const toggleRule = (ruleId) => {
        setSelectedRuleIds((current) => toggleSelectedRuleId(current, ruleId));
    };

    const save = async () => {
        if (!activeCheck) return;
        setSaving(true);
        setError('');
        try {
            await api.post(`/classwork-checks/${activeCheck.id}/responses`, { selectedRuleIds });
            setChecks((current) => current.map((check) => (
                check.id === activeCheck.id
                    ? { ...check, submitted: true, selectedRuleIds }
                    : check
            )));
            setOpenId('');
            toast.success(t('grades:selfCheck.saved'));
        } catch (requestError) {
            if (requestError.response?.status === 409) {
                setError(t('grades:selfCheck.closed'));
                loadChecks();
            } else {
                setError(t('grades:selfCheck.saveFailed'));
            }
        } finally {
            setSaving(false);
        }
    };

    if (!isStudent || checks.length === 0) return null;

    return (
        <>
            {!activeCheck && (
                <button
                    type="button"
                    className="classwork-self-check-fab"
                    onClick={() => reopen(checks[0])}
                >
                    <HiOutlineCheckCircle aria-hidden="true" />
                    {t('grades:selfCheck.myClasswork')}
                </button>
            )}

            <Dialog
                open={Boolean(activeCheck)}
                onClose={closeForNow}
                fullWidth
                maxWidth="sm"
                aria-labelledby="classwork-self-check-title"
                aria-describedby="classwork-self-check-description"
            >
                {activeCheck && (
                    <>
                        <DialogTitle id="classwork-self-check-title" className="classwork-self-check-title">
                            <span className="classwork-self-check-eyebrow">
                                {subjectName(activeCheck)} · {dateLabel(activeCheck)}
                            </span>
                            {t('grades:selfCheck.studentTitle')}
                        </DialogTitle>
                        <DialogContent>
                            <p id="classwork-self-check-description" className="classwork-self-check-instruction">
                                {t('grades:selfCheck.studentInstruction')}
                            </p>
                            <div className="classwork-self-check-groups">
                                <RuleGroup
                                    title={t('grades:selfCheck.positive')}
                                    rules={positiveRules.map((rule) => ({ ...rule, label: ruleLabel(rule) }))}
                                    selectedRuleIds={selectedRuleIds}
                                    onToggle={toggleRule}
                                    tone="positive"
                                />
                                <RuleGroup
                                    title={t('grades:selfCheck.needsAttention')}
                                    rules={negativeRules.map((rule) => ({ ...rule, label: ruleLabel(rule) }))}
                                    selectedRuleIds={selectedRuleIds}
                                    onToggle={toggleRule}
                                    tone="negative"
                                />
                            </div>
                            {error && (
                                <div className="classwork-self-check-error" role="alert">{error}</div>
                            )}
                        </DialogContent>
                        <DialogActions className="classwork-self-check-actions">
                            <Button onClick={closeForNow} disabled={saving}>
                                {t('grades:selfCheck.later')}
                            </Button>
                            <Button variant="contained" onClick={save} disabled={saving}>
                                {saving ? t('grades:common.saving') : t('grades:selfCheck.save')}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </>
    );
};

export default StudentClassworkSelfCheckModal;
