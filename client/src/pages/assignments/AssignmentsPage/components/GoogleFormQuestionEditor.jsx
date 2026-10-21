import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineDownload,
    HiOutlineInformationCircle,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineUpload,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import {
    buildGoogleFormQuestionCsvTemplate,
    MAX_IMPORT_FILE_BYTES,
    parseGoogleFormQuestionCsv
} from '../utils/googleFormQuestionCsv';

const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 20;
const MIN_OPTIONS = 2;
const TYPE_LABEL_KEYS = {
    multiple_choice: 'multipleChoice',
    true_false: 'trueFalse',
    short_answer: 'shortAnswer'
};

const createQuestion = () => ({
    type: 'multiple_choice',
    title: '',
    options: ['', ''],
    correctAnswer: '',
    points: 1
});

const getOptions = (question) => (Array.isArray(question.options) ? question.options : []);

const getValidPoints = (question) => {
    const points = Number(question.points);
    return Number.isFinite(points) && points >= 1 ? points : 1;
};

const GoogleFormQuestionEditor = ({ questions = [], onChange, disabled = false }) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);
    const [importingCsv, setImportingCsv] = useState(false);

    const summary = useMemo(() => {
        const totalPoints = questions.reduce((total, question) => (
            question.type === 'short_answer' ? total : total + (Number(question.points) || 0)
        ), 0);
        const manualCount = questions.filter((question) => question.type === 'short_answer').length;
        return { totalPoints, manualCount };
    }, [questions]);

    const downloadTemplate = () => {
        const blob = new Blob([buildGoogleFormQuestionCsvTemplate()], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'google-form-questions-sample.csv';
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    const importQuestions = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!/\.csv$/i.test(file.name)) {
            toast.error(t('assignments:googleForms.csv.invalidFile'));
            return;
        }
        if (file.size > MAX_IMPORT_FILE_BYTES) {
            toast.error(t('assignments:googleForms.csv.fileTooLarge'));
            return;
        }
        if (questions.length > 0 && !window.confirm(t('assignments:googleForms.csv.replaceConfirm'))) return;

        setImportingCsv(true);
        try {
            const imported = parseGoogleFormQuestionCsv(await file.text());
            onChange(imported);
            toast.success(t('assignments:googleForms.csv.imported', { count: imported.length }));
        } catch (error) {
            toast.error(error.message || t('assignments:googleForms.csv.failed'));
        } finally {
            setImportingCsv(false);
        }
    };

    const updateQuestion = (index, update) => {
        onChange(questions.map((question, currentIndex) => (
            currentIndex === index ? { ...question, ...update } : question
        )));
    };

    const addQuestion = () => {
        if (questions.length >= MAX_QUESTIONS) return;
        onChange([...questions, createQuestion()]);
    };

    const removeQuestion = (index) => {
        if (questions.length <= 1) return;
        const question = questions[index];
        const hasContent = Boolean(String(question.title || '').trim())
            || getOptions(question).some((option) => String(option || '').trim());
        if (hasContent && !window.confirm(t('assignments:googleForms.removeConfirm', { number: index + 1 }))) {
            return;
        }
        onChange(questions.filter((_, currentIndex) => currentIndex !== index));
    };

    const changeType = (index, type) => {
        const question = questions[index];
        const points = getValidPoints(question);
        if (type === 'true_false') {
            updateQuestion(index, {
                type,
                options: ['True', 'False'],
                correctAnswer: 'True',
                points
            });
            return;
        }
        if (type === 'short_answer') {
            updateQuestion(index, { type, options: [], correctAnswer: '', points: 0 });
            return;
        }
        updateQuestion(index, {
            type: 'multiple_choice',
            options: ['', ''],
            correctAnswer: '',
            points
        });
    };

    const changeOption = (index, optionIndex, value) => {
        const question = questions[index];
        const options = [...getOptions(question)];
        const previous = options[optionIndex];
        options[optionIndex] = value;
        let correctAnswer = question.correctAnswer || '';
        if (correctAnswer === previous) correctAnswer = value;
        if (!options.includes(correctAnswer)) correctAnswer = '';
        updateQuestion(index, { options, correctAnswer });
    };

    const addOption = (index) => {
        const options = getOptions(questions[index]);
        if (options.length >= MAX_OPTIONS) return;
        updateQuestion(index, { options: [...options, ''] });
    };

    const removeOption = (index, optionIndex) => {
        const question = questions[index];
        const options = getOptions(question);
        if (options.length <= MIN_OPTIONS) return;
        const removed = options[optionIndex];
        const nextOptions = options.filter((_, currentIndex) => currentIndex !== optionIndex);
        const correctAnswer = question.correctAnswer === removed || !nextOptions.includes(question.correctAnswer)
            ? ''
            : question.correctAnswer;
        updateQuestion(index, { options: nextOptions, correctAnswer });
    };

    return (
        <section className="quiz-builder" aria-labelledby="quiz-builder-title">
            <header className="quiz-builder__head">
                <div className="quiz-builder__intro">
                    <span className="quiz-builder__icon" aria-hidden="true">
                        <HiOutlineClipboardList />
                    </span>
                    <div>
                        <h4 id="quiz-builder-title">{t('assignments:googleForms.questionsTitle')}</h4>
                        <p>{t('assignments:googleForms.questionsHelp')}</p>
                    </div>
                </div>
                <div className="quiz-builder__actions">
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={disabled || importingCsv}
                        onClick={downloadTemplate}
                    >
                        <HiOutlineDownload />
                        {t('assignments:googleForms.csv.downloadTemplate')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={disabled || importingCsv}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <HiOutlineUpload />
                        {importingCsv
                            ? t('assignments:googleForms.csv.importing')
                            : t('assignments:googleForms.csv.import')}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        hidden
                        aria-label={t('assignments:googleForms.csv.import')}
                        onChange={importQuestions}
                    />
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={disabled || questions.length >= MAX_QUESTIONS}
                        onClick={addQuestion}
                    >
                        <HiOutlinePlus />
                        {t('assignments:googleForms.addQuestion')}
                    </button>
                </div>
            </header>

            <div className="quiz-builder__toolbar">
                <div className="quiz-builder__stats">
                    <span className="quiz-builder__stat">
                        <strong>{questions.length}</strong>
                        {t('assignments:googleForms.statQuestions')}
                    </span>
                    <span className="quiz-builder__stat">
                        <strong>{summary.totalPoints}</strong>
                        {t('assignments:googleForms.totalPoints')}
                    </span>
                    <span className="quiz-builder__stat">
                        <strong>{summary.manualCount}</strong>
                        {t('assignments:googleForms.manualReview')}
                    </span>
                </div>
                <details className="quiz-builder__csv">
                    <summary>
                        <HiOutlineInformationCircle aria-hidden="true" />
                        {t('assignments:googleForms.csvFormat')}
                    </summary>
                    <p>{t('assignments:googleForms.csv.help')}</p>
                </details>
            </div>

            {questions.length === 0 ? (
                <div className="quiz-builder__empty">
                    <span className="quiz-builder__empty-icon" aria-hidden="true">
                        <HiOutlineClipboardList />
                    </span>
                    <strong>{t('assignments:googleForms.questionsEmptyTitle')}</strong>
                    <p>{t('assignments:googleForms.questionsEmptyHelp')}</p>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={disabled}
                        onClick={addQuestion}
                    >
                        <HiOutlinePlus />
                        {t('assignments:googleForms.addFirstQuestion')}
                    </button>
                </div>
            ) : (
                <>
                    <div className="quiz-builder__list">
                        {questions.map((question, index) => {
                            const options = getOptions(question);
                            const type = question.type || 'multiple_choice';
                            const points = type === 'short_answer' ? 0 : getValidPoints(question);
                            return (
                                <fieldset
                                    className="quiz-question"
                                    key={question.questionId || `question-${index}`}
                                    disabled={disabled}
                                >
                                    <legend className="quiz-question__legend">
                                        {t('assignments:googleForms.questionNumber', { number: index + 1 })}
                                    </legend>
                                    <header className="quiz-question__head">
                                        <span className="quiz-question__number" aria-hidden="true">{index + 1}</span>
                                        <div className="quiz-question__meta">
                                            <span className="quiz-question__type">
                                                {t(`assignments:googleForms.${TYPE_LABEL_KEYS[type] || 'multipleChoice'}`)}
                                            </span>
                                            {type === 'short_answer' ? (
                                                <span className="quiz-question__points quiz-question__points--muted">
                                                    {t('assignments:googleForms.manualReview')}
                                                </span>
                                            ) : (
                                                <span className="quiz-question__points">
                                                    {t('assignments:googleForms.pointsBadge', { count: points })}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="quiz-question__remove"
                                            disabled={disabled || questions.length <= 1}
                                            onClick={() => removeQuestion(index)}
                                            aria-label={t('assignments:googleForms.removeQuestion')}
                                            title={t('assignments:googleForms.removeQuestion')}
                                        >
                                            <HiOutlineTrash aria-hidden="true" />
                                        </button>
                                    </header>

                                    <div className="quiz-question__body">
                                        <label className="quiz-field">
                                            <span>{t('assignments:googleForms.prompt')}</span>
                                            <textarea
                                                required
                                                rows={2}
                                                maxLength={1000}
                                                value={question.title || ''}
                                                onChange={(event) => updateQuestion(index, { title: event.target.value })}
                                            />
                                        </label>

                                        <div className="quiz-question__settings">
                                            <label className="quiz-field">
                                                <span>{t('assignments:googleForms.questionType')}</span>
                                                <select
                                                    value={type}
                                                    onChange={(event) => changeType(index, event.target.value)}
                                                >
                                                    <option value="multiple_choice">{t('assignments:googleForms.multipleChoice')}</option>
                                                    <option value="true_false">{t('assignments:googleForms.trueFalse')}</option>
                                                    <option value="short_answer">{t('assignments:googleForms.shortAnswer')}</option>
                                                </select>
                                            </label>
                                            {type !== 'short_answer' && (
                                                <label className="quiz-field quiz-field--points">
                                                    <span>{t('assignments:googleForms.points')}</span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={1000}
                                                        step={1}
                                                        required
                                                        value={question.points ?? 1}
                                                        onChange={(event) => updateQuestion(index, {
                                                            points: event.target.value === ''
                                                                ? ''
                                                                : Number(event.target.value)
                                                        })}
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        {type === 'multiple_choice' && (
                                            <div
                                                className="quiz-options"
                                                role="group"
                                                aria-label={t('assignments:googleForms.options')}
                                            >
                                                <div className="quiz-options__head">
                                                    <span className="quiz-options__title">
                                                        {t('assignments:googleForms.options')}
                                                    </span>
                                                    <span className="quiz-options__hint">
                                                        {t('assignments:googleForms.optionsHelp')}
                                                    </span>
                                                </div>
                                                <div className="quiz-options__list">
                                                    {options.map((option, optionIndex) => (
                                                        <div className="quiz-option" key={`option-${optionIndex}`}>
                                                            <input
                                                                type="radio"
                                                                name={`quiz-correct-${index}`}
                                                                required
                                                                checked={Boolean(option) && question.correctAnswer === option}
                                                                disabled={disabled || !String(option || '').trim()}
                                                                onChange={() => updateQuestion(index, { correctAnswer: option })}
                                                                aria-label={t('assignments:googleForms.markCorrect')}
                                                                title={t('assignments:googleForms.markCorrect')}
                                                            />
                                                            <input
                                                                type="text"
                                                                className="quiz-option__input"
                                                                maxLength={500}
                                                                required={optionIndex < MIN_OPTIONS}
                                                                value={option}
                                                                placeholder={t('assignments:googleForms.optionPlaceholder', {
                                                                    number: optionIndex + 1
                                                                })}
                                                                onChange={(event) => changeOption(index, optionIndex, event.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="quiz-option__remove"
                                                                disabled={disabled || options.length <= MIN_OPTIONS}
                                                                onClick={() => removeOption(index, optionIndex)}
                                                                aria-label={t('assignments:googleForms.removeOption')}
                                                                title={t('assignments:googleForms.removeOption')}
                                                            >
                                                                <HiOutlineX aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm quiz-options__add"
                                                    disabled={disabled || options.length >= MAX_OPTIONS}
                                                    onClick={() => addOption(index)}
                                                >
                                                    <HiOutlinePlus />
                                                    {t('assignments:googleForms.addOption')}
                                                </button>
                                            </div>
                                        )}

                                        {type === 'true_false' && (
                                            <div className="quiz-truefalse">
                                                <span className="quiz-field__label">
                                                    {t('assignments:googleForms.correctAnswer')}
                                                </span>
                                                <div className="quiz-truefalse__choices" role="group" aria-label={t('assignments:googleForms.correctAnswer')}>
                                                    {['True', 'False'].map((choice) => {
                                                        const isActive = question.correctAnswer === choice;
                                                        return (
                                                            <button
                                                                key={choice}
                                                                type="button"
                                                                className={`quiz-truefalse__choice${isActive ? ' is-active' : ''}`}
                                                                aria-pressed={isActive}
                                                                disabled={disabled}
                                                                onClick={() => updateQuestion(index, { correctAnswer: choice })}
                                                            >
                                                                {isActive && <HiOutlineCheckCircle aria-hidden="true" />}
                                                                {choice === 'True'
                                                                    ? t('assignments:googleForms.trueLabel')
                                                                    : t('assignments:googleForms.falseLabel')}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {type === 'short_answer' && (
                                            <div className="quiz-callout">
                                                <HiOutlineInformationCircle aria-hidden="true" />
                                                <p>{t('assignments:googleForms.shortAnswerHelp')}</p>
                                            </div>
                                        )}
                                    </div>
                                </fieldset>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        className="quiz-builder__add-more"
                        disabled={disabled || questions.length >= MAX_QUESTIONS}
                        onClick={addQuestion}
                    >
                        <HiOutlinePlus aria-hidden="true" />
                        {t('assignments:googleForms.addQuestion')}
                    </button>
                </>
            )}
        </section>
    );
};

export default GoogleFormQuestionEditor;
