import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineLightningBolt } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import assignmentService from '../../../../services/assignmentService';
import {
    buildSourceRequestFields,
    resolveSourceOption
} from '../utils/assignmentDrafting';
import AssignmentSourceSelect from './AssignmentSourceSelect';

const TYPE_OPTIONS = [
    { value: 'multiple_choice', labelKey: 'assignments:googleForms.multipleChoice' },
    { value: 'true_false', labelKey: 'assignments:googleForms.trueFalse' },
    { value: 'short_answer', labelKey: 'assignments:googleForms.shortAnswer' }
];

const ERROR_KEYS = {
    GOOGLE_FORMS_DISABLED: 'assignments:googleForms.drafter.errors.formsDisabled',
    DRAFT_CLASS_SUBJECT_REQUIRED: 'assignments:googleForms.drafter.errors.classSubjectRequired',
    DRAFT_SOURCE_REQUIRED: 'assignments:googleForms.drafter.errors.sourceRequired',
    DRAFT_SOURCE_EMPTY: 'assignments:googleForms.drafter.errors.sourceEmpty',
    DRAFT_QUESTIONS_INVALID: 'assignments:googleForms.drafter.errors.invalidDrafts',
    DRAFT_RESPONSE_INVALID: 'assignments:googleForms.drafter.errors.invalidDrafts',
    DOCUMENT_NO_TEXT: 'assignments:googleForms.drafter.errors.noText',
    DOCUMENT_PDF_UNREADABLE: 'assignments:googleForms.drafter.errors.pdfUnreadable',
    DOCUMENT_TYPE_UNSUPPORTED: 'assignments:googleForms.drafter.errors.unsupportedFile',
    DOCUMENT_TOO_LARGE: 'assignments:googleForms.drafter.errors.fileTooLarge',
    DOCUMENT_EMPTY_FILE: 'assignments:googleForms.drafter.errors.emptyFile',
    DRIVE_FILE_NOT_CONNECTED: 'assignments:googleForms.drafter.errors.driveNotConnected',
    DRIVE_FILE_NOT_FOUND: 'assignments:googleForms.drafter.errors.driveFileMissing',
    DRIVE_FILE_API_FAILED: 'assignments:googleForms.drafter.errors.driveFailed'
};

