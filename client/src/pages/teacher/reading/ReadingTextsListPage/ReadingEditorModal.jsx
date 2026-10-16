import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const toEditorData = (reading) => ({
  title: reading.title || '',
  subjectArea: reading.subjectArea || '',
  sourceDocument: reading.sourceDocument || '',
  language: reading.language || 'en',
  topicTags: (reading.topicTags || []).join('|'),
  isShared: reading.isShared === true,
  sections: reading.sections?.length
    ? reading.sections.map(({ order, title, text }) => ({ order, title, text }))
    : [{ order: 1, title: '', text: reading.originalText || '' }],
  vocabularySubstitutions: (reading.vocabularySubstitutions || []).map((item) => ({ ...item })),
  questions: [
    ...(reading.comprehensionQuestions || []).map((question) => ({
      type: question.type === 'true_false' ? 'true_false' : 'multiple_choice',
      question: question.question || '',
      options: (question.options || []).join('|'),
      correctAnswer: question.type === 'true_false'
        ? (question.correctIndex === 0 ? 'True' : 'False')
        : question.options?.[question.correctIndex] || '',
      prompt: '',
    })),
    ...(reading.criticalThinkingQuestions || []).map((question) => ({
      type: 'short_answer',
      question: question.question || '',
      options: '',
      correctAnswer: '',
      prompt: question.prompt || '',
    })),
  ],
});

const EMPTY_SECTION = () => ({ title: '', text: '' });
const EMPTY_VOCABULARY = () => ({ original: '', simple: '', definition: '' });
const EMPTY_QUESTION = () => ({ type: 'multiple_choice', question: '', options: '', correctAnswer: '', prompt: '' });

