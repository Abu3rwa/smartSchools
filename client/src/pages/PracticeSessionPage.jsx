import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
    generateQuestion, submitAnswer,
    selectCurrentQuestion, selectLastResult, selectGenerating, selectSubmitting,
    clearCurrentQuestion, clearLastResult
} from '../store/slices/practiceSlice';
import {
    HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineXCircle,
    HiOutlineLightningBolt, HiOutlineRefresh
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import './PracticeSessionPage.css';

const PracticeSessionPage = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const currentQuestion = useSelector(selectCurrentQuestion);
    const lastResult = useSelector(selectLastResult);
    const generating = useSelector(selectGenerating);
    const submittingAnswer = useSelector(selectSubmitting);

    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [shortAnswer, setShortAnswer] = useState('');
    const [difficulty, setDifficulty] = useState('medium');
    const [questionType, setQuestionType] = useState('multiple_choice');
    const [startTime, setStartTime] = useState(null);
    const [sessionStats, setSessionStats] = useState({ asked: 0, correct: 0 });

    const textareaRef = useRef(null);

    useEffect(() => {
        return () => {
            dispatch(clearCurrentQuestion());
            dispatch(clearLastResult());
        };
    }, [dispatch]);

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
            if (result.payload.mastered) {
                // Already mastered
            }
        } else {
            toast.error(result.payload || 'Failed to generate question');
        }
    };

    const handleSubmit = async () => {
        const answer = currentQuestion?.questionType === 'short_answer'
            ? shortAnswer
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

    const isMasteredResult = currentQuestion?.mastered || lastResult?.newlyMastered;

    return (
        <div className="practice-session">
            <button className="back-link" onClick={() => navigate('/portal/practice')}>
                <HiOutlineArrowLeft size={16} /> Back to Practice Dashboard
            </button>

            {/* Difficulty & Type Selector */}
            {!currentQuestion && !lastResult && (
                <div className="question-card">
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Start Practicing</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                        Choose your preferred difficulty and question type, then generate a question.
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

                    {sessionStats.asked > 0 && (
                        <div style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                            Session: {sessionStats.correct}/{sessionStats.asked} correct ({sessionStats.asked > 0 ? Math.round((sessionStats.correct / sessionStats.asked) * 100) : 0}%)
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={generating}
                        style={{ width: '100%' }}
                    >
                        <HiOutlineLightningBolt size={18} style={{ marginRight: 6 }} />
                        {generating ? 'Generating...' : 'Generate Question'}
                    </button>
                </div>
            )}

            {/* Generating State */}
            {generating && (
                <div className="generating-state">
                    <div className="spinner"></div>
                    <p>AI is creating your question...</p>
                </div>
            )}

            {/* Already Mastered */}
            {currentQuestion?.mastered && (
                <div className="mastery-celebration">
                    <HiOutlineCheckCircle size={64} style={{ color: 'var(--success-600, #059669)', marginBottom: 'var(--spacing-md)' }} />
                    <h2>Standard Mastered!</h2>
                    <p>{currentQuestion.message}</p>
                    <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)' }}>
                        Score: {currentQuestion.mastery?.percentage}% ({currentQuestion.mastery?.correctCount}/{currentQuestion.mastery?.totalAttempts})
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/portal/practice')}
                        style={{ marginTop: 'var(--spacing-lg)' }}
                    >
                        Back to Dashboard
                    </button>
                </div>
            )}

            {/* Question Display */}
            {currentQuestion && !currentQuestion.mastered && !generating && (
                <div className="question-card">
                    <div className="question-meta">
                        <span className="badge badge-attempt">Question #{currentQuestion.attemptNumber}</span>
                        <span className={`badge badge-difficulty ${currentQuestion.difficulty}`}>
                            {currentQuestion.difficulty}
                        </span>
                        <span className="badge">{currentQuestion.questionType?.replace('_', ' ')}</span>
                    </div>

                    <div className="question-text">{currentQuestion.questionText}</div>

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
                            placeholder="Type your answer here..."
                            disabled={submittingAnswer}
                        />
                    )}

                    <div className="question-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={submittingAnswer || (!selectedAnswer && !shortAnswer)}
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
                        <h3>{lastResult.isCorrect ? 'Correct!' : 'Incorrect'}</h3>
                        <p className="result-feedback">{lastResult.feedback}</p>

                        <div className="result-details">
                            <p><span className="label">Correct Answer:</span></p>
                            <p>{lastResult.correctAnswer}</p>
                            {lastResult.explanation && (
                                <>
                                    <p style={{ marginTop: 'var(--spacing-sm)' }}><span className="label">Explanation:</span></p>
                                    <p>{lastResult.explanation}</p>
                                </>
                            )}
                        </div>

                        {/* Mastery progress */}
                        {lastResult.mastery && (
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                    Mastery Progress: {lastResult.mastery.correctCount}/{lastResult.mastery.totalAttempts} correct ({lastResult.mastery.percentage}%)
                                    {lastResult.mastery.needsMore > 0 && ` - ${lastResult.mastery.needsMore} more needed`}
                                </div>
                                <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${lastResult.mastery.percentage}%`,
                                        background: lastResult.mastery.percentage >= 80 ? '#10b981' : lastResult.mastery.percentage >= 40 ? '#f59e0b' : '#ef4444',
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
