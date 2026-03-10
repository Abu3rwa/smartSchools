import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineAcademicCap, HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { detectStandards } from '../../store/slices/lessonSlice';
import toast from 'react-hot-toast';
import { formatStandardLabel } from '../../utils/standardLabel';
import { buildRequestedLanguages } from '../../constants/aiLanguages';

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
}) => {
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
            toast.error('Select Class and Subject first');
            return;
        }
        setLoading(true);
        setSuggestions([]);
        const requestedLanguages = buildRequestedLanguages(aiPrimaryLanguage, aiSecondaryLanguage);
        const result = await dispatch(detectStandards({
            subjectId,
            classId,
            lessonText,
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
                toast('No matching standards found for this subject and grade.');
            } else if (result.payload.inferred === true) {
                toast('No standards in this subject yet. Inferred from your lesson (aligned with this subject and grade). Add to your subject in Settings to save with the lesson.');
            }
        } else {
            toast.error(result.payload || 'Standards detection failed');
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
                        Detecting…
                    </>
                ) : (
                    <>
                        <HiOutlineSearch size={18} />
                        Detect Standards
                    </>
                )}
            </button>

            {suggestions.length > 0 && (
                <div className="standards-list">
                    <h5>
                        <HiOutlineAcademicCap size={18} />
                        {inferred
                            ? 'Inferred from your lesson (aligned with this subject and grade)'
                            : fromSubject
                                ? 'Suggested Standards (from your subject)'
                                : 'Suggested Standards (other subjects – add to your subject in Settings to use here)'}
                    </h5>
                    {inferred && (
                        <p className="standards-inferred-note">Add these to your subject in Settings to save them with the lesson.</p>
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
                                    <span className="standard-code">
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
                    <h5>Selected standards (click × to remove)</h5>
                    <ul className="standards-selected-list">
                        {selectedList.map(({ id, code, name, description }) => (
                            <li key={id} className="standard-selected-chip">
                                <span>{formatStandardLabel({ code, name, description }) || id}</span>
                                <button
                                    type="button"
                                    className="standard-remove-btn"
                                    onClick={() => removeSelected(id)}
                                    aria-label="Remove standard"
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
