import { useEffect, useMemo, useState } from "react";
import api from "../../../../config/api";
import "./AIPracticeSession.css";

const toDisplayAnswer = (value) => String(value || "").trim() || "-";

const AIPracticeSession = ({ task, studentId, onComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const currentQuestion = questions[currentIndex] || null;
  const canSubmit = Boolean(currentQuestion && String(selectedAnswer || "").trim());

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  const openSession = () => {
    setIsOpen(true);
    setError("");
  };

  const closeSession = () => {
    setIsOpen(false);
  };

  const handleStart = async () => {
    if (!studentId || !task?._id) {
      setError("Student or task information is missing.");
      return;
    }

    setStatus("starting");
    setError("");

    try {
      const response = await api.post(`/students/${studentId}/academic-excellence/tasks/${task._id}/session/start`, {});
      const payload = response?.data?.data || {};
      const list = Array.isArray(payload.questions) ? payload.questions : [];

      setQuestions(list);
      setCurrentIndex(Number(payload.currentQuestionIndex || 0));
      setSelectedAnswer("");
      setFeedback(null);
      setAnswers([]);
      setSummary(null);
      setStatus("in_progress");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to start AI practice session.");
      setStatus("idle");
    }
  };

  const handleSubmitAnswer = async () => {
    if (!currentQuestion) return;

    setStatus("submitting");
    setError("");

    try {
      const response = await api.post(`/students/${studentId}/academic-excellence/tasks/${task._id}/session/answer`, {
        questionId: currentQuestion.questionId,
        studentAnswer: selectedAnswer,
      });

      const result = response?.data?.data || {};
      setFeedback(result);
      setAnswers((prev) => [
        ...prev,
        {
          questionId: currentQuestion.questionId,
          questionText: currentQuestion.questionText,
          questionType: currentQuestion.questionType,
          studentAnswer: selectedAnswer,
          correctAnswer: result.correctAnswer,
          explanation: result.explanation,
          isCorrect: Boolean(result.isCorrect),
          aiFeedback: result.aiFeedback || "",
        },
      ]);
      setStatus("feedback");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to submit your answer.");
      setStatus("in_progress");
    }
  };

  const handleAdvance = async () => {
    const isLastQuestion = currentIndex >= questions.length - 1;

    if (!isLastQuestion) {
      setCurrentIndex((value) => value + 1);
      setSelectedAnswer("");
      setFeedback(null);
      setStatus("in_progress");
      return;
    }

    setStatus("completing");

    try {
      const response = await api.post(`/students/${studentId}/academic-excellence/tasks/${task._id}/session/complete`, {});
      setSummary(response?.data?.data || null);
      setStatus("done");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to complete session.");
      setStatus("feedback");
    }
  };

  const doneSummary = useMemo(() => {
    if (!summary) return null;
    return {
      score: Number(summary.sessionScore || 0),
      correct: Number(summary.correctCount || 0),
      total: Number(summary.totalCount || questions.length),
      masteryHint: summary.masteryHint || "",
    };
  }, [summary, questions.length]);

  return (
    <>
      <div className="ai-practice-trigger-row">
        <button type="button" className="academic-excellence-complete-btn" onClick={openSession}>
          Open Practice Session
        </button>
      </div>

      {isOpen ? (
        <div className="ai-practice-modal-overlay" role="dialog" aria-modal="true" aria-label="AI Practice Session">
          <div className="ai-practice-modal">
            <div className="ai-practice-modal-header">
              <div>
                <h3>{task?.title || "AI Practice Session"}</h3>
                <p>{task?.objectiveName || "Interactive objective practice"}</p>
              </div>
              <div className="ai-practice-modal-controls">
                <button type="button" className="academic-excellence-refresh-btn" onClick={closeSession}>
                  Close
                </button>
              </div>
            </div>

            <div className="ai-practice-modal-content">
              {error ? <div className="academic-excellence-error">{error}</div> : null}

              {status === "idle" ? (
                <div className="ai-practice-empty-state">
                  <p>Ready to begin this interactive AI practice session.</p>
                  <button type="button" className="academic-excellence-complete-btn" onClick={handleStart}>
                    Start Practice
                  </button>
                </div>
              ) : null}

              {status === "starting" ? (
                <div className="academic-excellence-loading">Generating your practice questions...</div>
              ) : null}

              {status === "done" ? (
                <div className="ai-practice-done-section">
                  <strong className="ai-practice-done-title">Practice Complete!</strong>
                  {doneSummary ? (
                    <div className="ai-practice-done-summary">
                      Score: {doneSummary.score}% ({doneSummary.correct} / {doneSummary.total} correct)
                    </div>
                  ) : null}
                  {doneSummary?.masteryHint ? <div className="ai-practice-done-hint">{doneSummary.masteryHint}</div> : null}

                  <div className="ai-practice-answer-review-list">
                    {answers.map((item) => (
                      <div key={item.questionId} className="ai-practice-answer-review-item">
                        <div className="ai-practice-answer-review-question">{item.questionText}</div>
                        <div className="ai-practice-answer-review-line">Your answer: {toDisplayAnswer(item.studentAnswer)}</div>
                        <div className="ai-practice-answer-review-line">Correct answer: {toDisplayAnswer(item.correctAnswer)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="ai-practice-action-row">
                    <button
                      type="button"
                      className="academic-excellence-complete-btn"
                      onClick={() => {
                        closeSession();
                        onComplete();
                      }}
                    >
                      Done
                    </button>
                    <button type="button" className="academic-excellence-refresh-btn" onClick={closeSession}>
                      Back to My Tasks
                    </button>
                  </div>
                </div>
              ) : null}

              {status !== "idle" && status !== "starting" && status !== "done" && currentQuestion ? (
                <div className="ai-practice-question-stage">
                  <div className="ai-practice-question-progress">
                    Question {currentIndex + 1} of {questions.length}
                  </div>
                  <div className="ai-practice-question-text">{currentQuestion.questionText}</div>

                  {status === "feedback" && feedback ? (
                    <div className={`ai-practice-feedback-card ${feedback.isCorrect ? "correct" : "incorrect"}`}>
                      <div className="ai-practice-feedback-title">{feedback.isCorrect ? "Correct" : "Incorrect"}</div>
                      <div className="ai-practice-feedback-line">Correct answer: {toDisplayAnswer(feedback.correctAnswer)}</div>
                      {feedback.explanation ? <div className="ai-practice-feedback-line">Explanation: {feedback.explanation}</div> : null}
                      {feedback.aiFeedback ? <div className="ai-practice-feedback-line">Feedback: {feedback.aiFeedback}</div> : null}
                    </div>
                  ) : null}

                  {status !== "feedback" ? (
                    <>
                      {currentQuestion.questionType === "multiple_choice" ? (
                        <div className="ai-practice-options-list">
                          {(currentQuestion.options || []).map((option, index) => (
                            <label
                              key={`${currentQuestion.questionId}_${index}`}
                              className={`ai-practice-option ${selectedAnswer === option ? "selected" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`question_${currentQuestion.questionId}`}
                                value={option}
                                checked={selectedAnswer === option}
                                onChange={(event) => setSelectedAnswer(event.target.value)}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          className="ai-practice-answer-textarea"
                          rows={4}
                          value={selectedAnswer}
                          onChange={(event) => setSelectedAnswer(event.target.value)}
                          placeholder="Type your answer"
                        />
                      )}

                      <div className="ai-practice-action-row">
                        <button
                          type="button"
                          className="academic-excellence-complete-btn"
                          onClick={handleSubmitAnswer}
                          disabled={!canSubmit || status === "submitting"}
                        >
                          {status === "submitting" ? "Submitting..." : "Submit Answer"}
                        </button>
                        <button type="button" className="academic-excellence-refresh-btn" onClick={closeSession}>
                          Close Session
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="ai-practice-action-row">
                      <button type="button" className="academic-excellence-complete-btn" onClick={handleAdvance} disabled={status === "completing"}>
                        {currentIndex >= questions.length - 1 ? "See Results" : "Next Question"}
                      </button>
                      <button type="button" className="academic-excellence-refresh-btn" onClick={closeSession}>
                        Close Session
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AIPracticeSession;
