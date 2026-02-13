import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSimplified,
  updateProgress,
  clearSimplifiedContent,
  selectSimplifiedContent,
  selectReadingLoading,
  selectReadingError,
} from '../store/slices/readingSlice';
import readingService from '../services/readingService';
import { HiOutlineArrowLeft, HiOutlineLightBulb, HiOutlineQuestionMarkCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ReadingViewPage.css';

const ReadingViewPage = () => {
  const { textId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const assignmentId = location.state?.assignmentId;

  const dispatch = useDispatch();
  const content = useSelector(selectSimplifiedContent);
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  const [vocabPopup, setVocabPopup] = useState(null);
  const [showCriticalThinking, setShowCriticalThinking] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);
  const [ctAnswers, setCtAnswers] = useState({});
  const [ctFeedback, setCtFeedback] = useState({});

  useEffect(() => {
    if (textId) dispatch(fetchSimplified(textId));
    return () => dispatch(clearSimplifiedContent());
  }, [dispatch, textId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const vocabulary = content?.vocabularySubstitutions || [];
  const vocabMap = useMemo(() => {
    const m = new Map();
    vocabulary.forEach((v) => {
      if (v.original) m.set(v.original.toLowerCase(), v);
      if (v.simple && v.simple !== v.original) m.set(v.simple.toLowerCase(), v);
    });
    return m;
  }, [vocabulary]);

  const criticalThinkingQuestions = content?.criticalThinkingQuestions || [];
  const comprehensionQuestions = content?.comprehensionQuestions || [];

  const wrapTextWithVocabulary = (text) => {
    if (!text || vocabMap.size === 0) return text;
    const words = text.split(/(\s+)/);
    return words.map((word, i) => {
      const key = word.replace(/[^\w']/g, '').toLowerCase();
      const def = key ? vocabMap.get(key) : null;
      if (!def) return <span key={`t-${i}`}>{word}</span>;
      return (
        <span
          key={`v-${i}-${key}`}
          className="vocab-word"
          title={def.definition || def.simple}
          onClick={() => setVocabPopup(def)}
        >
          {word}
        </span>
      );
    });
  };

  const handleGetFeedback = (index, question) => {
    const answer = (ctAnswers[index] || '').trim();
    if (!answer) {
      toast.error('Please write your answer first');
      return;
    }
    setCtFeedback((prev) => ({ ...prev, [index]: { ...prev[index], loading: true } }));
    const bodyText = content?.simplifiedContent || content?.text?.originalText || '';
    readingService
      .evaluateAnswer({
        textId: content?.text?._id,
        question,
        studentAnswer: answer,
        textExcerpt: bodyText.slice(0, 2500),
      })
      .then((res) => {
        const feedback = res.data?.data?.feedback || 'No feedback returned.';
        setCtFeedback((prev) => ({ ...prev, [index]: { feedback, loading: false } }));
        toast.success('Feedback ready');
      })
      .catch((err) => {
        const message = err.response?.data?.message || 'Failed to get feedback';
        setCtFeedback((prev) => ({ ...prev, [index]: { feedback: message, loading: false } }));
        toast.error(message);
      });
  };

  const handleQuizSubmit = () => {
    if (comprehensionQuestions.length === 0) {
      setShowQuiz(false);
      return;
    }
    let correct = 0;
    comprehensionQuestions.forEach((q, i) => {
      if (Number(quizAnswers[i]) === q.correctIndex) correct++;
    });
    setProgressSubmitting(true);
    dispatch(
      updateProgress({
        textId: content?.text?._id,
        correctCount: correct,
        totalCount: comprehensionQuestions.length,
        assignmentId: assignmentId || undefined,
      })
    )
      .then((result) => {
        if (result.type === 'reading/updateProgress/fulfilled') {
          setQuizSubmitted(true);
          toast.success(`Score: ${correct}/${comprehensionQuestions.length}`);
        } else if (result.type === 'reading/updateProgress/rejected') {
          toast.error(result.payload || 'Failed to save progress');
        }
      })
      .finally(() => setProgressSubmitting(false));
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
          Back
        </button>
        <p className="reading-error">Could not load this reading.</p>
      </div>
    );
  }

  const bodyText = content.simplifiedContent || content.text?.originalText || '';
  const hasQuiz = comprehensionQuestions.length > 0;

  return (
    <div className="reading-view-page">
      <button
        type="button"
        className="btn btn-ghost back-btn"
        onClick={() => navigate('/portal/reading')}
      >
        <HiOutlineArrowLeft size={18} />
        Back
      </button>

      <header className="reading-view-header">
        <h1>{content.text?.title}</h1>
        {content.targetLevel != null && (
          <span className="level-badge">Grade level {content.targetLevel}</span>
        )}
      </header>

      <section className="reading-body">
        <p className="reading-instruction">
          Click any <span className="vocab-hint">highlighted word</span> to see its
          definition (vocabulary building).
        </p>
        <div className="reading-text">
          {wrapTextWithVocabulary(bodyText)}
        </div>
      </section>

      {criticalThinkingQuestions.length > 0 && (
        <section className="reading-section critical-thinking">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowCriticalThinking(!showCriticalThinking)}
          >
            <HiOutlineLightBulb size={20} />
            Critical thinking ({criticalThinkingQuestions.length} questions)
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
                        Your answer
                      </label>
                      <textarea
                        id={`ct-answer-${i}`}
                        className="ct-answer-input"
                        value={ctAnswers[i] || ''}
                        onChange={(e) =>
                          setCtAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        placeholder="Type your response here..."
                        rows={4}
                        disabled={ctFeedback[i]?.loading}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGetFeedback(i, q.question)}
                        disabled={ctFeedback[i]?.loading || !(ctAnswers[i] || '').trim()}
                      >
                        {ctFeedback[i]?.loading ? 'Evaluating…' : 'Get feedback'}
                      </button>
                    </div>
                    {ctFeedback[i]?.feedback && !ctFeedback[i]?.loading && (
                      <div className="ct-feedback">
                        <span className="ct-feedback-label">Feedback:</span>
                        <p className="ct-feedback-text">{ctFeedback[i].feedback}</p>
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
            Comprehension check
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
                                    checked={quizAnswers[i] === String(j)}
                                    onChange={() =>
                                      setQuizAnswers((prev) => ({
                                        ...prev,
                                        [i]: String(j),
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
                      Object.keys(quizAnswers).length < comprehensionQuestions.length
                    }
                  >
                    {progressSubmitting ? 'Submitting…' : 'Submit answers'}
                  </button>
                </>
              ) : (
                <p className="quiz-done">Your answers have been saved. Great work!</p>
              )}
            </div>
          )}
        </section>
      )}

      {vocabPopup && (
        <div
          className="vocab-overlay"
          onClick={() => setVocabPopup(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setVocabPopup(null)}
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
            {vocabPopup.definition && (
              <p className="vocab-popup-def">{vocabPopup.definition}</p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setVocabPopup(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadingViewPage;
