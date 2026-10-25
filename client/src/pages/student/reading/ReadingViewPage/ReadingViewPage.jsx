import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Popover } from '@mui/material';
import {
  HiOutlineArrowLeft,
  HiOutlineCheckCircle,
  HiOutlineLightBulb,
  HiOutlineQuestionMarkCircle,
  HiOutlineStop,
  HiOutlineVolumeUp,
  HiOutlineX,
} from 'react-icons/hi';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import { useReadingViewData } from './hooks/useReadingViewData';
import { findVocabularyMatches } from './vocabularyHighlight.js';
import {
  buildReadingLevels,
  findLevelIndex,
  mergeVocabulary,
  readingBlocksFor,
} from './readingPresentation.js';
import { canSpeak, chunkForSpeech, speechLang, speakChunks } from './readAloud.js';
import { planAudio, playChain, hasRecording } from '../../../../utils/vocabAudio.js';
import { readStoredVoice } from '../../../../utils/voicePlayback.js';
import './ReadingViewPage.css';

const isOptionAnswered = (question, quizAnswers) => {
  const raw = quizAnswers[String(question._id)];
  const index = Number(raw);
  return String(raw ?? '') !== ''
    && Number.isInteger(index)
    && index >= 0
    && index < (question.options?.length || 0);
};

const scoreTier = (correctCount, totalCount) => {
  const ratio = totalCount ? correctCount / totalCount : 0;
  if (ratio >= 0.8) return 'resultGreat';
  if (ratio >= 0.5) return 'resultGood';
  return 'resultKeepGoing';
};

