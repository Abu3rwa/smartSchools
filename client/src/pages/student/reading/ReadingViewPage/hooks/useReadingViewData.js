import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSimplified,
  updateProgress,
  clearSimplifiedContent,
  selectSimplifiedContent,
  selectReadingLoading,
  selectReadingError,
} from '../../../../../store/slices/readingSlice';
import readingService from '../../../../../services/readingService';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

/**
 * Hook for ReadingViewPage data and handlers.
 * @returns {Object} content, loading, error, vocabulary, criticalThinkingQuestions,
 *   comprehensionQuestions, assignmentId, handleGetFeedback, handleQuizSubmit,
 *   ctAnswers, setCtAnswers, ctFeedback, quizAnswers, setQuizAnswers,
 *   quizSubmitted, progressSubmitting
 */
export function useReadingViewData() {
  const { t } = useTranslation(['reading']);
  const { textId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeAssignmentId = location.state?.assignmentId || searchParams.get('assignmentId');

  const dispatch = useDispatch();
  const content = useSelector(selectSimplifiedContent);
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  const [ctAnswers, setCtAnswers] = useState({});
  const [ctFeedback, setCtFeedback] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);
  const [submittedScore, setSubmittedScore] = useState(null);

  useEffect(() => {
    let active = true;
    if (textId) {
      dispatch(fetchSimplified({ textId, assignmentId: routeAssignmentId })).then((action) => {
        if (active && fetchSimplified.fulfilled.match(action)) {
          setCtAnswers(action.payload.savedAnswers || {});
          setQuizAnswers(action.payload.savedAnswers || {});
          setQuizSubmitted(Boolean(action.payload.completed));
        }
      });
    }
    return () => {
      active = false;
      dispatch(clearSimplifiedContent());
    };
  }, [dispatch, textId, routeAssignmentId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const vocabulary = content?.vocabularySubstitutions || [];
  const assignmentId = routeAssignmentId || content?.assignmentId;
  const criticalThinkingQuestions = useMemo(() => content?.criticalThinkingQuestions || [], [content]);
  const comprehensionQuestions = useMemo(() => content?.comprehensionQuestions || [], [content]);
  const score = submittedScore || content?.score || null;

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
    [content, ctAnswers, t]
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
    dispatch(
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
          const score = result.payload?.score;
          toast.success(score?.totalCount
            ? t('reading:view.toasts.score', {
              correct: score.correctCount,
              total: score.totalCount
            })
            : t('reading:view.answersSaved'));
        } else if (result.type === 'reading/updateProgress/rejected') {
          toast.error(result.payload || t('reading:view.toasts.saveFailed'));
        }
      })
      .finally(() => setProgressSubmitting(false));
  }, [content, comprehensionQuestions, criticalThinkingQuestions, quizAnswers, ctAnswers, assignmentId, dispatch, t]);

  return {
    fetchSimplified,
    clearSimplifiedContent,
    content,
    loading,
    error,
    vocabulary,
    criticalThinkingQuestions,
    comprehensionQuestions,
    assignmentId,
    score,
    handleGetFeedback,
    handleQuizSubmit,
    updateProgress,
    ctAnswers,
    setCtAnswers,
    ctFeedback,
    quizAnswers,
    setQuizAnswers,
    quizSubmitted,
    progressSubmitting,
  };
}
