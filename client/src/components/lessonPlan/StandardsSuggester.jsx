import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineAcademicCap, HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { detectStandards } from '../../store/slices/lessonSlice';
import toast from 'react-hot-toast';
import { formatStandardLabel } from '../../utils/standardLabel';
import { buildRequestedLanguages } from '../../constants/aiLanguages';
import { useTranslation } from 'react-i18next';

/**
 * UI for detecting and selecting curriculum standards aligned with lesson content.
 * Uses subject-added standards when present; when none exist, infers from lesson (subject+grade aligned).
 * Selected standards can be edited (add/remove). Inferred suggestions are display-only for saving (add to subject in Settings to persist).
 */
const StandardsSuggester = ({
    subjectId,
    classId,
    lessonText,
    selectedStandardIds = [],
    onSelectionChange,
    disabled = false,
    initialSuggestions = [],
    aiPrimaryLanguage = 'en',
    aiSecondaryLanguage = '',
    contextText,
    lessonPlanId,
}) => {
    const { t } = useTranslation(['lessonPlan']);
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [fromSubject, setFromSubject] = useState(true);
    const [inferred, setInferred] = useState(false);

    useEffect(() => {
        if (Array.isArray(initialSuggestions) && initialSuggestions.length > 0) {
            setSuggestions(initialSuggestions);
            setFromSubject(true);
            setInferred(false);
        }
    }, [initialSuggestions]);

    const handleDetect = async () => {
        if (!subjectId || !classId) {
            toast.error(t('lessonPlan:form.toasts.selectClassSubjectFirst'));
            return;
        }
        setLoading(true);
        setSuggestions([]);
        const requestedLanguages = buildRequestedLanguages(aiPrimaryLanguage, aiSecondaryLanguage);
        const result = await dispatch(detectStandards({
            subjectId,
            classId,
            lessonText,
            contextText: contextText ?? '',
            lessonPlanId: lessonPlanId ?? null,
            requestedLanguages: requestedLanguages.length > 0 ? requestedLanguages : ['en'],
            primaryLanguage: aiPrimaryLanguage || 'en',
            secondaryLanguage: aiSecondaryLanguage || ''
        }));
        setLoading(false);
        if (detectStandards.fulfilled.match(result)) {
            setSuggestions(result.payload.standards || []);
            setFromSubject(result.payload.fromSubject !== false);
            setInferred(result.payload.inferred === true);
            if ((result.payload.standards || []).length === 0) {
                toast(t('lessonPlan:form.standards.noMatching'));
            } else if (result.payload.inferred === true) {
                toast(t('lessonPlan:form.standards.inferredNotice'));
            }
        } else {
            toast.error(result.payload || t('lessonPlan:form.standards.detectFailed'));
        }
    };

    const idFor = (s) => (s.standardId != null ? s.standardId : s._id)?.toString?.() ?? s.id ?? '';

    const toggleStandard = (standardId) => {
        const idStr = standardId?.toString?.() || standardId;
        const current = Array.isArray(selectedStandardIds) ? selectedStandardIds : [];
        const isSelected = current.some((s) => (s?.toString?.() || s) === idStr);
        const next = isSelected
            ? current.filter((s) => (s?.toString?.() || s) !== idStr)
            : [...current, idStr];
        onSelectionChange(next);
    };

    const removeSelected = (standardId) => {
        const idStr = standardId?.toString?.() || standardId;
        const next = (selectedStandardIds || []).filter((s) => (s?.toString?.() || s) !== idStr);
        onSelectionChange(next);
    };

    const isSelected = (standardId) => {
        const idStr = standardId?.toString?.() || standardId;
        return (selectedStandardIds || []).some((s) => (s?.toString?.() || s) === idStr);
    };

    const selectedList = (selectedStandardIds || []).map((item) => {
        const raw = item?._id ?? item;
        const id = raw?.toString?.() ?? String(raw);
        const inSuggestions = suggestions.find((s) => idFor(s) === id);
        const inInitial = Array.isArray(initialSuggestions) && initialSuggestions.find((s) => idFor(s) === id);
        const detail = inSuggestions || inInitial;
        return {
            id,
            code: detail?.code,
            name: detail?.name,
            description: detail?.description
        };
    });

    return (
        <div className="standards-suggester">
            <button
                type="button"
                className="btn btn-secondary standards-detect-btn"
                onClick={handleDetect}
                disabled={disabled || !subjectId || !classId || loading}
            >
                {loading ? (
                    <>
                        <span className="spinner-small" />
                        {t('lessonPlan:form.standards.detecting')}
                    </>
                ) : (
                    <>
                        <HiOutlineSearch size={18} />
                        {t('lessonPlan:form.standards.detect')}
                    </>
                )}
            </button>

            {suggestions.length > 0 && (
                <div className="standards-list">
                    <h5>
                        <HiOutlineAcademicCap size={18} />
                        {inferred
                            ? t('lessonPlan:form.standards.inferredTitle')
                            : fromSubject
                                ? t('lessonPlan:form.standards.suggestedFromSubject')
                                : t('lessonPlan:form.standards.suggestedOtherSubjects')}
                    </h5>
                    {inferred && (
                        <p className="standards-inferred-note">{t('lessonPlan:form.standards.inferredHint')}</p>
                    )}
                    <div className="standards-checkboxes">
                        {suggestions.map((s) => (
                            <label key={idFor(s)} className="standard-item">
                                <input
                                    type="checkbox"
                                    checked={isSelected(idFor(s))}
                                    onChange={() => toggleStandard(idFor(s))}
                                />
                                <div className="standard-content">
                                    <span className="standardcode">
                                        {formatStandardLabel(s)}
                                    </span>
                                    {s.explanation && (
                                        <span className="standard-explanation">{s.explanation}</span>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {selectedList.length > 0 && (
                <div className="standards-selected">
                    <h5>{t('lessonPlan:form.standards.selectedTitle')}</h5>
                    <ul className="standards-selected-list">
                        {selectedList.map(({ id, code, name, description }) => (
                            <li key={id} className="standard-selected-chip">
                                <span>{formatStandardLabel({ code, name, description }) || id}</span>
                                <button
                                    type="button"
                                    className="standard-remove-btn"
                                    onClick={() => removeSelected(id)}
                                    aria-label={t('lessonPlan:form.standards.remove')}
                                >
                                    <HiOutlineX size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default StandardsSuggester;
