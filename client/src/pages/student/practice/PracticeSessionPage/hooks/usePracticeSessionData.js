import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
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
import { getStreakLabel, getUsableTopics } from '../utils/practiceSessionPresentation';

const usePracticeSessionData = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

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
    const [difficulty, setDifficulty] = useState('medium');
    const [questionType, setQuestionType] = useState('multiple_choice');
    const [startTime, setStartTime] = useState(null);
    const [sessionStats, setSessionStats] = useState({ asked: 0, correct: 0 });
    const [finalizingAssessment, setFinalizingAssessment] = useState(false);

    const lastIntegrityLogRef = useRef(0);
    const wasHiddenRef = useRef(false);

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
                await api.post('/practice/integrity-event', {
                    assignmentId,
                    attemptId: currentQuestion?.attemptId || null,
                    eventType,
                    metadata: { path: window.location.pathname }
                });
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
                toast.error('Tab change detected. Your teacher will be notified.');
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
    }, [assignmentId, currentQuestion?.attemptId]);

    const handleGenerate = async () => {
        dispatch(clearLastResult());
        setSelectedAnswer('');
        setShortAnswer('');

        const result = await dispatch(generateQuestion({
            assignmentId,
            difficulty,
            questionType
        }));

        if (generateQuestion.fulfilled.match(result)) {
            setStartTime(Date.now());
        } else {
            toast.error(result.payload || 'Failed to load question. Please try again.');
        }
    };

    const handleSubmit = async () => {
        const normalizedShortAnswer = shortAnswer.trim();
        const answer = currentQuestion?.questionType === 'short_answer'
            ? normalizedShortAnswer
            : selectedAnswer;

        if (!answer) {
            toast.error(
                currentQuestion?.questionType === 'short_answer'
                    ? 'Write your answer before submitting.'
                    : 'Select one answer before submitting.'
            );
            return;
        }

        const timeSpent = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

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
        } else {
            toast.error(result.payload || 'Failed to submit answer');
        }
    };

    const handleFinalizeAssessment = async () => {
        setFinalizingAssessment(true);
        try {
            const response = await api.post('/practice/assessment/finalize', { assignmentId });
            const payload = response?.data?.data || {};
            if (payload?.resultsVisible && payload?.result) {
                toast.success(`Assessment submitted. Final score: ${payload.result.score}/${payload.result.maxScore} (${payload.result.percentage}%)`);
            } else {
                toast.success('Assessment submitted. Results will be released by your teacher.');
            }
            navigate('/portal/practice');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to submit final assessment');
        } finally {
            setFinalizingAssessment(false);
        }
    };

    const derivedData = useMemo(() => {
        const isMasteredResult = practiceStatus === 'mastered' || lastResult?.newlyMastered;
        const isSessionComplete = practiceStatus === 'session_complete' || lastResult?.sessionComplete;
        const isAssessmentSession = sessionInfo?.sessionType === 'assessment';
        const showQuestion = practiceStatus === 'question' && currentQuestion;
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
        const streakLabel = getStreakLabel(sessionContext);
        
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
            showQuestion,
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
    }, [practiceStatus, lastResult, sessionInfo, currentQuestion, studentFirstName, user, sessionStats, sessionContext, questionType]);

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
        difficulty,
        setDifficulty,
        questionType,
        setQuestionType,
        finalizingAssessment,
        handleGenerate,
        handleSubmit,
        handleFinalizeAssessment,
        ...derivedData
    };
};

export default usePracticeSessionData;
