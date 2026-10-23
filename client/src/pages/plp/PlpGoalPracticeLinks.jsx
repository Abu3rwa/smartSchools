import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import toast from 'react-hot-toast';

const KIND_KEYS = {
    spelling_session: 'practice.kinds.spelling',
    map_practice_plan: 'practice.kinds.mapPlan',
    map_practice_assignment: 'practice.kinds.mapAssignment',
};

const linkKey = (link) => `${link.kind}:${link.targetId}`;

const toPayload = (link) => ({
    kind: link.kind,
    targetId: link.targetId,
    source: link.source || 'teacher',
    reason: link.reason || '',
});

export default function PlpGoalPracticeLinks({ goal, canWrite, onSaved }) {
    const { t } = useTranslation('plp');
    const [linked, setLinked] = useState(goal.linkedPractice || []);
    const [candidates, setCandidates] = useState([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [checked, setChecked] = useState([]);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setLinked(goal.linkedPractice || []);
        setPickerOpen(false);
        setSuggestions([]);
        setChecked([]);
    }, [goal._id, goal.linkedPractice]);

    const loadCandidates = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const response = await api.get(`/plp/goals/${goal._id}/practice-candidates`);
            setCandidates(response.data.data?.candidates || []);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [goal._id]);

    const openPicker = () => {
        setPickerOpen(true);
        if (!candidates.length && !loading) loadCandidates();
    };

    const linkedKeys = new Set(linked.map(linkKey));
    const openable = candidates.filter((candidate) => !linkedKeys.has(linkKey(candidate)));
    const kindLabel = (kind) => t(KIND_KEYS[kind] || 'practice.kinds.other');
    const reasonFor = (item) => (suggestions.find((suggestion) => linkKey(suggestion) === linkKey(item))?.reason || '');

    const save = async (nextLinks) => {
        setSaving(true);
        try {
            const response = await api.put(`/plp/goals/${goal._id}/practice-links`, {
                links: nextLinks.map(toPayload),
            });
            setLinked(response.data.data || []);
            setPickerOpen(false);
            setSuggestions([]);
            setChecked([]);
            if (onSaved) onSaved();
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t('practice.saveFailed'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const toggle = (candidate) => {
        const key = linkKey(candidate);
        setChecked((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
    };

    const suggest = async () => {
        setSuggesting(true);
        try {
            const response = await api.post(`/plp/goals/${goal._id}/practice-link-suggestions`);
            const data = response.data.data || {};
            if (data.unavailable) toast.error(t('practice.aiUnavailable'));
            else if (!data.suggestions?.length) toast(t('practice.aiNone'));
            setSuggestions(data.suggestions || []);
            setChecked((prev) => [...new Set([
                ...prev,
                ...(data.suggestions || []).map(linkKey),
            ])]);
        } catch {
            toast.error(t('practice.aiFailed'));
        } finally {
            setSuggesting(false);
        }
    };

    const addSelected = async () => {
        const chosen = candidates.filter((candidate) => checked.includes(linkKey(candidate)));
        if (!chosen.length) return;
        const merged = [...linked];
        for (const candidate of chosen) {
            if (linkedKeys.has(linkKey(candidate))) continue;
            const reason = reasonFor(candidate);
            merged.push({ ...candidate, source: reason ? 'ai_suggested' : 'teacher', reason });
        }
        if (await save(merged)) toast.success(t('practice.linked'));
    };

    const removeLink = async (link) => {
        if (await save(linked.filter((item) => linkKey(item) !== linkKey(link)))) {
            toast.success(t('practice.unlinked'));
        }
    };

    return (
        <div className="plp-practice">
            <div className="plp-practice-head">
                <h4>{t('practice.title')}</h4>
                {canWrite && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={openPicker} disabled={pickerOpen || saving}>
                        {t('practice.linkNew')}
                    </button>
                )}
            </div>

            {linked.length === 0 && <p className="plp-practice-empty">{t('practice.none')}</p>}
            <ul className="plp-practice-links">
                {linked.map((link) => (
                    <li key={linkKey(link)}>
                        <span className="plp-practice-kind">{kindLabel(link.kind)}</span>
                        <span className="plp-practice-label">{link.label}</span>
                        {link.detail && <span className="plp-practice-detail">{link.detail}</span>}
                        {link.source === 'ai_suggested' && <span className="plp-practice-source">{t('practice.aiBadge')}</span>}
                        {canWrite && (
                            <button type="button" className="plp-practice-remove" disabled={saving} onClick={() => removeLink(link)}>
                                {t('practice.remove')}
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {canWrite && pickerOpen && (
                <div className="plp-practice-picker">
                    <div className="plp-practice-picker-head">
                        <p className="plp-section-note">{t('practice.pickerHint')}</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={suggest} disabled={suggesting || loading}>
                            {suggesting ? t('practice.aiRunning') : t('practice.suggestAi')}
                        </button>
                    </div>

                    {loading && <p>{t('practice.loading')}</p>}
                    {failed && (
                        <p className="plp-practice-error">
                            {t('practice.loadFailed')}{' '}
                            <button type="button" className="plp-practice-retry" onClick={loadCandidates}>{t('email.previewRefresh')}</button>
                        </p>
                    )}
                    {!loading && !failed && !openable.length && <p>{t('practice.noCandidates')}</p>}

                    <div className="plp-practice-candidates">
                        {openable.map((candidate) => {
                            const key = linkKey(candidate);
                            const isSelected = checked.includes(key);
                            const reason = reasonFor(candidate);
                            return (
                                <label key={key} className={`plp-practice-candidate${isSelected ? ' is-checked' : ''}`}>
                                    <input type="checkbox" checked={isSelected} onChange={() => toggle(candidate)} />
                                    <span className="plp-practice-candidate-body">
                                        <span className="plp-practice-kind">{kindLabel(candidate.kind)}</span>
                                        <span className="plp-practice-label">{candidate.label}</span>
                                        {candidate.detail && <span className="plp-practice-detail">{candidate.detail}</span>}
                                        {reason && <span className="plp-practice-reason">{reason}</span>}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="plp-practice-picker-foot">
                        <button type="button" className="btn btn-primary btn-sm" onClick={addSelected} disabled={saving || !checked.length}>
                            {t('practice.addSelected', { value: checked.length })}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPickerOpen(false)} disabled={saving}>
                            {t('practice.cancel')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
