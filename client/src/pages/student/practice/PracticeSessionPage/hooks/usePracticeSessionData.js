import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    generateQuestion, submitAnswer,
    selectCurrentQuestion, selectLastResult, selectGenerating, selectSubmitting,
    selectPracticeStatus, selectPracticeSessionInfo, selectPracticeStatusMessage,
    selectPracticeStudentFirstName, selectPracticeAssignmentInstructions,
    selectPracticeSuggestRemediation, selectPracticeSessionContext,
    selectPracticeError,
    clearCurrentQuestion, clearLastResult
} from '../../../../../store/slices/practiceSlice';
import { selectUser } from '../../../../../store/slices/authSlice';
import toast from 'react-hot-toast';
import api from '../../../../../config/api';
import { QUESTION_TYPE_GUIDANCE } from '../constants';
import { getStreakLabelKey, getUsableTopics } from '../utils/practiceSessionPresentation';
import { isAnswerReady, isObjectiveAnswerType } from '../utils/practiceAnswerDraft';
import { shouldShowPracticeFeedback } from '../../../../../utils/practiceFeedbackState';

const OBJECTIVE_INCOMPLETE_KEYS = {
    multiple_select: 'session.messages.selectAtLeastOne',
    matching: 'session.messages.matchAtLeastOne',
    ordering: 'session.messages.orderAll',
    fill_in_blank: 'session.messages.fillAtLeastOne',
    numeric_response: 'session.messages.numericRequired'
};