const AssignmentQuestionDrafter = ({
    classId,
    subjectId,
    assignmentId = null,
    lessonPlanIds = [],
    sourceOptions = [],
    disabled = false,
    hasExistingQuestions = false,
    onRequestLessonPlans,
    onRequestSource,
    onDrafted
}) => {
    const { t } = useTranslation(['assignments']);
    const [source, setSource] = useState('lessons');
    const [sourceValue, setSourceValue] = useState('');
    const [count, setCount] = useState('5');
    const [types, setTypes] = useState(['multiple_choice', 'true_false']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (resolveSourceOption(sourceOptions, sourceValue)) return;
        setSourceValue(sourceOptions[0]?.value || '');
    }, [sourceOptions, sourceValue]);

    const selectedSource = resolveSourceOption(sourceOptions, sourceValue);
    const lessonCount = Array.isArray(lessonPlanIds) ? lessonPlanIds.length : 0;
    const hasClassSubject = Boolean(classId && subjectId);
    const hasSource = source === 'lessons' ? lessonCount > 0 : Boolean(selectedSource);
    const canGenerate = !disabled && !loading && hasClassSubject && hasSource && types.length > 0;

    const disabledReason = (() => {
        if (!hasClassSubject) return t('assignments:googleForms.drafter.needClassSubject');
        if (types.length === 0) return t('assignments:googleForms.drafter.needType');
        if (source === 'lessons' && lessonCount === 0) return t('assignments:googleForms.drafter.needLessons');
        if (source === 'source' && !selectedSource) return t('assignments:googleForms.drafter.needFile');
        return '';
    })();

    const toggleType = (type) => {
        setTypes((current) => (
            current.includes(type) ? current.filter((value) => value !== type) : [...current, type]
        ));
    };

    const errorMessageFor = (requestError) => {
        const code = requestError?.response?.data?.code || requestError?.code;
        if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code]);
        if (requestError?.response?.status === 429) return t('assignments:googleForms.drafter.errors.rateLimited');
        return requestError?.response?.data?.message
            || requestError?.message
            || t('assignments:googleForms.drafter.errors.failed');
    };

    const handleGenerate = async () => {
        if (!canGenerate) return;
        if (hasExistingQuestions && !window.confirm(t('assignments:googleForms.drafter.replaceConfirm'))) {
            return;
        }

        setLoading(true);
        setError('');
        try {
            const response = await assignmentService.draftQuestions({
                classId,
                subjectId,
                lessonPlanIds: source === 'lessons' ? lessonPlanIds : [],
                count: Number(count) || 5,
                types,
                assignmentId,
                ...(source === 'source' ? buildSourceRequestFields(selectedSource) : {})
            });
            const questions = response?.data?.questions || [];
            if (questions.length === 0) {
                throw new Error(t('assignments:googleForms.drafter.errors.invalidDrafts'));
            }
            onDrafted(questions);
            toast.success(t('assignments:googleForms.drafter.done', { number: questions.length }));
        } catch (requestError) {
            setError(errorMessageFor(requestError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="question-drafter">
            <div className="question-drafter__head">
                <span className="question-drafter__icon" aria-hidden="true">
                    <HiOutlineLightningBolt />
                </span>
                <div>
                    <h4>{t('assignments:googleForms.drafter.title')}</h4>
                    <p>{t('assignments:googleForms.drafter.help')}</p>
                </div>
            </div>

            <div className="question-drafter__grid">
                <fieldset className="question-drafter__source">
                    <legend>{t('assignments:googleForms.drafter.source')}</legend>
                    <label className="question-drafter__radio">
                        <input
                            type="radio"
                            name="drafter-source"
                            value="lessons"
                            checked={source === 'lessons'}
                            disabled={disabled || loading}
                            onChange={() => setSource('lessons')}
                        />
                        <span>
                            {t('assignments:googleForms.drafter.fromLessons')}
                            <small>
                                {lessonCount > 0
                                    ? t('assignments:googleForms.drafter.lessonCount', { count: lessonCount })
                                    : t('assignments:googleForms.drafter.noLessons')}
                            </small>
                        </span>
                    </label>
                    {source === 'lessons' && lessonCount === 0 && onRequestLessonPlans && (
                        <button
                            type="button"
                            className="question-drafter__link"
                            onClick={onRequestLessonPlans}
                            disabled={disabled || loading}
                        >
                            {t('assignments:googleForms.drafter.chooseLessons')}
                        </button>
                    )}

                    <label className="question-drafter__radio">
                        <input
                            type="radio"
                            name="drafter-source"
                            value="source"
                            checked={source === 'source'}
                            disabled={disabled || loading}
                            onChange={() => setSource('source')}
                        />
                        <span>{t('assignments:googleForms.drafter.fromFile')}</span>
                    </label>

                    {source === 'source' && (
                        <AssignmentSourceSelect
                            options={sourceOptions}
                            value={sourceValue}
                            onChange={setSourceValue}
                            disabled={disabled || loading}
                            compact
                            onRequestSource={onRequestSource}
                        />
                    )}
                </fieldset>

                <div className="question-drafter__settings">
                    <label className="question-drafter__count">
                        <span>{t('assignments:googleForms.drafter.count')}</span>
                        <input
                            type="number"
                            min={1}
                            max={30}
                            value={count}
                            disabled={disabled || loading}
                            onChange={(event) => setCount(event.target.value)}
                        />
                    </label>

                    <fieldset className="question-drafter__types">
                        <legend>{t('assignments:googleForms.drafter.types')}</legend>
                        {TYPE_OPTIONS.map((option) => (
                            <label key={option.value}>
                                <input
                                    type="checkbox"
                                    checked={types.includes(option.value)}
                                    disabled={disabled || loading}
                                    onChange={() => toggleType(option.value)}
                                />
                                {t(option.labelKey)}
                            </label>
                        ))}
                        <p className="question-drafter__hint">{t('assignments:googleForms.drafter.shortAnswerHint')}</p>
                    </fieldset>
                </div>
            </div>

            {error && (
                <p className="question-drafter__error" role="alert">{error}</p>
            )}

            <div className="question-drafter__actions">
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                >
                    <HiOutlineLightningBolt />
                    {loading
                        ? t('assignments:googleForms.drafter.generating')
                        : t('assignments:googleForms.drafter.generate')}
                </button>
                {disabledReason && !error && (
                    <span className="question-drafter__hint">{disabledReason}</span>
                )}
            </div>
        </div>
    );
};

export default AssignmentQuestionDrafter;
