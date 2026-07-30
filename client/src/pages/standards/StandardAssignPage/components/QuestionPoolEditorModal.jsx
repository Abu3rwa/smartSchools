import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';

const MC_LABELS = ['A', 'B', 'C', 'D'];
const QUESTION_TYPES = ['multiple_choice', 'true_false'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const GRAMMAR_LEVELS = [
    'beginner',
    'elementary',
    'pre_intermediate',
    'intermediate',
    'upper_intermediate',
    'advanced'
];

const createMcOptions = () =>
    MC_LABELS.map((label) => ({
        label,
        text: ''
    }));

const toNonEmptyString = (value) => String(value || '').trim();

const normalizeQuestionType = (value) =>
    QUESTION_TYPES.includes(value) ? value : 'multiple_choice';

const normalizeDifficulty = (value) => (DIFFICULTIES.includes(value) ? value : 'medium');
const normalizeGrammarLevel = (value) =>
    GRAMMAR_LEVELS.includes(String(value || '').trim().toLowerCase())
        ? String(value || '').trim().toLowerCase()
        : null;

const normalizeIncomingQuestion = (question = {}, index = 0) => {
    const questionType = normalizeQuestionType(question.questionType);
    const base = {
        localId: `${question._id || 'q'}-${index}-${Date.now()}`,
        questionText: toNonEmptyString(question.questionText),
        questionType,
        difficulty: normalizeDifficulty(question.difficulty),
        grammarLevel: normalizeGrammarLevel(question.grammarLevel),
        explanation: toNonEmptyString(question.explanation),
        correctAnswer: toNonEmptyString(question.correctAnswer),
        options: []
    };

    if (questionType === 'multiple_choice') {
        const sourceOptions = Array.isArray(question.options) ? question.options : [];
        const mapped = MC_LABELS.map((label, optionIndex) => {
            const optionByLabel = sourceOptions.find(
                (item) => String(item?.label || '').toUpperCase() === label
            );
            const optionByIndex = sourceOptions[optionIndex];
            return {
                label,
                text: toNonEmptyString(optionByLabel?.text || optionByIndex?.text || '')
            };
        });
        base.options = mapped;
        base.correctAnswer = MC_LABELS.includes(base.correctAnswer.toUpperCase())
            ? base.correctAnswer.toUpperCase()
            : 'A';
        return base;
    }

    if (questionType === 'true_false') {
        base.options = [
            { label: 'A', text: 'True' },
            { label: 'B', text: 'False' }
        ];
        const normalized = base.correctAnswer.toLowerCase();
        base.correctAnswer = normalized === 'false' ? 'False' : 'True';
        return base;
    }

    base.options = [];
    return base;
};

const createEmptyQuestion = (index = 0) =>
    normalizeIncomingQuestion(
        {
            questionType: 'multiple_choice',
            questionText: '',
            options: createMcOptions(),
            correctAnswer: 'A',
            explanation: '',
            difficulty: 'medium'
        },
        index
    );

const QuestionPoolEditorModal = ({
    show,
    onClose,
    loading,
    error,
    data,
    assignmentId,
    saving,
    regeneratingQuestionIndex,
    onRetry,
    onSave,
    onRegenerateQuestion
}) => {
    const { t } = useTranslation(['standardAssign']);
    const [questions, setQuestions] = useState([]);
    const [changeSummary, setChangeSummary] = useState('');
    const [localError, setLocalError] = useState('');

    useEffect(() => {
        if (!show || !data) return;
        const incoming = Array.isArray(data?.questionPool?.questions)
            ? data.questionPool.questions
            : [];
        const normalized =
            incoming.length > 0
                ? incoming.map((question, index) => normalizeIncomingQuestion(question, index))
                : [createEmptyQuestion(0)];
        setQuestions(normalized);
        setChangeSummary('');
        setLocalError('');
    }, [show, data]);

    const assignmentTitle = useMemo(
        () =>
            data?.assignment?.title ||
            data?.assignment?.standard?.name ||
            t('standardAssign:questionPool.defaultTitle'),
        [data, t]
    );

    const workflowStatus = data?.questionWorkflow?.status || 'draft';
    const workflowStatusLabel = t(`standardAssign:workflowStatus.${workflowStatus}`, {
        defaultValue: workflowStatus
    });

    const updateQuestion = (index, updater) => {
        setQuestions((previous) =>
            previous.map((question, currentIndex) =>
                currentIndex === index ? updater(question) : question
            )
        );
    };

    const handleTypeChange = (index, nextType) => {
        const questionType = normalizeQuestionType(nextType);
        updateQuestion(index, (question) => {
            if (questionType === 'multiple_choice') {
                return {
                    ...question,
                    questionType,
                    options: createMcOptions(),
                    correctAnswer: 'A'
                };
            }
            if (questionType === 'true_false') {
                return {
                    ...question,
                    questionType,
                    options: [
                        { label: 'A', text: 'True' },
                        { label: 'B', text: 'False' }
                    ],
                    correctAnswer: 'True'
                };
            }
            return {
                ...question,
                questionType,
                options: [],
                correctAnswer: ''
            };
        });
    };

    const handleAddQuestion = () => {
        setQuestions((previous) => [...previous, createEmptyQuestion(previous.length)]);
    };

    const handleRemoveQuestion = (index) => {
        setQuestions((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
    };

    const buildPayload = () => {
        if (!Array.isArray(questions) || questions.length === 0) {
            return { errorMessage: t('standardAssign:questionPool.validation.addAtLeastOne') };
        }

        const normalizedQuestions = [];
        for (let i = 0; i < questions.length; i += 1) {
            const item = questions[i];
            const questionText = toNonEmptyString(item.questionText);
            const explanation = toNonEmptyString(item.explanation);
            const questionType = normalizeQuestionType(item.questionType);
            const difficulty = normalizeDifficulty(item.difficulty);

            if (!questionText) {
                return {
                    errorMessage: t('standardAssign:questionPool.validation.questionTextRequired', {
                        index: i + 1
                    })
                };
            }

            if (questionType === 'multiple_choice') {
                const options = MC_LABELS.map((label, optionIndex) => {
                    const raw =
                        item.options?.find((option) => option.label === label) ||
                        item.options?.[optionIndex] ||
                        {};
                    return {
                        label,
                        text: toNonEmptyString(raw.text)
                    };
                });
                const emptyOption = options.find((option) => !option.text);
                if (emptyOption) {
                    return {
                        errorMessage: t('standardAssign:questionPool.validation.allOptionsRequired', {
                            index: i + 1
                        })
                    };
                }
                const distinctCount = new Set(
                    options.map((option) => option.text.toLowerCase())
                ).size;
                if (distinctCount < 4) {
                    return {
                        errorMessage: t('standardAssign:questionPool.validation.optionsDistinct', {
                            index: i + 1
                        })
                    };
                }
                const correctAnswer = toNonEmptyString(item.correctAnswer).toUpperCase();
                if (!MC_LABELS.includes(correctAnswer)) {
                    return {
                        errorMessage: t('standardAssign:questionPool.validation.validCorrectOption', {
                            index: i + 1
                        })
                    };
                }
                normalizedQuestions.push({
                    questionText,
                    questionType,
                    options,
                    correctAnswer,
                    explanation,
                    difficulty,
                    grammarLevel: normalizeGrammarLevel(item.grammarLevel)
                });
                continue;
            }

            if (questionType === 'true_false') {
                const correctRaw = toNonEmptyString(item.correctAnswer).toLowerCase();
                const correctAnswer = correctRaw === 'false' ? 'False' : 'True';
                normalizedQuestions.push({
                    questionText,
                    questionType,
                    options: [
                        { label: 'A', text: 'True' },
                        { label: 'B', text: 'False' }
                    ],
                    correctAnswer,
                    explanation,
                    difficulty,
                    grammarLevel: normalizeGrammarLevel(item.grammarLevel)
                });
                continue;
            }
        }

        return { questions: normalizedQuestions };
    };

    const handleSave = async () => {
        const { questions: payloadQuestions, errorMessage } = buildPayload();
        if (errorMessage) {
            setLocalError(errorMessage);
            return;
        }
        setLocalError('');
        await onSave(payloadQuestions, changeSummary.trim());
    };

    const handleRegenerate = async (question, index) => {
        if (!assignmentId || typeof onRegenerateQuestion !== 'function') return;
        setLocalError('');
        await onRegenerateQuestion({
            questionIndex: index,
            questionType: normalizeQuestionType(question?.questionType),
            difficulty: normalizeDifficulty(question?.difficulty),
            grammarLevel: normalizeGrammarLevel(question?.grammarLevel)
        });
    };

    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                onClick={(event) => event.stopPropagation()}
                style={{ maxWidth: 960 }}
                role="dialog"
                aria-modal="true"
                aria-label={t('standardAssign:questionPool.modalAriaLabel')}
            >
                <div className="modal-header">
                    <h3>{t('standardAssign:questionPool.title')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState
                            message={error}
                            onRetry={onRetry}
                            disableRetry={!assignmentId}
                        />
                    ) : !data ? (
                        <ErrorState emptyText={t('standardAssign:questionPool.noData')} />
                    ) : (
                        <div className="question-pool-editor">
                            <div className="question-pool-editor-header">
                                <div>
                                    <strong>{assignmentTitle}</strong>
                                    <p className="text-muted" style={{ marginTop: 6 }}>
                                        {t('standardAssign:questionPool.formalAssessmentNote')}
                                    </p>
                                </div>
                                <span className="badge badge-info">
                                    {t('standardAssign:questionPool.workflow')}: {workflowStatusLabel}
                                </span>
                            </div>

                            {localError ? (
                                <div className="question-pool-editor-error">{localError}</div>
                            ) : null}

                            <div className="question-pool-editor-list">
                                {questions.map((question, index) => (
                                    <div className="question-pool-item" key={question.localId}>
                                        <div className="question-pool-item-header">
                                            <strong>{t('standardAssign:questionPool.questionIndex', { index: index + 1 })}</strong>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleRegenerate(question, index)}
                                                disabled={saving || regeneratingQuestionIndex === index}
                                            >
                                                {regeneratingQuestionIndex === index
                                                    ? t('standardAssign:actions.regenerating', {
                                                        defaultValue: 'Regenerating...'
                                                    })
                                                    : t('standardAssign:actions.regenerateQuestion', {
                                                        defaultValue: 'Regenerate'
                                                    })}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleRemoveQuestion(index)}
                                                disabled={questions.length <= 1 || saving || regeneratingQuestionIndex === index}
                                            >
                                                {t('standardAssign:actions.remove')}
                                            </button>
                                        </div>

                                        <div className="form-group">
                                            <label>{t('standardAssign:questionPool.labels.questionTextRequired')}</label>
                                            <textarea
                                                className="form-input"
                                                rows={3}
                                                value={question.questionText}
                                                onChange={(event) =>
                                                    updateQuestion(index, (current) => ({
                                                        ...current,
                                                        questionText: event.target.value
                                                    }))
                                                }
                                            />
                                        </div>

                                        <div className="question-pool-grid">
                                            <div className="form-group">
                                                <label>{t('standardAssign:questionPool.labels.questionType')}</label>
                                                <select
                                                    className="form-input"
                                                    value={question.questionType}
                                                    onChange={(event) =>
                                                        handleTypeChange(index, event.target.value)
                                                    }
                                                >
                                                    <option value="multiple_choice">
                                                        {t('standardAssign:questionPool.types.multipleChoice')}
                                                    </option>
                                                    <option value="true_false">{t('standardAssign:questionPool.types.trueFalse')}</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>{t('standardAssign:questionPool.labels.difficulty')}</label>
                                                <select
                                                    className="form-input"
                                                    value={question.difficulty}
                                                    onChange={(event) =>
                                                        updateQuestion(index, (current) => ({
                                                            ...current,
                                                            difficulty: event.target.value
                                                        }))
                                                    }
                                                >
                                                    <option value="easy">{t('standardAssign:difficulty.easy')}</option>
                                                    <option value="medium">{t('standardAssign:difficulty.medium')}</option>
                                                    <option value="hard">{t('standardAssign:difficulty.hard')}</option>
                                                </select>
                                            </div>
                                            {question.grammarLevel ? (
                                                <div className="form-group">
                                                    <label>
                                                        {t('standardAssign:questionPool.labels.grammarLevel', {
                                                            defaultValue: 'Grammar Level'
                                                        })}
                                                    </label>
                                                    <input
                                                        className="form-input"
                                                        value={question.grammarLevel
                                                            .split('_')
                                                            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                                                            .join(' ')}
                                                        readOnly
                                                    />
                                                </div>
                                            ) : null}
                                        </div>

                                        {question.questionType === 'multiple_choice' && (
                                            <div className="question-pool-options-grid">
                                                {MC_LABELS.map((label) => {
                                                    const option =
                                                        question.options.find(
                                                            (item) => item.label === label
                                                        ) || { label, text: '' };
                                                    return (
                                                        <div className="form-group" key={label}>
                                                            <label>{t('standardAssign:questionPool.labels.optionLabel', { label })}</label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={option.text}
                                                                onChange={(event) =>
                                                                    updateQuestion(index, (current) => ({
                                                                        ...current,
                                                                        options: MC_LABELS.map(
                                                                            (optionLabel) => {
                                                                                if (
                                                                                    optionLabel !==
                                                                                    label
                                                                                ) {
                                                                                    const existing =
                                                                                        current.options.find(
                                                                                            (opt) =>
                                                                                                opt.label ===
                                                                                                optionLabel
                                                                                        ) || {
                                                                                            label: optionLabel,
                                                                                            text: ''
                                                                                        };
                                                                                    return existing;
                                                                                }
                                                                                return {
                                                                                    label: optionLabel,
                                                                                    text: event.target.value
                                                                                };
                                                                            }
                                                                        )
                                                                    }))
                                                                }
                                                            />
                                                        </div>
                                                    );
                                                })}
                                                <div className="form-group">
                                                    <label>{t('standardAssign:questionPool.labels.correctOption')}</label>
                                                    <select
                                                        className="form-input"
                                                        value={question.correctAnswer}
                                                        onChange={(event) =>
                                                            updateQuestion(index, (current) => ({
                                                                ...current,
                                                                correctAnswer: event.target.value
                                                            }))
                                                        }
                                                    >
                                                        {MC_LABELS.map((label) => (
                                                            <option key={label} value={label}>
                                                                {label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {question.questionType === 'true_false' && (
                                            <div className="form-group">
                                                <label>{t('standardAssign:questionPool.labels.correctAnswer')}</label>
                                                <select
                                                    className="form-input"
                                                    value={question.correctAnswer}
                                                    onChange={(event) =>
                                                        updateQuestion(index, (current) => ({
                                                            ...current,
                                                            correctAnswer: event.target.value
                                                        }))
                                                    }
                                                >
                                                    <option value="True">{t('standardAssign:questionPool.true')}</option>
                                                    <option value="False">{t('standardAssign:questionPool.false')}</option>
                                                </select>
                                            </div>
                                        )}

                                        <div className="form-group">
                                            <label>{t('standardAssign:questionPool.labels.explanationOptional')}</label>
                                            <textarea
                                                className="form-input"
                                                rows={2}
                                                value={question.explanation}
                                                onChange={(event) =>
                                                    updateQuestion(index, (current) => ({
                                                        ...current,
                                                        explanation: event.target.value
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="question-pool-editor-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleAddQuestion}
                                    disabled={saving}
                                >
                                    {t('standardAssign:actions.addQuestion')}
                                </button>
                            </div>

                            <div className="form-group">
                                <label>{t('standardAssign:questionPool.labels.changeSummaryOptional')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={changeSummary}
                                    onChange={(event) => setChangeSummary(event.target.value)}
                                    placeholder={t('standardAssign:questionPool.changeSummaryPlaceholder')}
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={saving}
                    >
                        {t('standardAssign:actions.close')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading || !!error || !data || saving}
                    >
                        {saving
                            ? t('standardAssign:actions.saving')
                            : t('standardAssign:actions.saveQuestionPool')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuestionPoolEditorModal;