const usePracticeSessionData = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t } = useTranslation('studentPractice');

    const currentQuestion = useSelector(selectCurrentQuestion);
    const lastResult = useSelector(selectLastResult);
    const generating = useSelector(selectGenerating);
    const submittingAnswer = useSelector(selectSubmitting);
    const practiceStatus = useSelector(selectPracticeStatus);
    const sessionInfo = useSelector(selectPracticeSessionInfo);
    const statusMessage = useSelector(selectPracticeStatusMessage);
    const studentFirstName = useSelector(selectPracticeStudentFirstName);
    const assignmentInstructions = useSelector(selectPracticeAssignmentInstructions);
    const suggestRemediation = useSelector(selectPracticeSuggestRemediation);
    const sessionContext = useSelector(selectPracticeSessionContext);
    const practiceError = useSelector(selectPracticeError);
    const user = useSelector(selectUser);

    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [shortAnswer, setShortAnswer] = useState('');
    const [objectiveAnswer, setObjectiveAnswer] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const [questionType, setQuestionType] = useState('multiple_choice');
    const [startTime, setStartTime] = useState(null);
    const [sessionStats, setSessionStats] = useState({ asked: 0, correct: 0 });
    const [finalizingAssessment, setFinalizingAssessment] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const lastIntegrityLogRef = useRef(0);
    const wasHiddenRef = useRef(false);
    const tabSwitchCountRef = useRef(0);

    useEffect(() => {
        return () => {
            dispatch(clearCurrentQuestion());
            dispatch(clearLastResult());
        };
    }, [dispatch]);

    useEffect(() => {
        const isValidAssignmentId = /^[a-fA-F0-9]{24}$/.test(assignmentId || '');
        const allowedIntegrityEvents = new Set(['tab_hidden', 'window_blur', 'visibility_visible', 'window_focus']);

        const logIntegrityEvent = async (eventType) => {
            if (!isValidAssignmentId || !allowedIntegrityEvents.has(eventType)) return;
            const now = Date.now();
            if (now - lastIntegrityLogRef.current < 3000) return;
            lastIntegrityLogRef.current = now;
            try {
                const resp = await api.post('/practice/integrity-event', {
                    assignmentId,
                    attemptId: currentQuestion?.attemptId || null,
                    eventType,
                    metadata: { path: window.location.pathname }
                });
                if (resp?.data?.data?.tabSwitchCount != null) {
                    tabSwitchCountRef.current = resp.data.data.tabSwitchCount;
                }
            } catch (error) {
                // Ignore telemetry failures
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                wasHiddenRef.current = true;
                logIntegrityEvent('tab_hidden');
            } else if (wasHiddenRef.current) {
                wasHiddenRef.current = false;
                toast.error(
                    t('session.messages.tabSwitch', { countInfo: tabSwitchCountRef.current }),
                    { duration: 4000 }
                );
            }
        };

        const handleBlur = () => {
            logIntegrityEvent('window_blur');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
        };
    }, [assignmentId, currentQuestion?.attemptId, t]);

    const resumeKey = assignmentId ? `practice-resume:${assignmentId}` : null;

    const handleGenerate = async () => {
        const result = await dispatch(generateQuestion({
            assignmentId,
            difficulty,
            questionType
        }));

        if (generateQuestion.fulfilled.match(result)) {
            setSelectedAnswer('');
            setShortAnswer('');
            setObjectiveAnswer(null);
            setSubmitError('');
            setStartTime(Date.now());
            if (result.payload.question && resumeKey) {
                sessionStorage.setItem(resumeKey, '1');
            }
            if (result.payload.status === 'session_complete' || result.payload.status === 'mastered') {
                if (resumeKey) sessionStorage.removeItem(resumeKey);
            }
        } else {
            toast.error(t('session.messages.loadFailed'));
        }
    };

    // A refresh must not silently drop an unanswered question: the server
    // serves the existing pending attempt again, so re-request it.
    useEffect(() => {
        if (!resumeKey || !assignmentId) return;
        if (sessionStorage.getItem(resumeKey) !== '1') return;
        sessionStorage.removeItem(resumeKey);
        const navigationType = typeof performance !== 'undefined'
            ? performance.getEntriesByType?.('navigation')?.[0]?.type
            : null;
        if (navigationType && navigationType !== 'reload') return;
        dispatch(generateQuestion({ assignmentId, difficulty, questionType }))
            .then((result) => {
                if (generateQuestion.fulfilled.match(result)) {
                    setStartTime(Date.now());
                }
            });
        // Resume only on mount for this assignment; difficulty/type changes
        // should not re-trigger a question request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentId]);

    const handleSubmit = async () => {
        const questionType = currentQuestion?.questionType;
        const isObjective = isObjectiveAnswerType(questionType);
        const normalizedShortAnswer = shortAnswer.trim();
        const answer = questionType === 'short_answer'
            ? normalizedShortAnswer
            : isObjective
                ? objectiveAnswer
                : selectedAnswer;

        if (isObjective ? !isAnswerReady(currentQuestion, answer) : !answer) {
            toast.error(
                isObjective
                    ? t(OBJECTIVE_INCOMPLETE_KEYS[questionType])
                    : t(questionType === 'short_answer'
                        ? 'session.messages.shortAnswerRequired'
                        : 'session.messages.selectRequired')
            );
            return;
        }

        const timeSpent = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

        setSubmitError('');
        const result = await dispatch(submitAnswer({
            attemptId: currentQuestion.attemptId,
            answer,
            timeSpentSeconds: timeSpent
        }));

        if (submitAnswer.fulfilled.match(result)) {
            setSessionStats(prev => ({
                asked: prev.asked + 1,
                correct: prev.correct + (result.payload.isCorrect ? 1 : 0)
            }));
            if (result.payload.sessionComplete && resumeKey) {
                sessionStorage.removeItem(resumeKey);
            }
            // Feedback stays on screen; the next question is only generated
            // when the student explicitly asks for it.
        } else {
            const message = t('session.messages.submitFailed');
            setSubmitError(message);
            toast.error(message);
        }
    };

    const handleFinalizeAssessment = async () => {
        setFinalizingAssessment(true);
        try {
            const response = await api.post('/practice/assessment/finalize', { assignmentId });
            const payload = response?.data?.data || {};
            if (payload?.resultsVisible && payload?.result) {
                toast.success(t('session.messages.finalizeSuccessReleased', {
                    score: payload.result.score,
                    max: payload.result.maxScore,
                    percent: payload.result.percentage
                }));
            } else {
                toast.success(t('session.messages.finalizeSuccessPending'));
            }
            navigate('/portal/practice');
        } catch (error) {
            toast.error(t('session.messages.finalizeFailed'));
        } finally {
            setFinalizingAssessment(false);
        }
    };

    const derivedData = useMemo(() => {
        const isMasteredResult = practiceStatus === 'mastered' || lastResult?.newlyMastered;
        const isSessionComplete = practiceStatus === 'session_complete' || lastResult?.sessionComplete;
        const isAssessmentSession = sessionInfo?.sessionType === 'assessment';
        const normalizedStatusMessage = (statusMessage || '').toLowerCase();
        const assessmentAutoClosed =
            isAssessmentSession &&
            isSessionComplete &&
            normalizedStatusMessage.includes('assessment') &&
            normalizedStatusMessage.includes('closed');
        const showQuestion = practiceStatus === 'question' && currentQuestion;
        const showFeedback = shouldShowPracticeFeedback(lastResult, generating);
        const displayName = studentFirstName || user?.firstName || 'Student';
        
        const combinedAsked = Math.max(sessionStats.asked, sessionInfo?.questionsAnswered || 0);
        const combinedCorrect = Math.max(sessionStats.correct, sessionInfo?.correctCount || 0);
        
        const sessionProgressPercent = sessionInfo?.questionLimit
            ? Math.min(100, Math.round(((sessionInfo.questionsAnswered || 0) / sessionInfo.questionLimit) * 100))
            : null;
            
        const sessionAccuracy = combinedAsked > 0
            ? Math.round((combinedCorrect / combinedAsked) * 100)
            : (sessionContext?.recentAccuracy || 0);
            
        const streakValue = Math.max(sessionContext?.correctStreak || 0, sessionContext?.incorrectStreak || 0);
        const streakLabel = t(getStreakLabelKey(sessionContext));
        
        const usableTopics = getUsableTopics(sessionContext);
        const showContextHints = usableTopics.length > 0 || (sessionContext?.recentMistakes?.length || 0) > 0;
        
        const questionLimit = Number(sessionInfo?.questionLimit || 0);
        const answeredCount = Number(sessionInfo?.questionsAnswered || 0);
        const currentSessionStep = questionLimit > 0 ? Math.min(questionLimit, answeredCount + 1) : null;
        
        const activeQuestionType = currentQuestion?.questionType || questionType;
        const activeQuestionGuidance = QUESTION_TYPE_GUIDANCE[activeQuestionType] || QUESTION_TYPE_GUIDANCE.multiple_choice;

        return {
            isMasteredResult,
            isSessionComplete,
            isAssessmentSession,
            assessmentAutoClosed,
            showQuestion,
            showFeedback,
            displayName,
            combinedAsked,
            combinedCorrect,
            sessionProgressPercent,
            sessionAccuracy,
            streakValue,
            streakLabel,
            usableTopics,
            showContextHints,
            questionLimit,
            currentSessionStep,
            activeQuestionGuidance
        };
    }, [practiceStatus, lastResult, sessionInfo, statusMessage, currentQuestion, studentFirstName, user, sessionStats, sessionContext, questionType, generating, t]);

    return {
        assignmentId,
        navigate,
        currentQuestion,
        lastResult,
        generating,
        submittingAnswer,
        sessionInfo,
        statusMessage,
        assignmentInstructions,
        suggestRemediation,
        sessionContext,
        practiceError,
        selectedAnswer,
        setSelectedAnswer,
        shortAnswer,
        setShortAnswer,
        objectiveAnswer,
        setObjectiveAnswer,
        difficulty,
        setDifficulty,
        questionType,
        setQuestionType,
        finalizingAssessment,
        submitError,
        handleGenerate,
        handleSubmit,
        handleFinalizeAssessment,
        ...derivedData
    };
};

export default usePracticeSessionData;
