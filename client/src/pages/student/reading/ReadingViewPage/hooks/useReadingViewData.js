import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  fetchSimplified,
  updateProgress,
} from '../../../../../store/slices/readingSlice';
import readingService from '../../../../../services/readingService';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

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
  const [readingGate, setReadingGate] = useState(null);
  const [gateBaselineSeconds, setGateBaselineSeconds] = useState(0);
  const [gateFinishing, setGateFinishing] = useState(false);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
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
    setReadingGate(null);
    setGateBaselineSeconds(0);
    setGateFinishing(false);
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
          setContent(payload);
          setCtAnswers(payload.savedAnswers || {});
          setQuizAnswers(payload.savedAnswers || {});
          setQuizSubmitted(Boolean(payload.completed));
          const startedAt = payload.readingGate?.readStartedAt;
          setGateBaselineSeconds(startedAt
            ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000)
            : 0);
        } else {
          setError(action.payload || t('reading:view.loadFailed'));
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
  const criticalThinkingQuestions = useMemo(() => content?.criticalThinkingQuestions || [], [content]);
  const comprehensionQuestions = useMemo(() => content?.comprehensionQuestions || [], [content]);
  const score = submittedScore || content?.score || null;

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
          if (started.readStartedAt) {
            setGateBaselineSeconds(Math.max(
              0,
              (Date.now() - new Date(started.readStartedAt).getTime()) / 1000
            ));
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [content, assignmentId]);

  const handleFinishReading = useCallback(async ({ level = null } = {}) => {
    if (!assignmentId) return false;
    setGateFinishing(true);
    try {
      const res = await readingService.finishReading({ assignmentId, level });
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
  }, [assignmentId, reload, t]);

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
          setQuizSubmitted(true);
          setSubmittedScore(result.payload?.score || null);
          toast.success(t('reading:view.answersSaved'));
          return true;
        }
        if (result.type === 'reading/updateProgress/rejected') {
          toast.error(result.payload || t('reading:view.toasts.saveFailed'));
        }
        return false;
      })
      .finally(() => setProgressSubmitting(false));
  }, [content, comprehensionQuestions, criticalThinkingQuestions, quizAnswers, ctAnswers, assignmentId, dispatch, t]);

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
    readingGate,
    gateBaselineSeconds,
    gateFinishing,
    handleFinishReading,
  };
}
