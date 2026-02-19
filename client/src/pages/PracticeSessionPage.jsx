import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
    generateQuestion, submitAnswer,
    selectCurrentQuestion, selectLastResult, selectGenerating, selectSubmitting,
    selectPracticeStatus, selectPracticeSessionInfo, selectPracticeStatusMessage,
    selectPracticeStudentFirstName, selectPracticeSuggestRemediation, selectPracticeSessionContext,
    selectPracticeError,
    clearCurrentQuestion, clearLastResult
} from '../store/slices/practiceSlice';
import { selectUser } from '../store/slices/authSlice';
import {
    HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineXCircle,
    HiOutlineLightningBolt, HiOutlineRefresh, HiOutlineChartBar, HiOutlineFire, HiOutlineLightBulb
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../config/api';
import './PracticeSessionPage.css';

const PracticeSessionPage = () => {
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

    const textareaRef = useRef(null);
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
                // Avoid interrupting the student experience for telemetry failures.
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
            toast.error('Please select or enter an answer');
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

    const isMasteredResult = practiceStatus === 'mastered' || lastResult?.newlyMastered;
    const isSessionComplete = practiceStatus === 'session_complete' || lastResult?.sessionComplete;
    const showQuestion = practiceStatus === 'question' && currentQuestion;
    const displayName = studentFirstName || user?.firstName || 'Student';
    const resultParts = lastResult?.feedbackParts || {};
    const answerDisplay = resultParts.displayAnswer || lastResult?.correctAnswerDisplay || lastResult?.correctAnswer;
    const quickExplanation = resultParts.explanation || resultParts.reasonSummary || lastResult?.explanation;
    const resultHeading = resultParts.headline || (lastResult?.isCorrect ? 'Correct!' : 'Keep Going');
    const combinedAsked = Math.max(
        sessionStats.asked,
        sessionInfo?.questionsAnswered || 0,
    );
    const combinedCorrect = Math.max(
        sessionStats.correct,
        sessionInfo?.correctCount || 0,
    );
    const sessionProgressPercent = sessionInfo?.questionLimit
        ? Math.min(100, Math.round(((sessionInfo.questionsAnswered || 0) / sessionInfo.questionLimit) * 100))
        : null;
    const sessionAccuracy = combinedAsked > 0
        ? Math.round((combinedCorrect / combinedAsked) * 100)
        : (sessionContext?.recentAccuracy || 0);
    const streakValue = Math.max(
        sessionContext?.correctStreak || 0,
        sessionContext?.incorrectStreak || 0,
    );
    const streakLabel = (sessionContext?.incorrectStreak || 0) > (sessionContext?.correctStreak || 0)
        ? 'Learning Streak'
        : 'Correct Streak';
    const showContextHints = (sessionContext?.recentTopics?.length || 0) > 0 || (sessionContext?.recentMistakes?.length || 0) > 0;
    const questionLimit = Number(sessionInfo?.questionLimit || 0);
    const answeredCount = Number(sessionInfo?.questionsAnswered || 0);
    const currentSessionStep = questionLimit > 0
        ? Math.min(questionLimit, answeredCount + 1)
        : null;

    return (
        <div className="practice-session">
            <button className="back-link" onClick={() => navigate('/portal/practice')}>
                <HiOutlineArrowLeft size={16} /> Back to Standards Practice
            </button>

            <div className="session-overview">
                <div className="session-overview-item">
                    <div className="overview-label">
                        <HiOutlineChartBar size={16} />
                        Session Progress
                    </div>
                    <div className="overview-value">
                        {sessionInfo?.questionLimit
                            ? `${sessionInfo.questionsAnswered || 0}/${sessionInfo.questionLimit}`
                            : `${combinedAsked} answered`}
                    </div>
                    {sessionInfo?.questionLimit && (
                        <div className="overview-progress">
                            <div
                                className="overview-progress-fill"
                                style={{ width: `${sessionProgressPercent || 0}%` }}
                            />
                        </div>
                    )}
                </div>
                <div className="session-overview-item">
                    <div className="overview-label">
                        <HiOutlineFire size={16} />
                        {streakLabel}
                    </div>
                    <div className="overview-value">{streakValue || 0}</div>
                    <div className="overview-subtext">
                        {sessionContext?.confidenceHint || 'Keep a steady pace and focus on clear reasoning.'}
                    </div>
                </div>
                <div className="session-overview-item">
                    <div className="overview-label">
                        <HiOutlineLightBulb size={16} />
                        Confidence
                    </div>
                    <div className="overview-value">{sessionAccuracy}%</div>
                    <div className="overview-subtext">
                        {combinedAsked > 0
                            ? `${combinedCorrect} correct out of ${combinedAsked}`
                            : 'Start with one question to build momentum.'}
                    </div>
                </div>
            </div>

            {practiceError && !generating && (
                <div className="practice-inline-error">
                    <p>{practiceError}</p>
                    {!currentQuestion && (
                        <button className="btn btn-secondary btn-sm" onClick={handleGenerate}>
                            Try Again
                        </button>
                    )}
                </div>
            )}

            {/* Difficulty & Type Selector */}
            {!currentQuestion && !lastResult && !isSessionComplete && !isMasteredResult && (
                <div className="question-card">
                    <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>Ready for Practice, {displayName}?</h3>
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                        Pick a challenge level and question type. The next question will adapt to your current session progress.
                    </p>

                    <div style={{ marginBottom: 'var(--spacing-md)' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Difficulty</label>
                        <div className="difficulty-selector">
                            {['easy', 'medium', 'hard'].map(d => (
                                <button
                                    key={d}
                                    className={`diff-btn ${difficulty === d ? 'active' : ''}`}
                                    onClick={() => setDifficulty(d)}
                                >
                                    {d.charAt(0).toUpperCase() + d.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Question Type</label>
                        <div className="difficulty-selector">
                            <button
                                className={`diff-btn ${questionType === 'multiple_choice' ? 'active' : ''}`}
                                onClick={() => setQuestionType('multiple_choice')}
                            >
                                Multiple Choice
                            </button>
                            <button
                                className={`diff-btn ${questionType === 'short_answer' ? 'active' : ''}`}
                                onClick={() => setQuestionType('short_answer')}
                            >
                                Short Answer
                            </button>
                            <button
                                className={`diff-btn ${questionType === 'true_false' ? 'active' : ''}`}
                                onClick={() => setQuestionType('true_false')}
                            >
                                True/False
                            </button>
                        </div>
                    </div>

                    {sessionInfo && (
                        <div style={{ marginBottom: 'var(--spacing-md)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            Session Type: {sessionInfo.sessionType}
                            {sessionInfo.questionLimit ? ` | Limit: ${sessionInfo.questionLimit} questions` : ''}
                            {sessionInfo.timeRemainingSeconds !== null ? ` | Time left: ${sessionInfo.timeRemainingSeconds}s` : ''}
                        </div>
                    )}

                    {combinedAsked > 0 && (
                        <div className="progress-today">
                            <div className="progress-today-title">Progress Today</div>
                            <div className="progress-today-copy">
                                {displayName}, you got {combinedCorrect} out of {combinedAsked} correct ({sessionAccuracy}%).
                            </div>
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={generating}
                        style={{ width: '100%' }}
                    >
                        <HiOutlineLightningBolt size={18} style={{ marginRight: 6 }} />
                        {generating ? 'Loading...' : 'Start Question'}
                    </button>
                </div>
            )}

            {/* Generating State */}
            {generating && (
                <div className="generating-state">
                    <div className="spinner"></div>
                    <p>Preparing a personalized question for you...</p>
                </div>
            )}

            {/* Already Mastered */}
            {isMasteredResult && !lastResult && (
                <div className="mastery-celebration">
                    <HiOutlineCheckCircle size={64} style={{ color: 'var(--success-600, #059669)', marginBottom: 'var(--spacing-md)' }} />
                    <h2>Standard Mastered!</h2>
                    <p>{statusMessage || 'You have already mastered this standard.'}</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/portal/practice')}
                        style={{ marginTop: 'var(--spacing-lg)' }}
                    >
                        Return to Dashboard
                    </button>
                </div>
            )}

            {isSessionComplete && !generating && !lastResult && (
                <div className="mastery-celebration">
                    <HiOutlineCheckCircle size={64} style={{ color: 'var(--success-600, #059669)', marginBottom: 'var(--spacing-md)' }} />
                    <h2>Session Complete</h2>
                    <p>{statusMessage || 'You have completed this practice session.'}</p>
                    {sessionInfo && (
                        <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)' }}>
                            Answered: {sessionInfo.questionsAnswered}
                            {sessionInfo.questionLimit ? `/${sessionInfo.questionLimit}` : ''} | Correct: {sessionInfo.correctCount}
                        </p>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/portal/practice')}
                        style={{ marginTop: 'var(--spacing-lg)' }}
                    >
                        Return to Dashboard
                    </button>
                </div>
            )}

            {/* Question Display */}
            {showQuestion && !generating && (
                <div className="question-card">
                    <div className="question-meta">
                        <span className="badge badge-attempt">Question #{currentQuestion.attemptNumber}</span>
                        <span className={`badge badge-difficulty ${currentQuestion.difficulty}`}>
                            {currentQuestion.difficulty}
                        </span>
                        <span className="badge">{currentQuestion.questionType?.replace('_', ' ')}</span>
                        <span className="badge">{streakLabel}: {streakValue || 0}</span>
                        <span className="badge">Confidence: {sessionAccuracy}%</span>
                        {currentSessionStep && questionLimit > 0 && (
                            <span className="badge">Session {currentSessionStep}/{questionLimit}</span>
                        )}
                    </div>

                    <div className="question-text">{currentQuestion.questionText}</div>
                    {suggestRemediation && (
                        <div className="remediation-tip">
                            Quick Tip: Let’s strengthen the foundation first. Focus on accuracy, then move up in difficulty.
                        </div>
                    )}
                    {showContextHints && (
                        <div className="context-hints">
                            <p className="context-hints-title">Recent Focus</p>
                            {sessionContext?.recentTopics?.length > 0 && (
                                <p className="context-hints-line">
                                    Topics: {sessionContext.recentTopics.slice(0, 3).join(', ')}
                                </p>
                            )}
                            {sessionContext?.recentMistakes?.length > 0 && (
                                <p className="context-hints-line">
                                    Improve next: {sessionContext.recentMistakes.slice(0, 2).join(', ')}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Multiple Choice / True-False Options */}
                    {(currentQuestion.questionType === 'multiple_choice' || currentQuestion.questionType === 'true_false') && (
                        <div className="options-list">
                            {currentQuestion.options?.map((option, idx) => (
                                <button
                                    key={idx}
                                    className={`option-btn ${selectedAnswer === option.label ? 'selected' : ''}`}
                                    onClick={() => setSelectedAnswer(option.label)}
                                    disabled={submittingAnswer}
                                >
                                    <span className="option-label">{option.label}</span>
                                    <span className="option-text">{option.text}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Short Answer */}
                    {currentQuestion.questionType === 'short_answer' && (
                        <textarea
                            ref={textareaRef}
                            className="short-answer-input"
                            value={shortAnswer}
                            onChange={(e) => setShortAnswer(e.target.value)}
                            placeholder="Type your answer clearly and explain your thinking..."
                            disabled={submittingAnswer}
                        />
                    )}

                    <div className="question-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={
                                submittingAnswer ||
                                (currentQuestion?.questionType === 'short_answer'
                                    ? !shortAnswer.trim()
                                    : !selectedAnswer)
                            }
                        >
                            {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
                        </button>
                    </div>
                </div>
            )}

            {/* Result Display */}
            {lastResult && (
                <>
                    <div className={`result-card ${lastResult.isCorrect ? 'correct' : 'incorrect'}`}>
                        <div className="result-icon">
                            {lastResult.isCorrect
                                ? <HiOutlineCheckCircle size={40} />
                                : <HiOutlineXCircle size={40} />
                            }
                        </div>
                        <h3>{resultHeading}</h3>
                        <p className="result-greeting">
                            {resultParts.personalGreeting || `${displayName}, ${lastResult.isCorrect ? 'great work on this one.' : 'good attempt. Keep going.'}`}
                        </p>
                        <p className="result-feedback">{lastResult.feedback}</p>

                        <div className="result-details">
                            {resultParts.whatYouDidWell && (
                                <div className="result-section">
                                    <p><span className="label">What You Did Well</span></p>
                                    <p>{resultParts.whatYouDidWell}</p>
                                </div>
                            )}

                            <div className="result-section">
                                <p><span className="label">Best Answer and Why</span></p>
                                <p>{answerDisplay}</p>
                                {resultParts.correctionOrConfirmation && (
                                    <p>{resultParts.correctionOrConfirmation}</p>
                                )}
                            </div>

                            {quickExplanation && (
                                <div className="result-section">
                                    <p><span className="label">Quick Explanation</span></p>
                                    <p>{quickExplanation}</p>
                                </div>
                            )}

                            {resultParts.nextStep && (
                                <div className="result-section">
                                    <p><span className="label">Next Step</span></p>
                                    <p>{resultParts.nextStep}</p>
                                </div>
                            )}

                            {sessionContext?.recentMistakes?.length > 0 && (
                                <div className="result-section">
                                    <p><span className="label">What to Improve Next</span></p>
                                    <p>{sessionContext.recentMistakes.slice(0, 2).join(', ')}</p>
                                </div>
                            )}

                            {(resultParts.reviewTag || resultParts.confidenceLevel) && (
                                <div className="result-section">
                                    <p><span className="label">Focus for Review</span></p>
                                    <p>
                                        {resultParts.reviewTag || 'Current skill'}
                                        {resultParts.confidenceLevel ? ` (${resultParts.confidenceLevel} confidence)` : ''}
                                    </p>
                                </div>
                            )}

                            {resultParts.encouragement && (
                                <p className="encouragement-line">{resultParts.encouragement}</p>
                            )}

                            {lastResult.sessionComplete && (
                                <p style={{ marginTop: 'var(--spacing-sm)', fontWeight: 600 }}>
                                    Session complete. Great work!
                                </p>
                            )}
                        </div>

                        {/* Mastery progress */}
                        {lastResult.mastery && (
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                    Mastery Progress: {lastResult.mastery.correctCount}/{lastResult.mastery.totalAttempts} correct ({lastResult.mastery.percentage}%)
                                    {lastResult.mastery.needsMore > 0 && ` - ${lastResult.mastery.needsMore} more needed`}
                                </div>
                                <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${lastResult.mastery.percentage}%`,
                                        background: lastResult.mastery.percentage >= 80 ? '#34d399' : lastResult.mastery.percentage >= 40 ? '#fbbf24' : '#f87171',
                                        borderRadius: 4,
                                        transition: 'width 0.4s ease'
                                    }}></div>
                                </div>
                            </div>
                        )}

                        <div className="result-actions">
                            {lastResult.newlyMastered ? (
                                <button className="btn btn-success" onClick={() => navigate('/portal/practice')}>
                                    <HiOutlineCheckCircle size={18} style={{ marginRight: 6 }} />
                                    Standard Mastered! Go Back
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                                    <HiOutlineRefresh size={18} style={{ marginRight: 6 }} />
                                    Next Question
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Newly Mastered Celebration */}
                    {lastResult.newlyMastered && (
                        <div className="mastery-celebration">
                            <h2>Congratulations!</h2>
                            <p>You have mastered this standard! Keep up the great work!</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PracticeSessionPage;
