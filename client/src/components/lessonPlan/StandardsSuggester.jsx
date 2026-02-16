import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineAcademicCap, HiOutlineSearch } from 'react-icons/hi';
import { detectStandards } from '../../store/slices/lessonSlice';
import toast from 'react-hot-toast';

/**
 * UI for detecting and selecting curriculum standards aligned with lesson content.
 * Shows detected standards with checkboxes; selected IDs are passed up via onSelectionChange.
 * initialSuggestions: standards from "Generate from title" (displays them without extra API call).
 */
const StandardsSuggester = ({
    subjectId,
    classId,
    lessonText,
    selectedStandardIds = [],
    onSelectionChange,
    disabled = false,
    initialSuggestions = [],
}) => {
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        if (Array.isArray(initialSuggestions) && initialSuggestions.length > 0) {
            setSuggestions(initialSuggestions);
        }
    }, [initialSuggestions]);

    const handleDetect = async () => {
        if (!subjectId || !classId) {
            toast.error('Select Class and Subject first');
            return;
        }
        setLoading(true);
        setSuggestions([]);
        const result = await dispatch(detectStandards({ subjectId, classId, lessonText }));
        setLoading(false);
        if (detectStandards.fulfilled.match(result)) {
            setSuggestions(result.payload.standards || []);
            if ((result.payload.standards || []).length === 0) {
                toast('No matching standards found for this subject and grade.');
            }
        } else {
            toast.error(result.payload || 'Standards detection failed');
        }
    };

    const toggleStandard = (standardId) => {
        const idStr = standardId?.toString?.() || standardId;
        const current = Array.isArray(selectedStandardIds) ? selectedStandardIds : [];
        const isSelected = current.some((s) => (s?.toString?.() || s) === idStr);
        const next = isSelected
            ? current.filter((s) => (s?.toString?.() || s) !== idStr)
            : [...current, idStr];
        onSelectionChange(next);
    };

    const isSelected = (standardId) => {
        const idStr = standardId?.toString?.() || standardId;
        return (selectedStandardIds || []).some((s) => (s?.toString?.() || s) === idStr);
    };

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
                        Suggested Standards
                    </h5>
                    <div className="standards-checkboxes">
                        {suggestions.map((s) => (
                            <label key={s.standardId} className="standard-item">
                                <input
                                    type="checkbox"
                                    checked={isSelected(s.standardId)}
                                    onChange={() => toggleStandard(s.standardId)}
                                />
                                <div className="standard-content">
                                    <span className="standard-code">{s.code}</span>
                                    {s.name && <span className="standard-name">{s.name}</span>}
                                    {s.description && (
                                        <span className="standard-description">{s.description}</span>
                                    )}
                                    {s.explanation && (
                                        <span className="standard-explanation">{s.explanation}</span>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StandardsSuggester;
