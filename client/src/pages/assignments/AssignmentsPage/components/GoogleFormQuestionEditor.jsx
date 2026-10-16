import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineDownload, HiOutlinePlus, HiOutlineTrash, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import {
    buildGoogleFormQuestionCsvTemplate,
    MAX_IMPORT_FILE_BYTES,
    parseGoogleFormQuestionCsv
} from '../utils/googleFormQuestionCsv';

const createQuestion = () => ({
    type: 'multiple_choice',
    title: '',
    options: ['', ''],
    correctAnswer: '',
    points: 1
});

const GoogleFormQuestionEditor = ({ questions = [], onChange, disabled = false }) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);
    const [importingCsv, setImportingCsv] = useState(false);

    const downloadTemplate = () => {
        const blob = new Blob([buildGoogleFormQuestionCsvTemplate()], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'google-form-questions-template.csv';
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

    return (
        <section className="google-form-question-editor">
            <header>
                <div>
                    <h4>{t('assignments:googleForms.questionsTitle')}</h4>
                    <p className="text-muted">{t('assignments:googleForms.questionsHelp')}</p>
                </div>
                <div className="assignment-csv-import__actions">
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={disabled || importingCsv}
                        onClick={downloadTemplate}
                    >
                        <HiOutlineDownload />
                        {t('assignments:googleForms.csv.downloadTemplate')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
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
                        className="btn btn-outline"
                        disabled={disabled || questions.length >= 100}
                        onClick={() => onChange([...questions, createQuestion()])}
                    >
                        <HiOutlinePlus />
                        {t('assignments:googleForms.addQuestion')}
                    </button>
                </div>
            </header>

            {questions.map((question, index) => (
                <fieldset className="google-form-question" key={question.questionId || `question-${index}`} disabled={disabled}>
                    <legend>{t('assignments:googleForms.questionNumber', { number: index + 1 })}</legend>
                    <label>
                        {t('assignments:googleForms.prompt')}
                        <textarea
                            required
                            maxLength={1000}
                            value={question.title || ''}
                            onChange={(event) => updateQuestion(index, { title: event.target.value })}
                        />
                    </label>
                    <div className="google-form-question__settings">
                        <label>
                            {t('assignments:googleForms.questionType')}
                            <select
                                value={question.type}
                                onChange={(event) => {
                                    const type = event.target.value;
                                    updateQuestion(index, {
                                        type,
                                        ...(type === 'true_false'
                                            ? { options: ['True', 'False'], correctAnswer: 'True' }
                                            : type === 'short_answer'
                                                ? { options: [], correctAnswer: '', points: 0 }
                                                : { options: ['', ''], correctAnswer: '', points: 1 })
                                    });
                                }}
                            >
                                <option value="multiple_choice">{t('assignments:googleForms.multipleChoice')}</option>
                                <option value="true_false">{t('assignments:googleForms.trueFalse')}</option>
                                <option value="short_answer">{t('assignments:googleForms.shortAnswer')}</option>
                            </select>
                        </label>
                        {question.type !== 'short_answer' && (
                            <>
                                <label>
                                    {t('assignments:googleForms.points')}
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        step={1}
                                        value={question.points || 1}
                                        onChange={(event) => updateQuestion(index, { points: Number(event.target.value) })}
                                    />
                                </label>
                                <label>
                                    {t('assignments:googleForms.correctAnswer')}
                                    <select
                                        required
                                        value={question.correctAnswer || ''}
                                        onChange={(event) => updateQuestion(index, { correctAnswer: event.target.value })}
                                    >
                                        <option value="">{t('assignments:googleForms.selectCorrectAnswer')}</option>
                                        {(question.options || []).filter(Boolean).map((option, optionIndex) => (
                                            <option key={`${option}-${optionIndex}`} value={option}>{option}</option>
                                        ))}
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                    {question.type === 'multiple_choice' && (
                        <label>
                            {t('assignments:googleForms.options')}
                            <textarea
                                required
                                value={(question.options || []).join('\n')}
                                onChange={(event) => {
                                    const options = event.target.value.split('\n');
                                    updateQuestion(index, {
                                        options,
                                        correctAnswer: options.includes(question.correctAnswer)
                                            ? question.correctAnswer
                                            : ''
                                    });
                                }}
                                placeholder={t('assignments:googleForms.optionsHelp')}
                            />
                        </label>
                    )}
                    {question.type === 'short_answer' && (
                        <p className="text-muted">{t('assignments:googleForms.shortAnswerHelp')}</p>
                    )}
                    <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={questions.length <= 1}
                        onClick={() => onChange(questions.filter((_, currentIndex) => currentIndex !== index))}
                    >
                        <HiOutlineTrash />
                        {t('assignments:googleForms.removeQuestion')}
                    </button>
                </fieldset>
            ))}
        </section>
    );
};

export default GoogleFormQuestionEditor;