export default function ReadingEditorModal({ reading, saving, onClose, onSave }) {
  const { t } = useTranslation(['reading']);
  const [form, setForm] = useState(() => toEditorData(reading));
  const [error, setError] = useState('');

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateItem = (key, index, field, value) => setForm((current) => ({
    ...current,
    [key]: current[key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));
  const removeItem = (key, index) => setForm((current) => ({
    ...current,
    [key]: current[key].filter((_, itemIndex) => itemIndex !== index)
      .map((item, itemIndex) => key === 'sections' ? { ...item, order: itemIndex + 1 } : item),
  }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const sections = form.sections.map((section, index) => ({ ...section, order: index + 1 }));
    const questions = form.questions.map((question, index) => {
      if (question.type === 'short_answer') {
        return { type: question.type, question: question.question, prompt: question.prompt, order: index + 1 };
      }
      if (question.type === 'true_false') {
        return { type: question.type, question: question.question, correctAnswer: question.correctAnswer === 'True', order: index + 1 };
      }
      const options = question.options.split('|').map((option) => option.trim()).filter(Boolean);
      const correctIndex = options.findIndex((option) => option.toLocaleLowerCase() === question.correctAnswer.trim().toLocaleLowerCase());
      return { type: question.type, question: question.question, options, correctIndex, order: index + 1 };
    });
    const payload = {
      title: form.title,
      subjectArea: form.subjectArea,
      sourceDocument: form.sourceDocument,
      language: form.language,
      topicTags: form.topicTags.split('|').map((tag) => tag.trim()).filter(Boolean),
      isShared: form.isShared,
      sections,
      originalText: sections.map((section) => section.text).join('\n\n'),
      vocabularySubstitutions: form.vocabularySubstitutions.filter((item) => item.original.trim()),
      questions,
    };
    try {
      await onSave(payload);
    } catch (saveError) {
      setError(saveError.response?.data?.message || t('reading:texts.editFailed'));
    }
  };

  return (
    <div className="modal-overlay reading-editor-overlay" onClick={onClose}>
      <section
        className="modal-content reading-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="reading-editor-title">{t('reading:texts.editTitle', { title: reading.title })}</h2>
        <p className="reading-editor-notice">{t('reading:texts.editNotice')}</p>
        <form onSubmit={submit}>
          <div className="reading-editor-grid">
            <label>{t('reading:texts.titleField')}<input required maxLength={200} value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
            <label>{t('reading:texts.subjectField')}<input maxLength={100} value={form.subjectArea} onChange={(event) => update('subjectArea', event.target.value)} /></label>
            <label>{t('reading:texts.sourceField')}<input maxLength={200} value={form.sourceDocument} onChange={(event) => update('sourceDocument', event.target.value)} /></label>
            <label>{t('reading:texts.languageField')}<input maxLength={20} value={form.language} onChange={(event) => update('language', event.target.value)} /></label>
            <label className="reading-editor-wide">{t('reading:texts.tagsField')}<input value={form.topicTags} onChange={(event) => update('topicTags', event.target.value)} /></label>
            <label className="reading-editor-checkbox"><input type="checkbox" checked={form.isShared} onChange={(event) => update('isShared', event.target.checked)} />{t('reading:texts.shareWithSchool')}</label>
          </div>

          <section className="reading-editor-group">
            <div className="reading-editor-group-heading"><h3>{t('reading:texts.sectionsField')}</h3><button type="button" className="btn btn-secondary btn-sm" onClick={() => update('sections', [...form.sections, EMPTY_SECTION()])}>{t('reading:texts.addSection')}</button></div>
            {form.sections.map((section, index) => (
              <fieldset className="reading-editor-item" key={`section-${index}`}>
                <legend>{t('reading:texts.sectionItem', { number: index + 1 })}</legend>
                <label>{t('reading:texts.sectionTitleField')}<input maxLength={200} value={section.title} onChange={(event) => updateItem('sections', index, 'title', event.target.value)} /></label>
                <label>{t('reading:texts.sectionTextField')}<textarea required maxLength={50000} rows={5} value={section.text} onChange={(event) => updateItem('sections', index, 'text', event.target.value)} /></label>
                {form.sections.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem('sections', index)}>{t('reading:texts.removeSection')}</button>}
              </fieldset>
            ))}
          </section>

          <section className="reading-editor-group">
            <div className="reading-editor-group-heading"><h3>{t('reading:texts.vocabularyField')}</h3><button type="button" className="btn btn-secondary btn-sm" onClick={() => update('vocabularySubstitutions', [...form.vocabularySubstitutions, EMPTY_VOCABULARY()])}>{t('reading:texts.addVocabulary')}</button></div>
            {form.vocabularySubstitutions.map((item, index) => (
              <fieldset className="reading-editor-item" key={`vocab-${index}`}>
                <legend>{t('reading:texts.vocabularyItem', { number: index + 1 })}</legend>
                <label>{t('reading:texts.vocabularyTerm')}<input required value={item.original} onChange={(event) => updateItem('vocabularySubstitutions', index, 'original', event.target.value)} /></label>
                <label>{t('reading:texts.vocabularySimplification')}<input value={item.simple} onChange={(event) => updateItem('vocabularySubstitutions', index, 'simple', event.target.value)} /></label>
                <label>{t('reading:texts.vocabularyDefinition')}<textarea required value={item.definition} onChange={(event) => updateItem('vocabularySubstitutions', index, 'definition', event.target.value)} /></label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem('vocabularySubstitutions', index)}>{t('reading:texts.removeVocabulary')}</button>
              </fieldset>
            ))}
          </section>

          <section className="reading-editor-group">
            <div className="reading-editor-group-heading"><h3>{t('reading:texts.questionsField')}</h3><button type="button" className="btn btn-secondary btn-sm" onClick={() => update('questions', [...form.questions, EMPTY_QUESTION()])}>{t('reading:texts.addQuestion')}</button></div>
            {form.questions.map((question, index) => (
              <fieldset className="reading-editor-item" key={`question-${index}`}>
                <legend>{t('reading:texts.questionItem', { number: index + 1 })}</legend>
                <label>{t('reading:texts.questionType')}<select value={question.type} onChange={(event) => updateItem('questions', index, 'type', event.target.value)}>
                  <option value="multiple_choice">{t('reading:texts.multipleChoice')}</option>
                  <option value="true_false">{t('reading:texts.trueFalse')}</option>
                  <option value="short_answer">{t('reading:texts.shortAnswer')}</option>
                </select></label>
                <label>{t('reading:texts.questionField')}<textarea required value={question.question} onChange={(event) => updateItem('questions', index, 'question', event.target.value)} /></label>
                {question.type === 'multiple_choice' && <>
                  <label>{t('reading:texts.optionsField')}<input required value={question.options} onChange={(event) => updateItem('questions', index, 'options', event.target.value)} /></label>
                  <label>{t('reading:texts.correctAnswerField')}<input required value={question.correctAnswer} onChange={(event) => updateItem('questions', index, 'correctAnswer', event.target.value)} /></label>
                </>}
                {question.type === 'true_false' && <label>{t('reading:texts.correctAnswerField')}<select value={question.correctAnswer} onChange={(event) => updateItem('questions', index, 'correctAnswer', event.target.value)}><option value="True">{t('reading:texts.trueOption')}</option><option value="False">{t('reading:texts.falseOption')}</option></select></label>}
                {question.type === 'short_answer' && <label>{t('reading:texts.promptField')}<textarea value={question.prompt} onChange={(event) => updateItem('questions', index, 'prompt', event.target.value)} /></label>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem('questions', index)}>{t('reading:texts.removeQuestion')}</button>
              </fieldset>
            ))}
          </section>

          {error && <p className="reading-csv-error" role="alert">{error}</p>}
          <div className="reading-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('reading:common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('reading:texts.saving') : t('reading:texts.saveChanges')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
