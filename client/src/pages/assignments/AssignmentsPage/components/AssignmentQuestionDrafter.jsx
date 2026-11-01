import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    HiOutlineDocumentText,
    HiOutlineLightningBolt,
    HiOutlineUpload,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import assignmentService from '../../../../services/assignmentService';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
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
    DOCUMENT_EMPTY_FILE: 'assignments:googleForms.drafter.errors.emptyFile'
};

const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB`;

const AssignmentQuestionDrafter = ({
    classId,
    subjectId,
    lessonPlanIds = [],
    disabled = false,
    hasExistingQuestions = false,
    onRequestLessonPlans,
    onDrafted
}) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);
    const [source, setSource] = useState('lessons');
    const [count, setCount] = useState('5');
    const [types, setTypes] = useState(['multiple_choice', 'true_false']);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const lessonCount = Array.isArray(lessonPlanIds) ? lessonPlanIds.length : 0;
    const hasClassSubject = Boolean(classId && subjectId);
    const hasSource = source === 'lessons' ? lessonCount > 0 : Boolean(file);
    const canGenerate = !disabled && !loading && hasClassSubject && hasSource && types.length > 0;

    const disabledReason = (() => {
        if (!hasClassSubject) return t('assignments:googleForms.drafter.needClassSubject');
        if (types.length === 0) return t('assignments:googleForms.drafter.needType');
        if (source === 'lessons' && lessonCount === 0) return t('assignments:googleForms.drafter.needLessons');
        if (source === 'file' && !file) return t('assignments:googleForms.drafter.needFile');
        return '';
    })();

    const toggleType = (type) => {
        setTypes((current) => (
            current.includes(type) ? current.filter((value) => value !== type) : [...current, type]
        ));
    };

    const handleFileChange = (event) => {
        const chosen = event.target.files?.[0];
        event.target.value = '';
        if (!chosen) return;
        if (!ACCEPTED_TYPES.includes(chosen.type)) {
            setError(t('assignments:googleForms.drafter.errors.unsupportedFile'));
            setFile(null);
            return;
        }
        if (chosen.size > MAX_FILE_BYTES) {
            setError(t('assignments:googleForms.drafter.errors.fileTooLarge'));
            setFile(null);
            return;
        }
        setError('');
        setFile(chosen);
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
                file: source === 'file' ? file : null
            });
            const questions = response?.data?.questions || [];
            if (questions.length === 0) {
                throw new Error(t('assignments:googleForms.drafter.errors.invalidDrafts'));
            }
            onDrafted(questions);
            toast.success(t('assignments:googleForms.drafter.done', { count: questions.length }));
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
                            value="file"
                            checked={source === 'file'}
                            disabled={disabled || loading}
                            onChange={() => setSource('file')}
                        />
                        <span>{t('assignments:googleForms.drafter.fromFile')}</span>
                    </label>

                    {source === 'file' && (
                        <div className="question-drafter__file">
                            <div className="question-drafter__file-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={disabled || loading}
                                >
                                    <HiOutlineUpload />
                                    {t('assignments:googleForms.drafter.chooseFile')}
                                </button>
                                {file && (
                                    <button
                                        type="button"
                                        className="question-drafter__clear"
                                        onClick={() => setFile(null)}
                                        disabled={disabled || loading}
                                        aria-label={t('assignments:googleForms.drafter.removeFile')}
                                    >
                                        <HiOutlineX />
                                    </button>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                                    hidden
                                    onChange={handleFileChange}
                                    aria-label={t('assignments:googleForms.drafter.chooseFile')}
                                />
                            </div>
                            {file ? (
                                <p className="question-drafter__file-name">
                                    <HiOutlineDocumentText aria-hidden="true" />
                                    <span>{file.name}</span>
                                    <span className="question-drafter__file-size">{formatFileSize(file.size)}</span>
                                </p>
                            ) : (
                                <p className="question-drafter__hint">{t('assignments:googleForms.drafter.fileTypes')}</p>
                            )}
                            <p className="question-drafter__hint">{t('assignments:googleForms.drafter.fileNotSaved')}</p>
                        </div>
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
