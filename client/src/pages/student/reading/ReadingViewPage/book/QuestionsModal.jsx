import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  useMediaQuery,
} from '@mui/material';
import {
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlinePencilAlt,
  HiOutlineX,
} from 'react-icons/hi';
import {
  buildQuestionSteps,
  firstUnansweredStep,
  summarizeSteps,
} from './questionSteps.js';
import './QuestionsModal.css';

const MAX_ANSWER_LENGTH = 10000;

const QuestionsModal = ({
  open,
  onClose,
  chapterNumber = null,
  chapterTitle = '',
  questionState = null,
  gate = null,
  thinking = [],
  quiz = [],
  answers = {},
  feedback = {},
  onAnswerChange,
  onGetFeedback,
  draftStatus = 'idle',
  submitError = null,
  submitting = false,
  onSubmit,
  onReload,
  result = null,
  completedAt = null,
  savedAnswersMatched = null,
  passageText = '',
  onBackToStory,
}) => {
  const { t, i18n } = useTranslation(['reading']);
  const fullScreen = useMediaQuery('(max-width:599.95px)');
  const steps = useMemo(
    () => buildQuestionSteps({ thinking, quiz }),
    [thinking, quiz],
  );
  const summary = useMemo(() => summarizeSteps(steps, answers), [steps, answers]);
  const [stepIndex, setStepIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const reloadedForLock = useRef(false);

  const state = questionState?.state || 'ready';

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setReviewing(false);
      setSaved(false);
      reloadedForLock.current = false;
    }
  }, [open]);

  // A submit rejected with the gate code means the reading was reopened or rolled
  // back under the student; refresh so the modal shows the locked state.
  useEffect(() => {
    if (state === 'ready' && submitError?.code === 'READING_GATE_LOCKED' && !reloadedForLock.current) {
      reloadedForLock.current = true;
      onReload?.();
    }
  }, [state, submitError, onReload]);

  const handleClose = useCallback(
    (_event, reason) => {
      if (submitting) return;
      if (reason === 'backdropClick' && fullScreen) return;
      onClose?.();
    },
    [fullScreen, onClose, submitting],
  );

  const handleSubmit = async () => {
    if (!summary.canSubmit || submitting) return;
    const ok = await onSubmit?.();
    if (ok) setSaved(true);
  };

  const answeredChanged =
    savedAnswersMatched &&
    savedAnswersMatched.total > 0 &&
    savedAnswersMatched.matched < savedAnswersMatched.total;
  const submittedDate = completedAt
    ? new Date(completedAt).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const missingFromServer = submitError?.missing || [];
  const currentStep = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];

  const renderAnswer = (step) => {
    const raw = answers[step.key];
    if (step.kind === 'quiz') {
      return step.question.options?.[Number(raw)] || '—';
    }
    return String(raw || '').trim() || '—';
  };

  const renderFeedback = (step) => {
    const item = feedback[step.key];
    if (!item?.feedback && !item?.loading) return null;
    if (step.kind !== 'thinking') return null;
    return (
      <div className="thinking-feedback">
        <span className="thinking-feedback-label">{t('reading:view.feedback')}</span>
        {item.loading ? <span className="spinner" /> : <p>{item.feedback}</p>}
      </div>
    );
  };

  const renderQuestion = (step) => {
    const key = step.key;
    if (step.kind === 'quiz') {
      const selected = answers[key];
      return (
        <div className="book-qm-question">
          <p className="book-qm-prompt">{step.question.question}</p>
          <ul className="quiz-options">
            {(step.question.options || []).map((option, optionIndex) => (
              <li key={optionIndex}>
                <label className={`quiz-option${selected === String(optionIndex) ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name={`book-qm-${key}`}
                    checked={selected === String(optionIndex)}
                    onChange={() => onAnswerChange?.(key, String(optionIndex), 'quiz', step.question)}
                  />
                  <span>{option}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    const value = String(answers[key] || '');
    const itemFeedback = feedback[key];
    return (
      <div className="book-qm-question">
        <p className="book-qm-prompt">{step.question.question}</p>
        {step.question.prompt && <p className="thinking-prompt">{step.question.prompt}</p>}
        <label className="book-qm-label" htmlFor={`book-qm-${key}`}>
          {t('reading:view.yourAnswer')}
        </label>
        <textarea
          id={`book-qm-${key}`}
          className="thinking-answer book-thinking-answer"
          value={value}
          maxLength={MAX_ANSWER_LENGTH}
          rows={6}
          onChange={(event) => onAnswerChange?.(key, event.target.value, 'thinking', step.question)}
          placeholder={t('reading:view.answerPlaceholder')}
        />
        <p className="book-qm-count">
          {value.length} / {MAX_ANSWER_LENGTH}
        </p>
        {value.trim() && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onGetFeedback?.(key, step.question.question, passageText)}
            disabled={itemFeedback?.loading}
          >
            {itemFeedback?.loading ? t('reading:view.evaluating') : t('reading:view.getFeedback')}
          </button>
        )}
        {renderFeedback(step)}
      </div>
    );
  };

  const renderDraftStatus = () => {
    if (state !== 'ready' || draftStatus === 'idle') return null;
    return (
      <p className={`book-qm-draft is-${draftStatus}`} role="status">
        {draftStatus === 'saved' && t('reading:questions.draftSaved')}
        {draftStatus === 'saving' && t('reading:questions.draftSaving')}
        {draftStatus === 'failed' && t('reading:questions.draftFailed')}
      </p>
    );
  };

  const renderLocked = () => {
    const required = Number(gate?.requiredSeconds) || 0;
    const elapsed = Number(gate?.elapsedSeconds) || 0;
    const remaining = Math.max(0, Number(gate?.remainingSeconds) || 0);
    const percent = required > 0 ? Math.min(100, Math.round((elapsed / required) * 100)) : 0;
    const hint = !gate?.reachedEnd
      ? t('reading:questions.lockedScrollToEnd')
      : remaining > 0
        ? t('reading:questions.lockedTimeLeft', { seconds: remaining })
        : t('reading:gate.ready');
    return (
      <div className="book-qm-state">
        <span className="book-qm-state-icon" aria-hidden="true">
          <HiOutlineLockClosed size={26} />
        </span>
        <h3>{t('reading:questions.lockedTitle')}</h3>
        <p>{t('reading:questions.lockedReason')}</p>
        <div className="progress-track" role="presentation">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="book-page-hint" id="book-qm-gate-hint">{hint}</p>
        <p className="book-page-note">{t('reading:questions.tabVisibleNote')}</p>
        <p className="book-page-note">{t('reading:questions.listeningNote')}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onBackToStory}
          aria-describedby="book-qm-gate-hint"
        >
          {t('reading:questions.backToStory')}
        </button>
      </div>
    );
  };

  const renderClosed = () => (
    <div className="book-qm-state">
      <span className="book-qm-state-icon" aria-hidden="true">
        <HiOutlineLockClosed size={26} />
      </span>
      <h3>{t('reading:questions.closedTitle')}</h3>
      <p>{t('reading:questions.closedReason')}</p>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        {t('reading:questions.close')}
      </button>
    </div>
  );

  const renderAnswerReview = () => (
    <ol className="book-qm-answers">
      {summary.items.map((step) => (
        <li key={step.key} className={`book-qm-answer is-${step.kind}`}>
          <p className="book-qm-answer-question">
            {step.question.question}
          </p>
          <p className="book-qm-answer-value">{renderAnswer(step)}</p>
          {step.kind === 'thinking' && step.answered && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onGetFeedback?.(step.key, step.question.question, passageText)}
              disabled={feedback[step.key]?.loading}
            >
              {feedback[step.key]?.loading
                ? t('reading:view.evaluating')
                : t('reading:view.getFeedback')}
            </button>
          )}
          {renderFeedback(step)}
        </li>
      ))}
    </ol>
  );

  const renderSubmitted = (justSaved) => (
    <>
      <div className="book-qm-state is-done">
        <span className="book-qm-state-icon" aria-hidden="true">
          <HiOutlineCheckCircle size={26} />
        </span>
        <h3>
          {justSaved
            ? t('reading:view.answersSaved')
            : submittedDate
              ? t('reading:questions.submittedOn', { date: submittedDate })
              : t('reading:questions.answered')}
        </h3>
        {result?.totalCount > 0 && (
          <p>
            {t('reading:questions.scoreLine', {
              correct: result.correctCount,
              total: result.totalCount,
            })}
          </p>
        )}
        {answeredChanged && (
          <p className="book-question-note">{t('reading:questions.updatedByTeacher')}</p>
        )}
      </div>
      {renderAnswerReview()}
      <div className="book-qm-footer">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('reading:questions.close')}
        </button>
      </div>
    </>
  );

  const renderReview = () => (
    <>
      <div className="book-qm-review-head">
        <h3>{t('reading:questions.reviewTitle')}</h3>
        <p>
          {summary.answered === summary.total && summary.total > 0
            ? t('reading:questions.reviewAnswered')
            : t('reading:questions.missingCount', { n: summary.missing.length })}
        </p>
      </div>
      <ol className="book-qm-review">
        {summary.items.map((step, index) => {
          const flagged = missingFromServer.includes(step.key);
          return (
            <li
              key={step.key}
              className={[
                'book-qm-review-row',
                step.answered ? 'is-answered' : 'is-missing',
                flagged ? 'is-flagged' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="book-qm-review-number" aria-hidden="true">{index + 1}</span>
              <span className="book-qm-review-text">{step.question.question}</span>
              <span className={`book-qm-review-status is-${step.answered ? 'answered' : 'missing'}`}>
                {step.answered ? t('reading:questions.answered') : t('reading:questions.unanswered')}
              </span>
              <button
                type="button"
                className="book-text-link"
                onClick={() => {
                  setStepIndex(steps.findIndex((item) => item.key === step.key));
                  setReviewing(false);
                }}
              >
                {t('reading:questions.goToQuestion')}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="book-qm-footer">
        <button type="button" className="btn btn-secondary" onClick={() => setReviewing(false)}>
          {t('reading:questions.back')}
        </button>
        <div className="book-qm-submit">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!summary.canSubmit || submitting}
          >
            {submitting
              ? t('reading:common.submitting')
              : submitError
                ? t('reading:questions.retry')
                : t('reading:questions.submit')}
          </button>
          {!summary.canSubmit && (
            <p className="book-submit-reason">
              {t('reading:questions.submitNeedsAll', {
                n: summary.objectiveTotal,
                left: summary.missing.length,
              })}
            </p>
          )}
          {submitError?.message && (
            <p className="book-submit-error" role="alert">{submitError.message}</p>
          )}
        </div>
        {renderDraftStatus()}
      </div>
    </>
  );

  const renderReady = () => {
    if (reviewing) return renderReview();
    if (!currentStep) return null;
    const isLast = stepIndex >= steps.length - 1;
    const missingNow = firstUnansweredStep(summary);
    return (
      <>
        <div className="book-qm-progress">
          <span>{t('reading:questions.stepOf', { current: stepIndex + 1, total: steps.length })}</span>
          <div className="book-qm-dots" role="list">
            {summary.items.map((step, index) => (
              <button
                key={step.key}
                type="button"
                role="listitem"
                className={[
                  'book-qm-dot',
                  step.answered ? 'is-answered' : '',
                  index === stepIndex ? 'is-current' : '',
                ].filter(Boolean).join(' ')}
                aria-label={t('reading:questions.stepOf', { current: index + 1, total: steps.length })}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
              />
            ))}
          </div>
        </div>

        {renderQuestion(currentStep)}

        <div className="book-qm-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0}
          >
            {t('reading:questions.back')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (isLast) setReviewing(true);
              else setStepIndex((index) => index + 1);
            }}
          >
            {isLast ? t('reading:questions.review') : t('reading:questions.next')}
          </button>
          {isLast && missingNow && summary.missing.length > 0 && (
            <p className="book-submit-reason">
              {t('reading:questions.missingCount', { n: summary.missing.length })}
            </p>
          )}
          {renderDraftStatus()}
        </div>
      </>
    );
  };

  const title = chapterNumber
    ? t('reading:questions.modalTitle', { number: chapterNumber })
    : t('reading:questions.answerQuestions');

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="book-questions-title"
      slotProps={{ paper: { className: 'book-questions-paper' } }}
    >
      <DialogTitle id="book-questions-title" className="book-qm-title">
        <div className="book-qm-heading">
          <h2>{title}</h2>
          {chapterTitle && <p>{chapterTitle}</p>}
        </div>
        <IconButton
          onClick={() => handleClose(null, 'close')}
          aria-label={t('reading:common.close')}
          className="book-qm-close"
          disabled={submitting}
        >
          <HiOutlineX size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent className="book-qm-content">
        {state === 'locked' && renderLocked()}
        {state === 'closed' && renderClosed()}
        {state === 'submitted' && renderSubmitted(saved)}
        {state === 'ready' && submitting && (
          <div className="book-qm-state is-busy" aria-busy="true">
            <span className="spinner" />
            <p>{t('reading:common.submitting')}</p>
          </div>
        )}
        {state === 'ready' && !submitting && renderReady()}
        {state === 'ready' && steps.length === 0 && !submitting && (
          <div className="book-qm-state">
            <span className="book-qm-state-icon" aria-hidden="true">
              <HiOutlinePencilAlt size={26} />
            </span>
            <p>{t('reading:questions.noQuestions')}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('reading:questions.close')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuestionsModal;
