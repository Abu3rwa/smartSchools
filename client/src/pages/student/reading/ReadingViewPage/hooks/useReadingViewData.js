import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  fetchSimplified,
  updateProgress,
} from '../../../../../store/slices/readingSlice';
import readingService from '../../../../../services/readingService';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { mergeSavedAnswers } from './mergeSavedAnswers.js';
import { deriveQuestionState } from '../book/questionState.js';

/**
 * Chapter content and handlers. Call with explicit ids for the book, or without
 * arguments to follow the route on the scrolling reading page.
 */
export function useReadingViewData(options = {}) {
  const { t } = useTranslation(['reading']);
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();

  const textId = options.textId ?? params.textId ?? null;
  const routeAssignmentId = options.assignmentId !== undefined
    ? options.assignmentId
    : (location.state?.assignmentId || searchParams.get('assignmentId'));
  const enabled = options.enabled !== false && Boolean(textId);

  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [ctAnswers, setCtAnswers] = useState({});
  const [ctFeedback, setCtFeedback] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);
  const [submittedScore, setSubmittedScore] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [savedAnswersMatched, setSavedAnswersMatched] = useState(null);
  const [loadErrorCode, setLoadErrorCode] = useState(null);
  const [readingGate, setReadingGate] = useState(null);
  const [gateBaselineSeconds, setGateBaselineSeconds] = useState(0);
  const [gateRequiredSeconds, setGateRequiredSeconds] = useState(null);
  const [gateVisibleSeconds, setGateVisibleSeconds] = useState(0);
  const [gateFinishing, setGateFinishing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [draftStatus, setDraftStatus] = useState('idle');
  const draftTimer = useRef(null);
  const draftPayload = useRef(null);
  const draftRequest = useRef(0);
  const submittedRef = useRef(false);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    draftPayload.current = null;
    setDraftStatus('idle');
    submittedRef.current = false;
    if (!enabled) {
      setContent(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setContent(null);
    setCtAnswers({});
    setCtFeedback({});
    setQuizAnswers({});
    setQuizSubmitted(false);
    setSubmittedScore(null);
    setCompletedAt(null);
    setSavedAnswersMatched(null);
    setLoadErrorCode(null);
    setReadingGate(null);
    setGateBaselineSeconds(0);
    setGateRequiredSeconds(null);
    setGateVisibleSeconds(0);
    setGateFinishing(false);
    setSubmitError(null);
    return undefined;
  }, [enabled, textId, routeAssignmentId]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    setLoading(true);
    setError(null);
    dispatch(fetchSimplified({ textId, assignmentId: routeAssignmentId }))
      .then((action) => {
        if (!active) return;
        if (fetchSimplified.fulfilled.match(action)) {
          const payload = action.payload;
          const savedAnswers = { ...(payload.savedAnswers || {}), ...(payload.draftAnswers || {}) };
          setContent(payload);
          setCtAnswers((prev) => mergeSavedAnswers(prev, savedAnswers));
          setQuizAnswers((prev) => mergeSavedAnswers(prev, savedAnswers));
          setQuizSubmitted(Boolean(payload.completed));
          submittedRef.current = Boolean(payload.completed);
          setCompletedAt(payload.completedAt || null);
          setSavedAnswersMatched(payload.savedAnswersMatched || null);
          setLoadErrorCode(null);
          setGateBaselineSeconds(Number(payload.readingGate?.readSeconds) || 0);
          setGateRequiredSeconds(Number.isFinite(Number(payload.readingGate?.requiredSeconds))
            ? Number(payload.readingGate.requiredSeconds)
            : null);
        } else {
          const message = typeof action.payload === 'string'
            ? action.payload
            : action.payload?.message;
          setError(message || t('reading:view.loadFailed'));
          setLoadErrorCode(typeof action.payload === 'object' ? action.payload?.code || null : null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch, enabled, textId, routeAssignmentId, reloadToken, t]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const assignmentId = routeAssignmentId || content?.assignmentId;
  const questionState = useMemo(
    () => deriveQuestionState({
      gateEnabled: Boolean(
        readingGate?.enabled && !readingGate?.unlocked && assignmentId
      ),
      completed: quizSubmitted,
      closedCode: loadErrorCode,
    }),
    [readingGate, quizSubmitted, loadErrorCode, assignmentId]
  );
  const criticalThinkingQuestions = useMemo(() => content?.criticalThinkingQuestions || [], [content]);
  const comprehensionQuestions = useMemo(() => content?.comprehensionQuestions || [], [content]);
  const score = submittedScore || content?.score || null;
  const gateEnabled = Boolean(readingGate?.enabled && !readingGate?.unlocked && assignmentId);

  const beatReading = useCallback(() => {
    if (!assignmentId) return Promise.resolve(null);
    return readingService
      .recordReadingHeartbeat({ assignmentId })
      .then((res) => {
        const data = res.data?.data;
        if (!data) return null;
        if (Number.isFinite(Number(data.readSeconds))) {
          setGateBaselineSeconds(Number(data.readSeconds));
          setGateVisibleSeconds(0);
        }
        if (Number.isFinite(Number(data.requiredSeconds))) {
          setGateRequiredSeconds(Number(data.requiredSeconds));
        }
        if (data.unlocked) setReadingGate((prev) => ({ ...(prev || {}), unlocked: true }));
        return data;
      })
      .catch(() => null);
  }, [assignmentId]);

  useEffect(() => {
    const incoming = content?.readingGate || null;
    setReadingGate(incoming);
    if (!incoming?.enabled || incoming.unlocked || !assignmentId) return undefined;
    let active = true;
    readingService
      .startReading({ assignmentId })
      .then((res) => {
        if (active && res.data?.data) {
          const started = res.data.data;
          setReadingGate((prev) => ({ ...(prev || {}), ...started }));
          setGateBaselineSeconds(Number(started.readSeconds) || 0);
          setGateVisibleSeconds(0);
          if (Number.isFinite(Number(started.requiredSeconds))) {
            setGateRequiredSeconds(Number(started.requiredSeconds));
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [content, assignmentId]);

  // The server owns credited time; ticking only smooths the countdown between beats.
  useEffect(() => {
    if (!gateEnabled) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setGateVisibleSeconds((seconds) => seconds + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [gateEnabled]);

  useEffect(() => {
    if (!gateEnabled) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') beatReading();
    }, 10000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') beatReading();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [gateEnabled, beatReading]);

  const handleFinishReading = useCallback(async () => {
    if (!assignmentId) return false;
    setGateFinishing(true);
    try {
      await beatReading();
      const res = await readingService.finishReading({ assignmentId });
      setReadingGate((prev) => ({ ...(prev || {}), ...(res.data?.data || {}), unlocked: true }));
      reload();
      return true;
    } catch (err) {
      const payload = err.response?.data;
      if (payload?.code === 'READING_GATE_NOT_FINISHED') {
        toast.error(t('reading:gate.notYet', { seconds: payload.data?.remainingSeconds || 0 }));
      } else {
        toast.error(payload?.message || t('reading:gate.finishFailed'));
      }
      return false;
    } finally {
      setGateFinishing(false);
    }
  }, [assignmentId, beatReading, reload, t]);

  const handleGetFeedback = useCallback(
    (index, question, textExcerpt) => {
      const answer = (ctAnswers[index] || '').trim();
      if (!answer) {
        toast.error(t('reading:view.toasts.answerFirst'));
        return;
      }
      setCtFeedback((prev) => ({ ...prev, [index]: { ...prev[index], loading: true } }));
      readingService
        .evaluateAnswer({
          textId: content?.text?._id,
          assignmentId,
          question,
          studentAnswer: answer,
          textExcerpt: String(textExcerpt || content?.simplifiedContent || content?.text?.originalText || '').slice(0, 2500),
          requestedLanguages: content?.text?.requestedLanguages,
        })
        .then((res) => {
          const feedback = res.data?.data?.feedback || t('reading:view.toasts.noFeedback');
          setCtFeedback((prev) => ({ ...prev, [index]: { feedback, loading: false } }));
          toast.success(t('reading:view.toasts.feedbackReady'));
        })
        .catch((err) => {
          const message = err.response?.data?.message || t('reading:view.toasts.feedbackFailed');
          setCtFeedback((prev) => ({ ...prev, [index]: { feedback: message, loading: false } }));
          toast.error(message);
        });
    },
    [assignmentId, content, ctAnswers, t]
  );

  const handleQuizSubmit = useCallback(() => {
    const answers = Object.fromEntries(
      comprehensionQuestions.map((question) => [
        String(question._id),
        String(quizAnswers[String(question._id)] ?? ''),
      ])
    );
    const shortAnswers = Object.fromEntries(
      criticalThinkingQuestions.map((question) => [
        String(question._id),
        String(ctAnswers[String(question._id)] || ''),
      ]).filter(([, answer]) => answer.trim())
    );
    setProgressSubmitting(true);
    setSubmitError(null);
    return dispatch(
      updateProgress({
        textId: content?.text?._id,
        answers,
        shortAnswers,
        assignmentId,
      })
    )
      .then((result) => {
        if (result.type === 'reading/updateProgress/fulfilled') {
          submittedRef.current = true;
          if (draftTimer.current) {
            clearTimeout(draftTimer.current);
            draftTimer.current = null;
          }
          draftPayload.current = null;
          setDraftStatus('idle');
          setQuizSubmitted(true);
          setSubmittedScore(result.payload?.score || null);
          toast.success(t('reading:view.answersSaved'));
          return true;
        }
        if (result.type === 'reading/updateProgress/rejected') {
          const payload = result.payload;
          const rawMessage = typeof payload === 'string' ? payload : payload?.message;
          const code = typeof payload === 'object' ? payload?.code || null : null;
          const inferredCode = code || (/^Answer every objective question/.test(rawMessage || '')
            ? 'READING_ANSWERS_INCOMPLETE'
            : null);
          const inlineMessage = inferredCode
            ? t(`reading:questions.errors.${inferredCode}`, {
                seconds: payload?.data?.remainingSeconds ?? 0,
              })
            : rawMessage || t('reading:view.toasts.saveFailed');
          setSubmitError({
            code: inferredCode || 'GENERIC',
            message: inlineMessage,
            missing: payload?.data?.missing || [],
          });
          toast.error(inlineMessage);
        }
        return false;
      })
      .finally(() => setProgressSubmitting(false));
  }, [content, comprehensionQuestions, criticalThinkingQuestions, quizAnswers, ctAnswers, assignmentId, dispatch, t]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  const flushDraft = useCallback(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    const answers = draftPayload.current;
    if (!answers || !assignmentId || submittedRef.current) return Promise.resolve(null);
    const requestId = draftRequest.current + 1;
    draftRequest.current = requestId;
    setDraftStatus('saving');
    return readingService
      .saveAnswersDraft({ assignmentId, textId: content?.text?._id, answers })
      .then((res) => {
        if (draftRequest.current === requestId) {
          draftPayload.current = null;
          setDraftStatus('saved');
        }
        return res.data?.data || null;
      })
      .catch(() => {
        if (draftRequest.current === requestId) setDraftStatus('failed');
        return null;
      });
  }, [assignmentId, content]);

  const saveDraft = useCallback((overrides = {}) => {
    if (!assignmentId || submittedRef.current) return;
    const nextQuiz = overrides.quizAnswers || quizAnswers;
    const nextCt = overrides.ctAnswers || ctAnswers;
    const answers = {};
    comprehensionQuestions.forEach((question) => {
      const value = String(nextQuiz[String(question._id)] ?? '');
      if (value) answers[String(question._id)] = value;
    });
    criticalThinkingQuestions.forEach((question) => {
      const value = String(nextCt[String(question._id)] || '');
      if (value.trim()) answers[String(question._id)] = value;
    });
    draftPayload.current = answers;
    setDraftStatus('saving');
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      flushDraft();
    }, 1500);
  }, [assignmentId, comprehensionQuestions, criticalThinkingQuestions, quizAnswers, ctAnswers, flushDraft]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushDraft]);

  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);

  return {
    content,
    loading,
    error,
    reload,
    vocabulary: content?.vocabularySubstitutions || [],
    criticalThinkingQuestions,
    comprehensionQuestions,
    assignmentId,
    score,
    handleGetFeedback,
    handleQuizSubmit,
    ctAnswers,
    setCtAnswers,
    ctFeedback,
    quizAnswers,
    setQuizAnswers,
    quizSubmitted,
    progressSubmitting,
    submitError,
    clearSubmitError,
    draftStatus,
    saveDraft,
    flushDraft,
    questionState,
    completedAt,
    savedAnswersMatched,
    readingGate,
    gateElapsedSeconds: gateEnabled ? gateBaselineSeconds + gateVisibleSeconds : 0,
    gateRequiredSeconds,
    gateFinishing,
    handleFinishReading,
  };
}
