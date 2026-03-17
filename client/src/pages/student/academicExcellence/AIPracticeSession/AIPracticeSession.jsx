import { useMemo, useState } from "react";
import api from "../../../../config/api";

const toDisplayAnswer = (value) => String(value || "").trim() || "-";

const AIPracticeSession = ({ task, studentId, onComplete }) => {
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

  const handleStart = async () => {
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

  if (status === "idle") {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        {error ? <div className="academic-excellence-error">{error}</div> : null}
        <button type="button" className="academic-excellence-complete-btn" onClick={handleStart}>
          Start Practice
        </button>
      </div>
    );
  }

  if (status === "starting") {
    return <div style={{ marginTop: "0.75rem" }}>Generating your practice questions...</div>;
  }

  if (status === "done") {
    return (
      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.6rem" }}>
        <strong>Practice Complete!</strong>
        {doneSummary ? (
          <div>
            Score: {doneSummary.score}% ({doneSummary.correct} / {doneSummary.total} correct)
          </div>
        ) : null}
        {doneSummary?.masteryHint ? <div>{doneSummary.masteryHint}</div> : null}

        <div style={{ display: "grid", gap: "0.45rem" }}>
          {answers.map((item) => (
            <div key={item.questionId} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.55rem" }}>
              <div style={{ fontWeight: 600 }}>{item.questionText}</div>
              <div>Your answer: {toDisplayAnswer(item.studentAnswer)}</div>
              <div>Correct answer: {toDisplayAnswer(item.correctAnswer)}</div>
            </div>
          ))}
        </div>

        <button type="button" className="academic-excellence-complete-btn" onClick={onComplete}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.65rem" }}>
      {error ? <div className="academic-excellence-error">{error}</div> : null}

      {currentQuestion ? (
        <>
          <div style={{ fontWeight: 600 }}>
            Question {currentIndex + 1} of {questions.length}
          </div>
          <div>{currentQuestion.questionText}</div>

          {status === "feedback" && feedback ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.6rem", background: feedback.isCorrect ? "#ecfdf5" : "#fef2f2" }}>
              <div style={{ fontWeight: 700 }}>{feedback.isCorrect ? "Correct" : "Incorrect"}</div>
              <div>Correct answer: {toDisplayAnswer(feedback.correctAnswer)}</div>
              {feedback.explanation ? <div>Explanation: {feedback.explanation}</div> : null}
              {feedback.aiFeedback ? <div>Feedback: {feedback.aiFeedback}</div> : null}
            </div>
          ) : null}

          {status !== "feedback" ? (
            <>
              {currentQuestion.questionType === "multiple_choice" ? (
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  {(currentQuestion.options || []).map((option, index) => (
                    <label key={`${currentQuestion.questionId}_${index}`} style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`question_${currentQuestion.questionId}`}
                        value={option}
                        checked={selectedAnswer === option}
                        onChange={(event) => setSelectedAnswer(event.target.value)}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="teacher-ae-textarea"
                  rows={4}
                  value={selectedAnswer}
                  onChange={(event) => setSelectedAnswer(event.target.value)}
                  placeholder="Type your answer"
                />
              )}

              <button
                type="button"
                className="academic-excellence-complete-btn"
                onClick={handleSubmitAnswer}
                disabled={!canSubmit || status === "submitting"}
              >
                {status === "submitting" ? "Submitting..." : "Submit Answer"}
              </button>
            </>
          ) : (
            <button type="button" className="academic-excellence-complete-btn" onClick={handleAdvance} disabled={status === "completing"}>
              {currentIndex >= questions.length - 1 ? "See Results" : "Next Question"}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
};

export default AIPracticeSession;
