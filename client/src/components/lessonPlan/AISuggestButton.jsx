import { useDispatch } from 'react-redux';
import { HiOutlineSparkles } from 'react-icons/hi';
import { suggestField } from '../../store/slices/lessonSlice';
import toast from 'react-hot-toast';
import { buildRequestedLanguages } from '../../constants/aiLanguages';

/**
 * Button that triggers AI suggestion for a lesson plan field.
 * Shows loading state, calls onSuggestion with the AI-generated text on success.
 */
const AISuggestButton = ({
    field,
    currentValue,
    subjectId,
    classId,
    title,
    summary,
    stageIndex,
    stageProcedure,
    aiPrimaryLanguage = 'en',
    aiSecondaryLanguage = '',
    onSuggestion,
    disabled = false,
    size = 'sm',
}) => {
    const dispatch = useDispatch();

    const handleClick = async () => {
        if (disabled || !subjectId || !classId) {
            if (!subjectId || !classId) {
                toast.error('Select Class and Subject first');
            }
            return;
        }

        const payload = {
            field,
            currentValue: field === 'stageProcedure' ? (stageProcedure ?? currentValue ?? '') : (currentValue ?? ''),
            subjectId,
            classId,
            title: title ?? '',
            summary: summary ?? '',
        };
        const requestedLanguages = buildRequestedLanguages(aiPrimaryLanguage, aiSecondaryLanguage);
        payload.requestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
        payload.primaryLanguage = aiPrimaryLanguage || 'en';
        payload.secondaryLanguage = aiSecondaryLanguage || '';
        if (field === 'stageProcedure' && stageIndex !== undefined) {
            payload.stageIndex = stageIndex;
        }

        const result = await dispatch(suggestField(payload));
        if (suggestField.fulfilled.match(result)) {
            onSuggestion(result.payload.suggestion);
        } else {
            toast.error(result.payload || 'AI suggestion failed');
        }
    };

    return (
        <button
            type="button"
            className={`ai-suggest-btn ai-suggest-btn--${size}`}
            onClick={handleClick}
            disabled={disabled || !subjectId || !classId}
            title="AI Suggest"
        >
            <HiOutlineSparkles size={size === 'sm' ? 16 : 18} />
            <span>Suggest</span>
        </button>
    );
};

export default AISuggestButton;
