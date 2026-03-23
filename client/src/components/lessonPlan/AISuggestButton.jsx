import { useDispatch } from 'react-redux';
import { HiOutlineSparkles } from 'react-icons/hi';
import { suggestField } from '../../store/slices/lessonSlice';
import toast from 'react-hot-toast';
import { buildRequestedLanguages } from '../../constants/aiLanguages';
import { useTranslation } from 'react-i18next';

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
    contextText,
    lessonPlanId,
    onSuggestion,
    disabled = false,
    size = 'sm',
}) => {
    const { t } = useTranslation(['lessonPlan']);
    const dispatch = useDispatch();

    const handleClick = async () => {
        if (disabled || !subjectId || !classId) {
            if (!subjectId || !classId) {
                toast.error(t('lessonPlan:form.toasts.selectClassSubjectFirst'));
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
            contextText: contextText ?? '',
            lessonPlanId: lessonPlanId ?? null,
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
            toast.error(result.payload || t('lessonPlan:form.toasts.aiSuggestionFailed'));
        }
    };

    return (
        <button
            type="button"
            className={`ai-suggest-btn ai-suggest-btn--${size}`}
            onClick={handleClick}
            disabled={disabled || !subjectId || !classId}
            title={t('lessonPlan:form.aiSuggest')}
        >
            <HiOutlineSparkles size={size === 'sm' ? 16 : 18} />
            <span>{t('lessonPlan:form.aiSuggest')}</span>
        </button>
    );
};

export default AISuggestButton;
