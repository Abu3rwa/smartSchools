import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineLightBulb,
  HiOutlineQuestionMarkCircle,
} from 'react-icons/hi';

const QuizPage = ({
  kind,
  chapterNumber,
  questions = [],
  startIndex = 0,
  total = 0,
  answeredCount = 0,
  answers = {},
  feedback = {},
  submitted = false,
  submitting = false,
  showSubmit = false,
  canSubmit = true,
  onAnswerChange,
  onGetFeedback,
  onSubmit,
  onContents,
  passageText = '',
}) => {
  const { t } = useTranslation(['reading']);
  const isThinking = kind === 'thinking';

  return (
    <section className="book-quiz-page">
      <div className="book-page-topline">
        <span>
          {t('reading:book.chapterNumber', { number: chapterNumber })}
          {' · '}
          {isThinking ? t('reading:view.criticalThinking', { total }) : t('reading:view.comprehensionCheck')}
        </span>
        <span>
          {isThinking
            ? t('reading:view.thinkingProgress', { answered: answeredCount, total })
            : t('reading:view.quizProgress', { answered: answeredCount, total })}
        </span>
      </div>

      <div className="book-task-head">
        {isThinking ? <HiOutlineLightBulb size={20} /> : <HiOutlineQuestionMarkCircle size={20} />}
        <h2>{isThinking ? t('reading:view.criticalThinking', { total }) : t('reading:view.comprehensionCheck')}</h2>
      </div>

      <ol className={isThinking ? 'thinking-list' : 'quiz-list'}>
        {questions.map((question, index) => {
          const key = String(question._id);
          const itemFeedback = feedback[key];
          const position = startIndex + index + 1;
          if (isThinking) {
            return (
              <li key={key} className="thinking-item">
                <p className="thinking-question">
                  <span className="book-question-number">{position}.</span> {question.question}
                </p>
                {question.prompt && <p className="thinking-prompt">{question.prompt}</p>}
                <label className="thinking-answer-label" htmlFor={`ct-${key}`}>
                  {t('reading:view.yourAnswer')}
                </label>
                <textarea
                  id={`ct-${key}`}
                  className="thinking-answer book-thinking-answer"
                  value={answers[key] || ''}
                  onChange={(event) => onAnswerChange?.(key, event.target.value)}
                  placeholder={t('reading:view.answerPlaceholder')}
                  rows={3}
                  disabled={submitted || Boolean(itemFeedback?.loading)}
                />
                {submitted ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onGetFeedback?.(key, question.question, passageText)}
                    disabled={itemFeedback?.loading || !(answers[key] || '').trim()}
                  >
                    {itemFeedback?.loading ? t('reading:view.evaluating') : t('reading:view.getFeedback')}
                  </button>
                ) : (
                  <p className="thinking-hint">{t('reading:view.feedbackAfterSubmit')}</p>
                )}
                {itemFeedback?.feedback && !itemFeedback?.loading && (
                  <div className="thinking-feedback">
                    <span className="thinking-feedback-label">{t('reading:view.feedback')}</span>
                    <p>{itemFeedback.feedback}</p>
                  </div>
                )}
              </li>
            );
          }

          const selected = answers[key];
          return (
            <li key={key} className="quiz-item">
              <p className="quiz-question">
                <span className="book-question-number">{position}.</span> {question.question}
              </p>
              <ul className="quiz-options">
                {(question.options || []).map((option, optionIndex) => (
                  <li key={optionIndex}>
                    <label className={`quiz-option${selected === String(optionIndex) ? ' selected' : ''}`}>
                      <input
                        type="radio"
                        name={`quiz-${key}`}
                        checked={selected === String(optionIndex)}
                        disabled={submitted}
                        onChange={() => onAnswerChange?.(key, String(optionIndex))}
                      />
                      {option}
                    </label>
                  </li>
                ))}
              </ul>
              {submitted && (
                <p className="quiz-saved">
                  {t('reading:view.yourAnswer')}: {question.options?.[Number(selected)] || '—'}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {showSubmit && (
        submitted ? (
          <p className="reading-done book-submit-state">
            <HiOutlineCheckCircle size={18} />
            {t('reading:view.answersSaved')}
          </p>
        ) : (
          <div className="book-submit">
            {!isThinking && (
              <div className="book-submit-progress">
                <span>{t('reading:view.quizProgress', { answered: answeredCount, total })}</span>
                <div className="progress-track" role="presentation">
                  <div
                    className="progress-fill"
                    style={{ width: `${total ? Math.round((answeredCount / total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSubmit}
              disabled={submitting || !canSubmit}
            >
              {submitting ? t('reading:common.submitting') : t('reading:view.submitAnswers')}
            </button>
          </div>
        )
      )}

      <button type="button" className="book-text-link" onClick={onContents}>
        {t('reading:book.backToContents')}
      </button>
    </section>
  );
};

export default QuizPage;
