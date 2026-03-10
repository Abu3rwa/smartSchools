import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
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
  const assignmentId = location.state?.assignmentId;

  const dispatch = useDispatch();
  const content = useSelector(selectSimplifiedContent);
  const loading = useSelector(selectReadingLoading);
  const error = useSelector(selectReadingError);

  const [ctAnswers, setCtAnswers] = useState({});
  const [ctFeedback, setCtFeedback] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);

  useEffect(() => {
    if (textId) dispatch(fetchSimplified(textId));
    return () => dispatch(clearSimplifiedContent());
  }, [dispatch, textId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const vocabulary = content?.vocabularySubstitutions || [];
  const criticalThinkingQuestions = content?.criticalThinkingQuestions || [];
  const comprehensionQuestions = content?.comprehensionQuestions || [];

  const handleGetFeedback = useCallback(
    (index, question) => {
      const answer = (ctAnswers[index] || '').trim();
      if (!answer) {
        toast.error(t('reading:view.toasts.answerFirst'));
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
    [content, ctAnswers]
  );

  const handleQuizSubmit = useCallback(() => {
    if (comprehensionQuestions.length === 0) {
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
          toast.success(t('reading:view.toasts.score', {
            correct,
            total: comprehensionQuestions.length
          }));
        } else if (result.type === 'reading/updateProgress/rejected') {
          toast.error(result.payload || t('reading:view.toasts.saveFailed'));
        }
      })
      .finally(() => setProgressSubmitting(false));
  }, [content, comprehensionQuestions, quizAnswers, assignmentId, dispatch, t]);

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
