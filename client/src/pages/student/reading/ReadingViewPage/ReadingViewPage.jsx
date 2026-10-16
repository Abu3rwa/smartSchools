import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft, HiOutlineLightBulb, HiOutlineQuestionMarkCircle } from 'react-icons/hi';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import { useReadingViewData } from './hooks/useReadingViewData';
import { findVocabularyMatches } from './vocabularyHighlight.js';
import { planAudio, playChain } from '../../../../utils/vocabAudio.js';
import { readStoredVoice } from '../../../../utils/voicePlayback.js';
import './ReadingViewPage.css';

const ReadingViewPage = () => {
  const { t } = useTranslation(['reading']);
  const navigate = useNavigate();
  const academicYear = useSelector(selectCurrentAcademicYear);

  const {
    content,
    loading,
    vocabulary,
    criticalThinkingQuestions,
    comprehensionQuestions,
    handleGetFeedback,
    handleQuizSubmit,
    ctAnswers,
    setCtAnswers,
    ctFeedback,
    quizAnswers,
    setQuizAnswers,
    quizSubmitted,
    progressSubmitting,
  } = useReadingViewData();

  const [vocabPopup, setVocabPopup] = useState(null);
  const [showCriticalThinking, setShowCriticalThinking] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const vocabularyPlayback = useRef(null);

  useEffect(() => () => {
    vocabularyPlayback.current?.cancel();
  }, []);

  const openVocabulary = (item, term) => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = playChain({
      urls: planAudio(item?.audio, readStoredVoice()),
      text: item?.original || term,
    });
    setVocabPopup(item);
  };

  const closeVocabulary = () => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = null;
    setVocabPopup(null);
  };

  const wrapTextWithVocabulary = (text) => {
    const matches = findVocabularyMatches(text, vocabulary);
    if (!matches.length) return text;
    const result = [];
    let cursor = 0;
    matches.forEach(({ start, end, term, vocabulary: definition }) => {
      if (start > cursor) result.push(text.slice(cursor, start));
      result.push(
        <button
          type="button"
          key={`v-${start}-${term}`}
          className="vocab-word"
          title={definition?.definition || definition?.simple}
          aria-label={`${term}: ${definition?.definition || definition?.simple || ''}`}
          onClick={() => openVocabulary(definition, term)}
        >
          {term}
        </button>
      );
      cursor = end;
    });
    if (cursor < text.length) result.push(text.slice(cursor));
    return result;
  };

  if (loading && !content) {
    return (
      <div className="reading-view-page">
        <div className="loading-container">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="reading-view-page">
        <button
          type="button"
          className="btn btn-ghost back-btn"
          onClick={() => navigate('/portal/reading')}
        >
          <HiOutlineArrowLeft size={18} />
          {t('reading:common.back')}
        </button>
        <p className="reading-error">{t('reading:view.loadFailed')}</p>
      </div>
    );
  }

  const bodyText = content.simplifiedContent || content.text?.originalText || '';
  const readingSections = (content.text?.sections?.length
    ? [...content.text.sections].sort((a, b) => a.order - b.order)
    : [{ order: 1, title: '', text: bodyText }]);
  const hasQuiz = comprehensionQuestions.length > 0;

  return (
    <div className="reading-view-page">
      <button
        type="button"
        className="btn btn-ghost back-btn"
        onClick={() => navigate('/portal/reading')}
      >
        <HiOutlineArrowLeft size={18} />
        {t('reading:common.back')}
      </button>

      <header className="reading-view-header">
        <h1>{content.text?.title}</h1>
        {content.targetLevel != null && (
          <span className="level-badge">{t('reading:view.gradeLevel', { level: content.targetLevel })}</span>
        )}
        {academicYear && (
          <span className="level-badge">{t('reading:view.academicYearShort', { year: academicYear })}</span>
        )}
      </header>

      <section className="reading-body">
        <p className="reading-instruction">
          {t('reading:view.vocabInstructionPrefix')} <span className="vocab-hint">{t('reading:view.vocabInstructionHighlighted')}</span> {t('reading:view.vocabInstructionSuffix')}
        </p>
        {readingSections.map((section) => (
          <article className="reading-text-section" key={section.order}>
            {section.title && <h2>{section.title}</h2>}
            <div className="reading-text">{wrapTextWithVocabulary(section.text)}</div>
          </article>
        ))}
      </section>

      {criticalThinkingQuestions.length > 0 && (
        <section className="reading-section critical-thinking">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowCriticalThinking(!showCriticalThinking)}
          >
            <HiOutlineLightBulb size={20} />
            {t('reading:view.criticalThinking', { count: criticalThinkingQuestions.length })}
          </button>
          {showCriticalThinking && (
            <ul className="critical-thinking-list">
              {[...criticalThinkingQuestions]
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((q, i) => (
                  <li key={i} className="ct-item">
                    <strong>{q.question}</strong>
                    {q.prompt && (
                      <p className="ct-prompt">{q.prompt}</p>
                    )}
                    <div className="ct-answer-block">
                      <label htmlFor={`ct-answer-${i}`} className="ct-answer-label">
                        {t('reading:view.yourAnswer')}
                      </label>
                      <textarea
                        id={`ct-answer-${i}`}
                        className="ct-answer-input"
                        value={ctAnswers[String(q._id)] || ''}
                        onChange={(e) =>
                          setCtAnswers((prev) => ({ ...prev, [String(q._id)]: e.target.value }))
                        }
                        placeholder={t('reading:view.answerPlaceholder')}
                        rows={4}
                        disabled={quizSubmitted || ctFeedback[String(q._id)]?.loading}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGetFeedback(String(q._id), q.question)}
                        disabled={quizSubmitted || ctFeedback[String(q._id)]?.loading || !(ctAnswers[String(q._id)] || '').trim()}
                      >
                        {ctFeedback[String(q._id)]?.loading ? t('reading:view.evaluating') : t('reading:view.getFeedback')}
                      </button>
                    </div>
                    {ctFeedback[String(q._id)]?.feedback && !ctFeedback[String(q._id)]?.loading && (
                      <div className="ct-feedback">
                        <span className="ct-feedback-label">{t('reading:view.feedback')}:</span>
                        <p className="ct-feedback-text">{ctFeedback[String(q._id)].feedback}</p>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {hasQuiz && (
        <section className="reading-section comprehension">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowQuiz(!showQuiz)}
          >
            <HiOutlineQuestionMarkCircle size={20} />
            {t('reading:view.comprehensionCheck')}
          </button>
          {showQuiz && (
            <div className="quiz-box">
              {!quizSubmitted ? (
                <>
                  <ol className="quiz-questions">
                    {[...comprehensionQuestions]
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((q, i) => (
                        <li key={i} className="quiz-item">
                          <span className="quiz-q">{q.question}</span>
                          <ul className="quiz-options">
                            {(q.options || []).map((opt, j) => (
                              <li key={j}>
                                <label className="quiz-option">
                                  <input
                                    type="radio"
                                    name={`q-${i}`}
                                    checked={quizAnswers[String(q._id)] === String(j)}
                                    onChange={() =>
                                      setQuizAnswers((prev) => ({
                                        ...prev,
                                        [String(q._id)]: String(j),
                                      }))
                                    }
                                  />
                                  {opt}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                  </ol>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleQuizSubmit}
                    disabled={
                      progressSubmitting ||
                      comprehensionQuestions.some((question) => (
                        !['0', '1', '2', '3', '4', '5'].includes(
                          String(quizAnswers[String(question._id)] ?? '')
                        )
                      ))
                    }
                  >
                    {progressSubmitting ? t('reading:common.submitting') : t('reading:view.submitAnswers')}
                  </button>
                </>
              ) : (
                <>
                  <ol className="quiz-questions">
                    {[...comprehensionQuestions]
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((question) => (
                        <li key={question._id} className="quiz-item">
                          <span className="quiz-q">{question.question}</span>
                          <p className="quiz-saved-answer">
                            {t('reading:view.yourAnswer')}: {question.options?.[Number(quizAnswers[String(question._id)])] || '—'}
                          </p>
                        </li>
                      ))}
                  </ol>
                  <p className="quiz-done">{t('reading:view.answersSaved')}</p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {!hasQuiz && !quizSubmitted && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleQuizSubmit}
          disabled={progressSubmitting}
        >
          {progressSubmitting ? t('reading:common.submitting') : t('reading:view.markComplete')}
        </button>
      )}

      {!hasQuiz && quizSubmitted && <p className="quiz-done">{t('reading:view.answersSaved')}</p>}

      {vocabPopup && (
        <div
          className="vocab-overlay"
          onClick={closeVocabulary}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && closeVocabulary()}
        >
          <div
            className="vocab-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vocab-popup-term">
              {vocabPopup.original}
              {vocabPopup.simple && vocabPopup.simple !== vocabPopup.original && (
                <span className="vocab-simple"> → {vocabPopup.simple}</span>
              )}
            </div>
            {(vocabPopup.meaning || vocabPopup.definition) && (
              <p className="vocab-popup-def">{vocabPopup.meaning || vocabPopup.definition}</p>
            )}
            {vocabPopup.arabicMeaning && vocabPopup.arabicMeaning !== (vocabPopup.meaning || vocabPopup.definition) && (
              <p className="vocab-popup-def" lang="ar" dir="rtl">{vocabPopup.arabicMeaning}</p>
            )}
            {Object.entries(vocabPopup.audio?.dictionaries || {}).flatMap(([dictionary, recording]) => (
              ['us', 'uk', ...(recording.examples ? ['examples'] : [])]
                .filter((kind) => recording[kind])
                .map((kind) => {
                  const urls = kind === 'examples' ? recording.examples : [recording[kind]];
                  return urls.map((url, index) => (
                    <div className="vocab-audio" key={`${dictionary}-${kind}-${index}`}>
                      <span>{`${dictionary} ${kind === 'examples' ? t('reading:view.exampleAudio') : kind.toUpperCase()}`}</span>
                      <audio controls preload="none" src={url} aria-label={`${vocabPopup.original} ${dictionary} ${kind}`}>
                        {t('reading:view.audioUnsupported')}
                      </audio>
                    </div>
                  ));
                })
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={closeVocabulary}
            >
              {t('reading:common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadingViewPage;