const ReadingViewPage = () => {
  const { t, i18n } = useTranslation(['reading']);
  const navigate = useNavigate();
  const academicYear = useSelector(selectCurrentAcademicYear);

  const {
    content,
    loading,
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
    score,
  } = useReadingViewData();

  const [vocab, setVocab] = useState({ anchorEl: null, item: null });
  const [selection, setSelection] = useState({ textKey: null, index: 0 });
  const [speakingKey, setSpeakingKey] = useState(null);
  const vocabularyPlayback = useRef(null);
  const speechRef = useRef(null);

  const levels = useMemo(() => buildReadingLevels(content), [content]);
  const recommendedIndex = findLevelIndex(levels, content?.targetLevel);
  const textKey = String(content?.text?._id || '');
  const activeLevelIndex = selection.textKey === textKey
    ? Math.min(selection.index, levels.length - 1)
    : recommendedIndex;

  useEffect(() => () => {
    vocabularyPlayback.current?.cancel();
    speechRef.current?.cancel();
  }, []);

  const stopReadingAloud = () => {
    speechRef.current?.cancel();
    speechRef.current = null;
    setSpeakingKey(null);
  };

  const activeLevel = levels[activeLevelIndex];
  const blocks = useMemo(() => (activeLevel ? readingBlocksFor(activeLevel) : []), [activeLevel]);
  const vocabulary = useMemo(
    () => mergeVocabulary(content?.vocabularySubstitutions, activeLevel?.vocabularySubstitutions),
    [content?.vocabularySubstitutions, activeLevel]
  );
  const passageText = blocks.map((block) => block.text).join('\n\n');
  const languageCode = content?.text?.language || (i18n.dir() === 'rtl' ? 'ar' : 'en');
  const audioSupported = canSpeak();

  const closeVocabulary = () => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = null;
    setVocab({ anchorEl: null, item: null });
  };

  const playVocabularyWord = (item, term) => {
    vocabularyPlayback.current?.cancel();
    vocabularyPlayback.current = playChain({
      urls: planAudio(item?.audio, readStoredVoice()),
      text: item?.original || term,
    });
  };

  const openVocabulary = (event, item, term) => {
    playVocabularyWord(item, term);
    setVocab({ anchorEl: event.currentTarget, item });
  };

  const toggleReadAloud = (key, text) => {
    if (speakingKey === key) {
      stopReadingAloud();
      return;
    }
    closeVocabulary();
    speechRef.current = speakChunks(chunkForSpeech(text), {
      lang: speechLang(languageCode),
      onEnd: () => {
        setSpeakingKey(null);
        speechRef.current = null;
      },
    });
    setSpeakingKey(key);
  };

  const switchLevel = (index) => {
    if (index === activeLevelIndex) return;
    stopReadingAloud();
    closeVocabulary();
    setSelection({ textKey, index });
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

  if (!content || !activeLevel) {
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

  const hasQuiz = comprehensionQuestions.length > 0;
  const answeredCount = comprehensionQuestions.filter((question) => isOptionAnswered(question, quizAnswers)).length;
  const thinkingAnswered = criticalThinkingQuestions
    .filter((question) => (ctAnswers[String(question._id)] || '').trim()).length;
  const sortedQuestions = [...comprehensionQuestions]
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const sortedThinking = [...criticalThinkingQuestions]
    .sort((a, b) => (a.order || 0) - (b.order || 0));

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
          onClick={(event) => openVocabulary(event, definition, term)}
        >
          {term}
        </button>
      );
      cursor = end;
    });
    if (cursor < text.length) result.push(text.slice(cursor));
    return result;
  };

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

      <header className="reading-hero">
        <h1 className="reading-hero-title">{content.text?.title}</h1>
        <div className="reading-hero-meta">
          {content.targetLevel != null && (
            <span className="reading-chip is-recommended">
              {t('reading:view.gradeLevel', { level: Math.round(content.targetLevel) })}
              {content.levelIsRecommended && (
                <>
                  {' · '}
                  {t('reading:view.forYou')}
                </>
              )}
            </span>
          )}
          {academicYear && (
            <span className="reading-chip">{t('reading:view.academicYearShort', { year: academicYear })}</span>
          )}
        </div>
        {levels.length > 1 && (
          <div className="reading-levels" role="group" aria-label={t('reading:view.levelsLabel')}>
            {levels.map((level, index) => (
              <button
                type="button"
                key={level.targetLevel}
                className={`level-chip${index === activeLevelIndex ? ' active' : ''}`}
                aria-pressed={index === activeLevelIndex}
                onClick={() => switchLevel(index)}
              >
                {t('reading:view.gradeLevel', { level: level.targetLevel })}
                {index === recommendedIndex && content.levelIsRecommended && (
                  <span className="level-chip-flag">{t('reading:view.forYou')}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {levels.length > 1 && (
          <p className="reading-levels-hint">{t('reading:view.levelsHint')}</p>
        )}
      </header>

      <article className="reading-passage">
        <p className="reading-instruction">
          {t('reading:view.vocabInstructionPrefix')}{' '}
          <span className="vocab-hint">{t('reading:view.vocabInstructionHighlighted')}</span>
          {t('reading:view.vocabInstructionSuffix')}
        </p>
        {blocks.map((block) => (
          <section className="reading-block" key={block.key}>
            {block.title && <h2 className="reading-block-title">{block.title}</h2>}
            <div className="reading-text">{wrapTextWithVocabulary(block.text)}</div>
            {audioSupported && (
              <button
                type="button"
                className={`listen-btn${speakingKey === block.key ? ' speaking' : ''}`}
                onClick={() => toggleReadAloud(block.key, block.text)}
              >
                {speakingKey === block.key ? <HiOutlineStop size={16} /> : <HiOutlineVolumeUp size={16} />}
                {speakingKey === block.key ? t('reading:view.stop') : t('reading:view.listen')}
              </button>
            )}
          </section>
        ))}
      </article>

      {quizSubmitted && score?.totalCount > 0 && (
        <section className="reading-result">
          <div className="result-score">
            <HiOutlineCheckCircle size={22} />
            <span>{t('reading:view.resultScore', {
              correct: score.correctCount,
              total: score.totalCount,
            })}</span>
          </div>
          <div className="progress-track" role="presentation">
            <div
              className="progress-fill"
              style={{ width: `${Math.round((score.correctCount / score.totalCount) * 100)}%` }}
            />
          </div>
          <p className="result-message">{t(`reading:view.${scoreTier(score.correctCount, score.totalCount)}`)}</p>
        </section>
      )}

      {criticalThinkingQuestions.length > 0 && (
        <section className="reading-task">
          <div className="reading-task-head">
            <h2>
              <HiOutlineLightBulb size={20} />
              {t('reading:view.criticalThinking', { total: criticalThinkingQuestions.length })}
            </h2>
            <span className="reading-task-count">
              {t('reading:view.thinkingProgress', {
                answered: thinkingAnswered,
                total: criticalThinkingQuestions.length,
              })}
            </span>
          </div>
          <ol className="thinking-list">
            {sortedThinking.map((question, index) => {
              const key = String(question._id);
              const feedback = ctFeedback[key];
              return (
                <li key={key} className="thinking-item">
                  <p className="thinking-question">{question.question}</p>
                  {question.prompt && <p className="thinking-prompt">{question.prompt}</p>}
                  <label className="thinking-answer-label" htmlFor={`ct-answer-${index}`}>
                    {t('reading:view.yourAnswer')}
                  </label>
                  <textarea
                    id={`ct-answer-${index}`}
                    className="thinking-answer"
                    value={ctAnswers[key] || ''}
                    onChange={(event) => setCtAnswers((prev) => ({ ...prev, [key]: event.target.value }))}
                    placeholder={t('reading:view.answerPlaceholder')}
                    rows={3}
                    disabled={quizSubmitted || Boolean(feedback?.loading)}
                  />
                  {quizSubmitted ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGetFeedback(key, question.question, passageText)}
                      disabled={feedback?.loading || !(ctAnswers[key] || '').trim()}
                    >
                      {feedback?.loading ? t('reading:view.evaluating') : t('reading:view.getFeedback')}
                    </button>
                  ) : (
                    <p className="thinking-hint">{t('reading:view.feedbackAfterSubmit')}</p>
                  )}
                  {feedback?.feedback && !feedback?.loading && (
                    <div className="thinking-feedback">
                      <span className="thinking-feedback-label">{t('reading:view.feedback')}</span>
                      <p>{feedback.feedback}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {hasQuiz && (
        <section className="reading-task">
          <div className="reading-task-head">
            <h2>
              <HiOutlineQuestionMarkCircle size={20} />
              {t('reading:view.comprehensionCheck')}
            </h2>
            <span className="reading-task-count">
              {t('reading:view.quizProgress', {
                answered: answeredCount,
                total: comprehensionQuestions.length,
              })}
            </span>
          </div>
          <ol className="quiz-list">
            {sortedQuestions.map((question, index) => {
              const key = String(question._id);
              const selected = quizAnswers[key];
              return (
                <li key={key} className="quiz-item">
                  <p className="quiz-question">{question.question}</p>
                  <ul className="quiz-options">
                    {(question.options || []).map((option, optionIndex) => (
                      <li key={optionIndex}>
                        <label className={`quiz-option${selected === String(optionIndex) ? ' selected' : ''}`}>
                          <input
                            type="radio"
                            name={`q-${index}`}
                            checked={selected === String(optionIndex)}
                            disabled={quizSubmitted}
                            onChange={() => setQuizAnswers((prev) => ({ ...prev, [key]: String(optionIndex) }))}
                          />
                          {option}
                        </label>
                      </li>
                    ))}
                  </ul>
                  {quizSubmitted && (
                    <p className="quiz-saved">
                      {t('reading:view.yourAnswer')}: {question.options?.[Number(selected)] || '—'}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {quizSubmitted ? (
        <p className="reading-done">
          <HiOutlineCheckCircle size={18} />
          {t('reading:view.answersSaved')}
        </p>
      ) : (
        <div className="reading-footer">
          {hasQuiz ? (
            <>
              <div className="reading-footer-progress">
                <span>
                  {t('reading:view.quizProgress', {
                    answered: answeredCount,
                    total: comprehensionQuestions.length,
                  })}
                </span>
                <div className="progress-track" role="presentation">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.round((answeredCount / comprehensionQuestions.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleQuizSubmit}
                disabled={progressSubmitting || answeredCount < comprehensionQuestions.length}
              >
                {progressSubmitting ? t('reading:common.submitting') : t('reading:view.submitAnswers')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleQuizSubmit}
              disabled={progressSubmitting}
            >
              {progressSubmitting ? t('reading:common.submitting') : t('reading:view.markComplete')}
            </button>
          )}
        </div>
      )}

      <Popover
        open={Boolean(vocab.item && vocab.anchorEl)}
        anchorEl={vocab.anchorEl}
        onClose={closeVocabulary}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            className: 'vocab-pop',
            sx: { width: 300, maxWidth: 'calc(100vw - 32px)' },
          },
        }}
      >
        {vocab.item && (
          <>
            <div className="vocab-pop-head">
              <div className="vocab-pop-term">
                <span className="vocab-pop-word">{vocab.item.original}</span>
                {vocab.item.simple && vocab.item.simple !== vocab.item.original && (
                  <span className="vocab-pop-simple">{vocab.item.simple}</span>
                )}
              </div>
              <button
                type="button"
                className="vocab-pop-close"
                onClick={closeVocabulary}
                aria-label={t('reading:common.close')}
              >
                <HiOutlineX size={18} />
              </button>
            </div>
            {(vocab.item.definition || vocab.item.meaning) && (
              <p className="vocab-pop-def">{vocab.item.definition || vocab.item.meaning}</p>
            )}
            {vocab.item.arabicMeaning && (
              <p className="vocab-pop-def" lang="ar" dir="rtl">{vocab.item.arabicMeaning}</p>
            )}
            <div className="vocab-pop-actions">
              {(audioSupported || hasRecording(vocab.item.audio)) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => playVocabularyWord(vocab.item, vocab.item.original)}
                >
                  <HiOutlineVolumeUp size={16} />
                  {t('reading:view.listen')}
                </button>
              )}
            </div>
          </>
        )}
      </Popover>
    </div>
  );
};

export default ReadingViewPage;
