import { useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import { getMapPracticeSetProgress } from './studentMapPracticeProgress';
import './StudentMapTestPrepPage.css';

const StudentMapTestPrepPage = () => {
  const [message, setMessage] = useState('');
  const [home, setHome] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [localAnswers, setLocalAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [resultSummary, setResultSummary] = useState(null);

  const loadHome = async () => {
    try {
      const response = await api.get('/map-test-prep/practice/me/home');
      setHome(response.data?.data || null);
    } catch {
      setMessage('Unable to load MAP practice home.');
    }
  };

  useEffect(() => {
    loadHome();
  }, []);

  const activeQuestion = questions[currentIndex] || null;

  const assignedSets = useMemo(
    () => Array.isArray(home?.assignedSets) ? home.assignedSets : [],
    [home]
  );

  const optionalSets = useMemo(
    () => Array.isArray(home?.plans) ? home.plans : [],
    [home]
  );

  const focusSkills = useMemo(() => {
    const skills = [];
    if (!home?.plans) return skills;

    home.plans.forEach((plan) => {
      if (Array.isArray(plan.skills)) {
        plan.skills.forEach((skill) => {
          if (skill?.name) {
            skills.push({ name: skill.name, progress: 45, status: 'Getting started' });
          }
        });
      }
    });

    return skills.slice(0, 4);
  }, [home]);

  const finishedSets = useMemo(() => {
    if (!Array.isArray(home?.attempts)) return [];
    return home.attempts.slice(-5).reverse();
  }, [home]);

  const startAssignment = async (selectedAssignment) => {
    try {
      setMessage('');
      const assignmentResponse = await api.get(`/map-test-prep/practice/assignments/${selectedAssignment._id}/questions`);
      const assignmentData = assignmentResponse.data?.data || {};
      const nextQuestions = Array.isArray(assignmentData.questions) ? assignmentData.questions : [];
      const attemptResponse = await api.post(`/map-test-prep/practice/assignments/${selectedAssignment._id}/start`);
      const attemptData = attemptResponse.data?.data || {};
      setAssignment(assignmentData.assignment || selectedAssignment);
      setQuestions(nextQuestions);
      setAttempt(attemptData.attempt || null);
      setCurrentIndex(0);
      setLocalAnswers({});
      setResultSummary(null);
      if (!attemptData.attempt?._id) {
        setMessage('The set is ready. Start answering when you are ready.');
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to open this set.');
    }
  };

  const persistAnswer = async (questionId, response) => {
    if (!attempt?._id) return;
    setSaving(true);
    try {
      await api.post(`/map-test-prep/practice/attempts/${attempt._id}/answer`, { questionId, response });
      setHome((current) => {
        if (!current) return current;
        const existingAttempt = (current.attempts || []).find((item) => String(item._id) === String(attempt._id));
        if (!existingAttempt) return current;
        const answers = [...(existingAttempt.answers || [])];
        const answerIndex = answers.findIndex((answer) => String(answer.question?._id || answer.question) === String(questionId));
        const nextAnswer = { ...(answerIndex >= 0 ? answers[answerIndex] : {}), question: questionId, response };
        if (answerIndex >= 0) answers[answerIndex] = nextAnswer;
        else answers.push(nextAnswer);
        return {
          ...current,
          attempts: current.attempts.map((item) => String(item._id) === String(attempt._id) ? { ...item, answers } : item)
        };
      });
    } catch {
      setMessage('Your answer was not saved yet. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateAnswer = (questionId, response) => {
    setLocalAnswers((current) => ({ ...current, [questionId]: response }));
    persistAnswer(questionId, response);
  };

  const handleOptionChange = (event, question) => {
    const value = event.target.value;
    const current = localAnswers[question._id] || [];
    const next = current.includes(value)
      ? current.filter((option) => option !== value)
      : [...current, value];
    updateAnswer(question._id, next);
  };

  const handleSubmit = async () => {
    if (!attempt?._id) return;
    setSubmitting(true);
    try {
      const submitResponse = await api.post(`/map-test-prep/practice/attempts/${attempt._id}/submit`);
      const submitted = submitResponse.data?.data || {};
      setAssignment(null);
      setQuestions([]);
      setAttempt(null);
      setCurrentIndex(0);
      setLocalAnswers({});
      setResultSummary({
        score: submitted.score ?? 0,
        maxScore: submitted.maxScore ?? 0,
        needsTeacherReview: submitted.needsTeacherReview,
        setTitle: assignment?.set?.title || 'Practice set'
      });
      await loadHome();
      setMessage('Your answers were submitted. Your teacher will review them soon.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to submit this set.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentAnswer = activeQuestion ? localAnswers[activeQuestion._id] ?? '' : '';

  if (assignment && activeQuestion) {
    return (
      <div className="student-map-prep-page">
        <header>
          <p className="student-map-prep-eyebrow">MAP practice</p>
          <h1>{assignment.set?.title || 'Practice set'}</h1>
        </header>

        <div className="student-map-prep-quiz-stage">
          <div className="student-map-prep-question-header">
            <div>
              <strong>Question {currentIndex + 1} of {questions.length}</strong>
              <span>{saving ? 'Saving…' : 'Saved'}</span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => { setAssignment(null); setQuestions([]); setAttempt(null); setCurrentIndex(0); setLocalAnswers({}); }}>
              Save and exit
            </button>
          </div>

          <div className="student-map-prep-progress-bar">
            {questions.map((question, index) => (
              <button
                key={question._id}
                type="button"
                className={index === currentIndex ? 'student-map-prep-progress-dot active' : 'student-map-prep-progress-dot'}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to question ${index + 1}`}
                title={`Question ${index + 1}`}
              />
            ))}
          </div>

          <div className="student-map-prep-question">
            <h3>{activeQuestion.stem}</h3>

            {activeQuestion.questionType === 'mcq' && (
              <div className="student-map-prep-options">
                {Array.isArray(activeQuestion.options) && activeQuestion.options.map((option) => (
                  <label key={`${activeQuestion._id}-${option.key}`}>
                    <input
                      type="radio"
                      name={activeQuestion._id}
                      value={option.key}
                      checked={String(currentAnswer) === String(option.key)}
                      onChange={(event) => updateAnswer(activeQuestion._id, event.target.value)}
                    />
                    <span><strong>{option.key}.</strong> {option.text}</span>
                  </label>
                ))}
              </div>
            )}

            {activeQuestion.questionType === 'multi_select' && (
              <div className="student-map-prep-options">
                {Array.isArray(activeQuestion.options) && activeQuestion.options.map((option) => (
                  <label key={`${activeQuestion._id}-${option.key}`}>
                    <input
                      type="checkbox"
                      value={option.key}
                      checked={Array.isArray(currentAnswer) && currentAnswer.includes(option.key)}
                      onChange={(event) => handleOptionChange(event, activeQuestion)}
                    />
                    <span><strong>{option.key}.</strong> {option.text}</span>
                  </label>
                ))}
              </div>
            )}

            {activeQuestion.questionType === 'short_text' && (
              <textarea
                value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                onChange={(event) => updateAnswer(activeQuestion._id, event.target.value)}
                placeholder="Type your answer here"
              />
            )}
          </div>

          <div className="student-map-prep-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCurrentIndex((previous) => Math.max(0, previous - 1))} disabled={currentIndex === 0}>
              Back
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { const nextIndex = Math.min(questions.length - 1, currentIndex + 1); setCurrentIndex(nextIndex); }}>
              {currentIndex === questions.length - 1 ? 'Review answers' : 'Next'}
            </button>
            {currentIndex === questions.length - 1 && (
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit set'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (resultSummary) {
    return (
      <div className="student-map-prep-page">
        <header>
          <p className="student-map-prep-eyebrow">MAP practice</p>
          <h1>{resultSummary.setTitle}</h1>
        </header>

        <section className="student-map-prep-list">
          <div className="student-map-prep-result-banner">
            <strong>{resultSummary.score} of {resultSummary.maxScore}</strong>
            <span>{resultSummary.needsTeacherReview ? 'Some answers are waiting for teacher review.' : 'Submitted and ready.'}</span>
          </div>
          <div className="student-map-prep-actions">
            <button type="button" className="btn btn-primary" onClick={() => setResultSummary(null)}>
              Back to my practice
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="student-map-prep-page">
      <header>
        <p className="student-map-prep-eyebrow">MAP practice</p>
        <h1>My practice</h1>
      </header>

      {message && <div className="student-map-prep-message">{message}</div>}

      {!home ? (
        <section className="student-map-prep-list">
          <p className="text-muted">Loading your practice...</p>
        </section>
      ) : (
        <>
          <section className="student-map-prep-list">
            <h2>Hi {home.student?.firstName || 'Student'}</h2>
            <p className="text-muted">You have {assignedSets.length || 0} set(s) to finish this week.</p>

            {assignedSets.length === 0 ? (
              <div className="student-map-prep-empty-state">
                <strong>Nothing assigned right now.</strong>
                <span>Pick an optional set below or ask your teacher.</span>
              </div>
            ) : (
              <div className="student-map-prep-grid">
                {assignedSets.map((assignmentItem) => (
                  <div key={assignmentItem._id} className="student-map-prep-card">
                    {(() => {
                      const progress = getMapPracticeSetProgress(home?.attempts || [], assignmentItem.set?._id, assignmentItem.set?.questionCount || 0);
                      const setAttempt = home?.attempts?.find((item) => String(item.set?._id || item.set) === String(assignmentItem.set?._id));
                      return (
                        <>
                    <div className="student-map-prep-card-header">
                      <h3>{assignmentItem.set?.title || 'Practice set'}</h3>
                      <span className="student-map-prep-chip">Due soon</span>
                    </div>
                    <p>{assignmentItem.set?.questionCount || 0} questions</p>
                    <div className="student-map-prep-progress-mini">
                      <span>{progress.answered} of {progress.total} answered</span>
                      <div className="student-map-prep-progress-mini-bar"><i style={{ width: `${progress.percentage}%` }} /></div>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => startAssignment(assignmentItem)}>
                      {setAttempt?.status === 'in_progress' ? 'Continue' : 'Start'}
                    </button>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="student-map-prep-list">
            <h3>My focus skills</h3>
            {focusSkills.length === 0 ? (
              <div className="student-map-prep-empty-state compact"><span>Not enough answers yet.</span></div>
            ) : (
              <div className="student-map-prep-skill-list">
                {focusSkills.map((skill) => (
                  <div key={skill.name} className="student-map-prep-skill-row">
                    <div className="student-map-prep-skill-header">
                      <strong>{skill.name}</strong>
                      <span>{skill.status}</span>
                    </div>
                    <div className="student-map-prep-progress-mini-bar"><i style={{ width: `${skill.progress}%` }} /></div>
                    <small>{skill.progress}% accuracy</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="student-map-prep-list">
            <h3>Practice more</h3>
            {optionalSets.length === 0 ? (
              <div className="student-map-prep-empty-state compact">
                <span>There are no optional sets for you right now.</span>
              </div>
            ) : (
              <div className="student-map-prep-grid">
                {optionalSets.map((planItem) => (
                  <div key={planItem._id} className="student-map-prep-card">
                    <div className="student-map-prep-card-header">
                      <h3>{planItem.title || 'MAP plan'}</h3>
                      <span className="student-map-prep-chip soft">Optional</span>
                    </div>
                    <p>{planItem.status || 'active'} plan</p>
                    <button type="button" className="btn btn-ghost" onClick={() => setMessage('Optional sets are ready for teacher assignment.')}>View</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="student-map-prep-list">
            <h3>Finished</h3>
            {finishedSets.length === 0 ? (
              <div className="student-map-prep-empty-state compact"><span>No finished sets yet.</span></div>
            ) : (
              <div className="student-map-prep-finished-list">
                {finishedSets.map((attemptItem) => (
                  <div key={attemptItem._id} className="student-map-prep-finished-row">
                    <strong>{attemptItem.set?.title || 'Finished set'}</strong>
                    <span>{attemptItem.score ?? 0} of {attemptItem.maxScore ?? 0}</span>
                    <small>{attemptItem.status === 'reviewed' ? 'Reviewed' : 'Submitted'}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default StudentMapTestPrepPage;
