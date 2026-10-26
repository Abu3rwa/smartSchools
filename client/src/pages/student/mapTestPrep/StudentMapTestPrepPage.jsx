import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HiOutlineAcademicCap } from 'react-icons/hi';
import api from '../../../config/api';
import { getMapPracticeAttemptState, getMapPracticeSetAction, getMapPracticeSetProgress, isMapPracticeAnswerRecorded } from './studentMapPracticeProgress';
import {
  clearMapPracticeDrafts,
  mergeMapPracticeDrafts,
  readMapPracticeDrafts,
  writeMapPracticeDrafts,
} from './studentMapPracticeDrafts';
import { getMatchingAnswerRows } from '../../../utils/mapPracticeMatching';
import { describeStudentAnswer, isObjectiveAnswerType } from '../../../utils/mapPracticeObjectiveAnswers';
import FillInBlankAnswerInput from '../../../components/assessment/FillInBlankAnswerInput';
import MatchingAnswerInput from '../../../components/assessment/MatchingAnswerInput';
import NumericAnswerInput from '../../../components/assessment/NumericAnswerInput';
import OrderingAnswerInput from '../../../components/assessment/OrderingAnswerInput';
import PassagePanel from '../../../components/assessment/PassagePanel';
import './StudentMapTestPrepPage.css';

const serializeAnswer = (value) => {
  try { return JSON.stringify(value ?? null); } catch { return String(value); }
};

const DAY_MS = 24 * 60 * 60 * 1000;

const getDueState = (dueDate) => {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;

  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / DAY_MS);

  if (days < 0) return { label: 'Overdue', tone: 'danger' };
  if (days === 0) return { label: 'Due today', tone: 'danger' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'warn' };
  if (days <= 7) return { label: `Due in ${days} days`, tone: 'warn' };
  return {
    label: `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    tone: 'soft'
  };
};

const formatSubmittedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const StudentMapTestPrepPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const handledDeepLink = useRef(false);
  const handledPracticeLink = useRef(false);
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
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const answerSaveSequence = useRef({});
  const savedAnswers = useRef({});
  const localDraftsRef = useRef({});

  // The answering view lives in the URL so a refresh lands on the same question.
  const updatePracticeParams = useCallback((next = {}) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      ['practice', 'question', 'attemptId', 'assignmentId'].forEach((key) => params.delete(key));
      Object.entries(next).forEach(([key, value]) => params.set(key, String(value)));
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Answers live in local drafts until a question Submit, "Save and exit", or the
  // final submit sends them; nothing is written to the server per keystroke.
  const setDrafts = (attemptId, next) => {
    localDraftsRef.current = next;
    writeMapPracticeDrafts(attemptId, next);
  };

  const loadDraftsFor = (attemptId) => {
    const drafts = readMapPracticeDrafts(attemptId);
    localDraftsRef.current = drafts;
    return drafts;
  };

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
  const feedbackMode = assignment?.feedbackMode || home?.settings?.feedbackMode || 'instant';
  const instantFeedback = feedbackMode === 'instant';

  const assignedSets = useMemo(
    () => Array.isArray(home?.assignedSets) ? home.assignedSets : [],
    [home]
  );

  const optionalSets = useMemo(
    () => Array.isArray(home?.plans) ? home.plans : [],
    [home]
  );

  const allAttempts = useMemo(
    () => [...(home?.activeAttempts || []), ...(home?.attempts || [])],
    [home]
  );

  const focusSkills = useMemo(() => {
    const names = new Set();
    (home?.plans || []).forEach((plan) => {
      (plan.skills || []).forEach((skill) => {
        if (skill?.name) names.add(skill.name);
      });
    });
    return Array.from(names).slice(0, 6);
  }, [home]);

  const setRows = useMemo(
    () => assignedSets.map((assignmentItem) => {
      const progress = getMapPracticeSetProgress(
        allAttempts,
        assignmentItem.set?._id,
        assignmentItem.set?.questionCount || 0
      );
      const existingAttempt = allAttempts.find(
        (item) => String(item.set?._id || item.set) === String(assignmentItem.set?._id)
      );
      return {
        assignmentItem,
        progress,
        existingAttempt,
        action: getMapPracticeSetAction(existingAttempt, progress),
        due: getDueState(assignmentItem.dueDate),
        isFinished: existingAttempt?.status === 'submitted' || existingAttempt?.status === 'reviewed',
      };
    }),
    [assignedSets, allAttempts]
  );

  const inProgressCount = setRows.filter((row) => !row.isFinished && row.progress.answered > 0).length;
  const readyToReviewCount = setRows.filter((row) => row.isFinished).length;

  const finishedSets = useMemo(() => {
    if (!Array.isArray(home?.attempts)) return [];
    return home.attempts.slice(0, 5);
  }, [home]);

  const startAssignment = useCallback(async (selectedAssignment) => {
    try {
      setMessage('');
      // The start endpoint already returns the set's questions, so opening a set is one request.
      const attemptResponse = await api.post(`/map-test-prep/practice/assignments/${selectedAssignment._id}/start`);
      const attemptData = attemptResponse.data?.data || {};
      const nextQuestions = Array.isArray(attemptData.questions) ? attemptData.questions : [];
      const attemptState = getMapPracticeAttemptState(nextQuestions, attemptData.attempt);
      const drafts = attemptData.attempt?._id ? loadDraftsFor(attemptData.attempt._id) : {};
      setAssignment(selectedAssignment);
      setQuestions(nextQuestions);
      setAttempt(attemptData.attempt || null);
      setCurrentIndex(attemptState.currentIndex);
      setLocalAnswers(
        mergeMapPracticeDrafts(
          attemptState.answers,
          drafts,
          nextQuestions.map((question) => question._id)
        )
      );
      setAnswerFeedback({});
      setRevealedAnswers({});
      setResultSummary(null);
      savedAnswers.current = {};
      if (attemptData.attempt?._id) {
        setHome((current) => {
          if (!current) return current;
          const nextAttempt = { ...attemptData.attempt, set: selectedAssignment.set?._id || selectedAssignment.set };
          return {
            ...current,
            activeAttempts: [
              nextAttempt,
              ...(current.activeAttempts || []).filter(
                (item) => String(item._id) !== String(nextAttempt._id),
              ),
            ],
          };
        });
      } else {
        setMessage('The set is ready. Start answering when you are ready.');
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to open this set.');
    }
  }, []);

  const openAttemptReview = useCallback(async (attemptId) => {
    setMessage('');
    setReviewLoading(true);
    try {
      const response = await api.get(`/map-test-prep/practice/attempts/${attemptId}`);
      setReviewAttempt(response.data?.data?.attempt || null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load your submitted answers.');
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const resumePractice = useCallback(async (attemptId) => {
    setMessage('');
    try {
      const response = await api.get(`/map-test-prep/practice/attempts/${attemptId}/resume`);
      const data = response.data?.data || {};
      const nextQuestions = Array.isArray(data.questions) ? data.questions : [];
      if (!data.attempt?._id || nextQuestions.length === 0) {
        setMessage('This practice set is no longer available.');
        updatePracticeParams();
        return;
      }
      const attemptState = getMapPracticeAttemptState(nextQuestions, data.attempt);
      const drafts = loadDraftsFor(data.attempt._id);
      const requestedQuestion = Number(searchParams.get('question'));
      const requestedIndex = Number.isInteger(requestedQuestion) && requestedQuestion > 0
        ? requestedQuestion - 1
        : -1;
      setAssignment(data.assignment || { set: data.attempt.set || null });
      setQuestions(nextQuestions);
      setAttempt(data.attempt);
      setCurrentIndex(
        requestedIndex >= 0 && requestedIndex < nextQuestions.length
          ? requestedIndex
          : attemptState.currentIndex
      );
      setLocalAnswers(
        mergeMapPracticeDrafts(
          attemptState.answers,
          drafts,
          nextQuestions.map((question) => question._id)
        )
      );
      setAnswerFeedback({});
      setRevealedAnswers({});
      setResultSummary(null);
      savedAnswers.current = {};
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to resume this practice set.');
      updatePracticeParams();
    }
  }, [searchParams, updatePracticeParams]);

  useEffect(() => {
    if (handledPracticeLink.current) return;
    const practiceId = searchParams.get('practice');
    if (!practiceId) return;

    handledPracticeLink.current = true;
    if (!/^[a-f\d]{24}$/i.test(practiceId)) {
      setMessage('The practice link is invalid.');
      updatePracticeParams();
      return;
    }
    void resumePractice(practiceId);
  }, [searchParams, resumePractice, updatePracticeParams]);

  useEffect(() => {
    if (!home || handledDeepLink.current) return;
    const attemptId = searchParams.get('attemptId');
    const assignmentId = searchParams.get('assignmentId');
    if (!attemptId && !assignmentId) return;

    handledDeepLink.current = true;
    if (attemptId) {
      if (!/^[a-f\d]{24}$/i.test(attemptId)) {
        setMessage('The MAP Prep review link is invalid.');
        return;
      }
      void openAttemptReview(attemptId);
      return;
    }

    if (!/^[a-f\d]{24}$/i.test(assignmentId)) {
      setMessage('The MAP Prep skill-set link is invalid.');
      return;
    }
    const assignmentToOpen = assignedSets.find(
      (item) => String(item._id) === String(assignmentId),
    );
    if (assignmentToOpen) {
      void startAssignment(assignmentToOpen);
    } else {
      setMessage('This MAP Prep skill set is no longer assigned to your account.');
    }
  }, [home, searchParams, assignedSets, openAttemptReview, startAssignment]);

  useEffect(() => {
    if (!assignment || !attempt?._id || questions.length === 0) return;
    const nextPractice = String(attempt._id);
    const nextQuestion = String(currentIndex + 1);
    if (searchParams.get('practice') === nextPractice && searchParams.get('question') === nextQuestion) return;
    updatePracticeParams({ practice: nextPractice, question: nextQuestion });
  }, [assignment, attempt, questions.length, currentIndex, searchParams, updatePracticeParams]);

  const persistAnswer = async (questionId, response) => {
    if (!attempt?._id) return false;
    const attemptId = attempt._id;
    const requestSequence = (answerSaveSequence.current[questionId] || 0) + 1;
    answerSaveSequence.current[questionId] = requestSequence;
    setAnswerFeedback((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setSaving(true);
    try {
      const answerResponse = await api.post(`/map-test-prep/practice/attempts/${attemptId}/answer`, { questionId, response });
      const result = answerResponse.data?.data || {};
      if (answerSaveSequence.current[questionId] !== requestSequence) return true;
      savedAnswers.current[questionId] = serializeAnswer(response);
      // The server has this response now, so its local draft can go.
      if (serializeAnswer(localDraftsRef.current[questionId]) === serializeAnswer(response)) {
        const nextDrafts = { ...localDraftsRef.current };
        delete nextDrafts[questionId];
        setDrafts(attemptId, nextDrafts);
      }
      if (result.feedback) {
        setAnswerFeedback((current) => ({ ...current, [questionId]: result.feedback }));
      }
      const savedAnswer = result.answer;
      if (!savedAnswer) return true;
      setHome((current) => {
        if (!current) return current;
        const existingAttempt = (current.activeAttempts || []).find((item) => String(item._id) === String(attemptId));
        if (!existingAttempt) return current;
        const answers = [...(existingAttempt.answers || [])];
        const answerIndex = answers.findIndex((answer) => String(answer.question?._id || answer.question) === String(questionId));
        const nextAnswer = {
          ...(answerIndex >= 0 ? answers[answerIndex] : {}),
          ...savedAnswer,
          question: questionId,
          response
        };
        if (answerIndex >= 0) answers[answerIndex] = nextAnswer;
        else answers.push(nextAnswer);
        return {
          ...current,
          activeAttempts: current.activeAttempts.map((item) => String(item._id) === String(attemptId) ? { ...item, answers } : item)
        };
      });
    } catch {
      setMessage('Your answer was not saved yet. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  };

  // "Save and exit" and the final submit send every local draft in one request.
  const flushDrafts = async () => {
    const attemptId = attempt?._id;
    if (!attemptId) return true;
    const entries = Object.entries(localDraftsRef.current || {});
    if (entries.length === 0) return true;

    setSaving(true);
    try {
      await api.post(`/map-test-prep/practice/attempts/${attemptId}/answers`, {
        answers: entries.map(([questionId, response]) => ({ questionId, response })),
      });
      const nextDrafts = { ...localDraftsRef.current };
      entries.forEach(([questionId, response]) => {
        delete nextDrafts[questionId];
        savedAnswers.current[questionId] = serializeAnswer(response);
      });
      setDrafts(attemptId, nextDrafts);
      setHome((current) => {
        if (!current) return current;
        const existingAttempt = (current.activeAttempts || []).find((item) => String(item._id) === String(attemptId));
        if (!existingAttempt) return current;
        const answers = [...(existingAttempt.answers || [])];
        entries.forEach(([questionId, response]) => {
          const answerIndex = answers.findIndex((answer) => String(answer.question?._id || answer.question) === String(questionId));
          const nextAnswer = {
            ...(answerIndex >= 0 ? answers[answerIndex] : {}),
            question: questionId,
            response
          };
          if (answerIndex >= 0) answers[answerIndex] = nextAnswer;
          else answers.push(nextAnswer);
        });
        return {
          ...current,
          activeAttempts: current.activeAttempts.map((item) => String(item._id) === String(attemptId) ? { ...item, answers } : item)
        };
      });
      return true;
    } catch {
      setMessage('Your answers were not saved yet. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateAnswer = (questionId, response) => {
    setLocalAnswers((current) => ({ ...current, [questionId]: response }));
    if (!attempt?._id) return;
    setDrafts(attempt._id, { ...localDraftsRef.current, [questionId]: response });
  };

  // A student only sees grading once they commit to the answer, and the commit closes the question.
  const submitCurrentQuestion = async () => {
    if (!activeQuestion) return;
    const questionId = activeQuestion._id;
    const response = localAnswers[questionId];

    // Deferred feedback modes grade the whole set at submit, so the answer stays a draft.
    if (!instantFeedback) {
      setRevealedAnswers((current) => ({ ...current, [questionId]: true }));
      return;
    }

    if (savedAnswers.current[questionId] === serializeAnswer(response)) {
      setRevealedAnswers((current) => ({ ...current, [questionId]: true }));
      return;
    }
    const saved = await persistAnswer(questionId, response);
    if (!saved) return;
    setRevealedAnswers((current) => ({ ...current, [questionId]: true }));
  };

  const handleOptionChange = (event, question) => {
    const value = event.target.value;
    const current = localAnswers[question._id] || [];
    const next = current.includes(value)
      ? current.filter((option) => option !== value)
      : [...current, value];
    updateAnswer(question._id, next);
  };

  const goToQuestion = (index) => {
    setCurrentIndex(index);
  };

  const exitPractice = async () => {
    if (!(await flushDrafts())) return;
    updatePracticeParams();
    setAssignment(null);
    setQuestions([]);
    setAttempt(null);
    setCurrentIndex(0);
    setLocalAnswers({});
  };

  const handleSubmit = async () => {
    if (!attempt?._id) return;
    // Make sure the last edit is in the database before the server grades the set.
    if (!(await flushDrafts())) return;
    setSubmitting(true);
    try {
      const completedAttemptId = attempt._id;
      const completedAssignment = assignment;
      const submitResponse = await api.post(`/map-test-prep/practice/attempts/${attempt._id}/submit`);
      const submitted = submitResponse.data?.data || {};
      clearMapPracticeDrafts(completedAttemptId);
      localDraftsRef.current = {};
      updatePracticeParams();
      setAssignment(null);
      setQuestions([]);
      setAttempt(null);
      setCurrentIndex(0);
      setLocalAnswers({});
      setAnswerFeedback({});
      setRevealedAnswers({});
      setResultSummary({
        score: submitted.score ?? 0,
        maxScore: submitted.maxScore ?? 0,
        needsTeacherReview: submitted.needsTeacherReview,
        attemptId: submitted.attempt?._id || attempt._id,
        setTitle: assignment?.set?.title || 'Practice set'
      });
      // Update the list from the submit response instead of reloading the whole home payload.
      setHome((current) => {
        if (!current) return current;
        const summary = {
          _id: completedAttemptId,
          set: completedAssignment?.set || attempt.set,
          status: submitted.attempt?.status || 'submitted',
          submittedAt: submitted.attempt?.submittedAt || new Date().toISOString(),
          score: submitted.score ?? 0,
          maxScore: submitted.maxScore ?? 0,
          reviewStatus: submitted.attempt?.reviewStatus || (submitted.needsTeacherReview ? 'pending' : 'reviewed'),
          savedAt: new Date().toISOString()
        };
        return {
          ...current,
          activeAttempts: (current.activeAttempts || []).filter((item) => String(item._id) !== String(completedAttemptId)),
          attempts: [summary, ...(current.attempts || []).filter((item) => String(item._id) !== String(completedAttemptId))]
        };
      });
      setMessage('Your answers were submitted. Your teacher will review them soon.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to submit this set.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentAnswer = activeQuestion ? localAnswers[activeQuestion._id] ?? '' : '';
  const answeredCount = questions.reduce(
    (count, question) => count + (isMapPracticeAnswerRecorded(localAnswers[question._id]) ? 1 : 0),
    0
  );
  const isRevealed = Boolean(activeQuestion && revealedAnswers[activeQuestion._id]);
  const practiceParam = searchParams.get('practice');
  const currentFeedback = isRevealed && activeQuestion ? answerFeedback[activeQuestion._id] : null;
  const feedbackCorrectAnswer = currentFeedback?.correctAnswer;
  const feedbackMatchingPairs = Array.isArray(currentFeedback?.matchingPairs) ? currentFeedback.matchingPairs : [];
  const matchingVerdictRows = activeQuestion?.questionType === 'matching' && feedbackMatchingPairs.length
    ? getMatchingAnswerRows({ ...activeQuestion, matchingPairs: feedbackMatchingPairs }, currentAnswer)
    : [];
  const correctAnswerText = feedbackMatchingPairs.length
    ? feedbackMatchingPairs.map((pair) => `${pair.left} → ${pair.right}`).join(', ')
    : currentFeedback?.options?.length
      ? String(feedbackCorrectAnswer || '')
        .split('|')
        .map((key) => {
          const option = currentFeedback.options.find((item) => String(item.key) === key);
          return option ? `${option.key}. ${option.text}` : key;
        })
        .join(', ')
      : feedbackCorrectAnswer;

  if (reviewAttempt) {
    return (
      <div className="student-map-prep-page">
        <header>
          <p className="student-map-prep-eyebrow">Submitted practice</p>
          <h1>{reviewAttempt.set?.title || 'Practice set'}</h1>
        </header>
        <section className="student-map-prep-list student-map-prep-answer-review">
          <div className="student-map-prep-result-banner">
            <strong>{reviewAttempt.score ?? 0} of {reviewAttempt.maxScore ?? 0}</strong>
            <span>{reviewAttempt.reviewStatus === 'pending'
              ? 'Your teacher is still reviewing some answers.'
              : 'Your answers have been reviewed.'}</span>
          </div>
          {(reviewAttempt.answers || []).map((answer, index) => {
            const question = answer.questionDetails || answer.questionSnapshot || {};
            const options = Array.isArray(question.options) ? question.options : [];
            const responses = Array.isArray(answer.response) ? answer.response : [answer.response];
            const matchingRows = question.questionType === 'matching' ? getMatchingAnswerRows(question, answer.response) : [];
            const objectiveAnswerText = isObjectiveAnswerType(question.questionType)
              ? describeStudentAnswer(question, answer.response)
              : '';
            const displayAnswer = responses.filter((value) => value !== null && value !== undefined && String(value).trim())
              .map((value) => options.find((option) => String(option.key) === String(value))?.text || String(value))
              .join(', ') || 'No answer saved';
            return (
              <article className="student-map-prep-reviewed-answer" key={String(answer._id || answer.questionId || index)}>
                <div className="student-map-prep-reviewed-answer-heading">
                  <h2>Question {index + 1}</h2>
                  <span className={`student-map-prep-mark ${answer.isCorrect === true ? 'correct' : answer.isCorrect === false ? 'incorrect' : 'pending'}`}>
                    {answer.isCorrect === true ? 'Correct' : answer.isCorrect === false ? 'Incorrect' : 'Awaiting review'}
                  </span>
                </div>
                <PassagePanel passage={answer.passageSnapshot || { title: question.passageTitle, text: question.passageText }} />
                <p className="student-map-prep-reviewed-stem">{question.stem || 'Question text unavailable.'}</p>
                {options.length > 0 && (
                  <ul className="student-map-prep-reviewed-options">
                    {options.map((option) => (
                      <li key={option.key}>
                        <strong>{option.key}.</strong> {option.text}
                      </li>
                    ))}
                  </ul>
                )}
                {question.questionType === 'matching' ? (
                  <ul className="student-map-prep-reviewed-matching">
                    {matchingRows.map((row) => (
                      <li key={row.term} className={row.unmatched ? 'unmatched' : ''}>
                        <span className="student-map-prep-matching-term">{row.term}</span>
                        <strong>{row.choice || 'No match chosen'}</strong>
                      </li>
                    ))}
                    {!matchingRows.length && <li className="unmatched"><strong>No answer saved</strong></li>}
                  </ul>
                ) : isObjectiveAnswerType(question.questionType) ? (
                  <p><strong>Your answer:</strong> {objectiveAnswerText || 'No answer saved'}</p>
                ) : (
                  <p><strong>Your answer:</strong> {displayAnswer}</p>
                )}
                {answer.teacherComment && <p><strong>Teacher feedback:</strong> {answer.teacherComment}</p>}
              </article>
            );
          })}
          <div className="student-map-prep-actions">
            <button type="button" className="btn btn-primary" onClick={() => setReviewAttempt(null)}>
              Back to my practice
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (reviewLoading) {
    return <div className="student-map-prep-page"><p role="status">Loading your answers…</p></div>;
  }

  if (practiceParam && !assignment) {
    return <div className="student-map-prep-page"><p role="status">Loading your practice…</p></div>;
  }

  if (assignment && activeQuestion) {
    return (
      <div className="student-map-prep-page">
        <header>
          <p className="student-map-prep-eyebrow">MAP practice</p>
          <h1>{assignment.set?.title || 'Practice set'}</h1>
        </header>

        <div className="student-map-prep-quiz-stage">
          <div className="student-map-prep-question-header">
            <div className="student-map-prep-question-meta">
              <strong>Question {currentIndex + 1} of {questions.length}</strong>
              <span className={`student-map-prep-save-state${saving ? ' is-saving' : ''}`}>
                <i aria-hidden="true" />
                {saving ? 'Saving…' : 'Draft saved'}
              </span>
            </div>
            <button type="button" className="btn btn-ghost student-map-prep-exit" onClick={exitPractice}>
              Save and exit
            </button>
          </div>

          <div className="student-map-prep-progress-row">
            <div className="student-map-prep-progress-bar">
              {questions.map((question, index) => {
                const answered = isMapPracticeAnswerRecorded(localAnswers[question._id]);
                const stateClass = index === currentIndex
                  ? ' active'
                  : answered
                    ? ' answered'
                    : '';
                return (
                  <button
                    key={question._id}
                    type="button"
                    className={`student-map-prep-progress-dot${stateClass}`}
                    onClick={() => goToQuestion(index)}
                    aria-label={`Go to question ${index + 1}${answered ? ', answered' : ''}`}
                    aria-current={index === currentIndex ? 'step' : undefined}
                    title={`Question ${index + 1}`}
                  />
                );
              })}
            </div>
            <span className="student-map-prep-progress-count">{answeredCount} of {questions.length} answered</span>
          </div>

          <div className="student-map-prep-question">
            <PassagePanel passage={{ title: activeQuestion.passageTitle, text: activeQuestion.passageText }} />
            {activeQuestion.questionType !== 'fill_in_blank' && <h3 className="student-map-prep-stem">{activeQuestion.stem}</h3>}

            <fieldset className="student-map-prep-answer-inputs" disabled={isRevealed}>
              {activeQuestion.questionType === 'mcq' && (
                <div className="student-map-prep-options">
                  {Array.isArray(activeQuestion.options) && activeQuestion.options.map((option) => {
                    const selected = String(currentAnswer) === String(option.key);
                    return (
                      <label
                        key={`${activeQuestion._id}-${option.key}`}
                        className={`student-map-prep-option${selected ? ' selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={activeQuestion._id}
                          value={option.key}
                          checked={selected}
                          onChange={(event) => updateAnswer(activeQuestion._id, event.target.value)}
                        />
                        <span className="student-map-prep-option-key">{option.key}</span>
                        <span className="student-map-prep-option-text">{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {activeQuestion.questionType === 'multi_select' && (
                <div className="student-map-prep-options">
                  {Array.isArray(activeQuestion.options) && activeQuestion.options.map((option) => {
                    const selected = Array.isArray(currentAnswer) && currentAnswer.includes(option.key);
                    return (
                      <label
                        key={`${activeQuestion._id}-${option.key}`}
                        className={`student-map-prep-option${selected ? ' selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          value={option.key}
                          checked={selected}
                          onChange={(event) => handleOptionChange(event, activeQuestion)}
                        />
                        <span className="student-map-prep-option-key">{option.key}</span>
                        <span className="student-map-prep-option-text">{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {activeQuestion.questionType === 'short_text' && (
                <textarea
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(event) => updateAnswer(activeQuestion._id, event.target.value)}
                  placeholder="Type your answer here"
                />
              )}

              {activeQuestion.questionType === 'matching' && (
                <MatchingAnswerInput
                  question={activeQuestion}
                  value={currentAnswer}
                  onChange={(response) => updateAnswer(activeQuestion._id, response)}
                  results={matchingVerdictRows}
                />
              )}
              {activeQuestion.questionType === 'ordering' && (
                <OrderingAnswerInput
                  question={activeQuestion}
                  value={currentAnswer}
                  onChange={(response) => updateAnswer(activeQuestion._id, response)}
                />
              )}
              {activeQuestion.questionType === 'fill_in_blank' && (
                <FillInBlankAnswerInput
                  question={activeQuestion}
                  value={currentAnswer}
                  onChange={(response) => updateAnswer(activeQuestion._id, response)}
                />
              )}
              {activeQuestion.questionType === 'numeric_response' && (
                <NumericAnswerInput
                  question={activeQuestion}
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(response) => updateAnswer(activeQuestion._id, response)}
                />
              )}
            </fieldset>
            {!isRevealed && !isMapPracticeAnswerRecorded(currentAnswer) && (
              <p className="student-map-prep-answer-hint">
                {instantFeedback
                  ? 'Answer this question, then press Submit to see your feedback.'
                  : 'Answer this question, then press Submit to move on. Your answers are graded when you submit the set.'}
              </p>
            )}
            {currentFeedback && (
              <div
                className={`student-map-prep-feedback ${
                  currentFeedback.requiresTeacherReview
                    ? 'pending'
                    : currentFeedback.isCorrect
                      ? 'correct'
                      : 'incorrect'
                }`}
                role="status"
                aria-live="polite"
              >
                <strong>
                  {currentFeedback.requiresTeacherReview
                    ? 'Your teacher will review this answer.'
                    : currentFeedback.isCorrect
                      ? 'Correct!'
                      : currentFeedback.score > 0
                        ? 'Partially correct.'
                        : 'Not quite.'}
                </strong>
                {correctAnswerText && currentFeedback.isCorrect === false && !feedbackMatchingPairs.length && (
                  <span><strong>Correct answer:</strong> {correctAnswerText}</span>
                )}
                {currentFeedback.explanation && <span>{currentFeedback.explanation}</span>}
              </div>
            )}
          </div>

          <div className="student-map-prep-actions student-map-prep-quiz-actions">
            <button type="button" className="btn btn-ghost" onClick={() => goToQuestion(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
              Back
            </button>
            {!isRevealed && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitCurrentQuestion}
                disabled={!isMapPracticeAnswerRecorded(currentAnswer)}
              >
                Submit
              </button>
            )}
            {isRevealed && currentIndex < questions.length - 1 && (
              <button type="button" className="btn btn-secondary" onClick={() => setCurrentIndex((previous) => Math.min(questions.length - 1, previous + 1))}>
                Next
              </button>
            )}
            {isRevealed && currentIndex === questions.length - 1 && (
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
            {resultSummary.attemptId && (
              <button type="button" className="btn btn-secondary" onClick={() => {
                setResultSummary(null);
                void openAttemptReview(resultSummary.attemptId);
              }}>
                Review answers
              </button>
            )}
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
      <header className="student-map-prep-hero">
        <div className="student-map-prep-hero-text">
          <p className="student-map-prep-eyebrow">MAP practice</p>
          <h1>My practice</h1>
          {home && (
            <p className="student-map-prep-hero-sub">
              Hi {home.student?.firstName || 'Student'}, you have{' '}
              <strong>{assignedSets.length === 1 ? '1 set' : `${assignedSets.length} sets`}</strong>{' '}
              to finish this week.
            </p>
          )}
        </div>
        <span className="student-map-prep-hero-badge" aria-hidden="true">
          <HiOutlineAcademicCap size={26} />
        </span>
      </header>

      {message && <div className="student-map-prep-message">{message}</div>}

      {!home ? (
        <section className="student-map-prep-list">
          <p className="text-muted">Loading your practice...</p>
        </section>
      ) : (
        <>
          <section className="student-map-prep-summary" aria-label="Practice summary">
            <div className="student-map-prep-stat">
              <strong>{assignedSets.length}</strong>
              <span>Assigned</span>
            </div>
            <div className="student-map-prep-stat is-active">
              <strong>{inProgressCount}</strong>
              <span>In progress</span>
            </div>
            <div className="student-map-prep-stat is-ready">
              <strong>{readyToReviewCount}</strong>
              <span>Ready to review</span>
            </div>
          </section>

          <section className="student-map-prep-list">
            <div className="student-map-prep-section-head">
              <h2>Assigned practice</h2>
            </div>

            {assignedSets.length === 0 ? (
              <div className="student-map-prep-empty-state">
                <strong>Nothing assigned right now.</strong>
                <span>Pick an optional set below or ask your teacher.</span>
              </div>
            ) : (
              <div className="student-map-prep-table-wrap">
                <table className="student-map-prep-table">
                  <caption className="student-map-prep-sr-only">Assigned practice sets</caption>
                  <thead>
                    <tr>
                      <th scope="col">Set</th>
                      <th scope="col">Questions</th>
                      <th scope="col">Progress</th>
                      <th scope="col" aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody>
                    {setRows.map(({ assignmentItem, progress, existingAttempt, action, due, isFinished }) => {
                      const totalQuestions = assignmentItem.set?.questionCount || 0;
                      const estimatedMinutes = Number(assignmentItem.set?.estimatedMinutes || 0);
                      return (
                        <tr key={assignmentItem._id}>
                          <td>
                            <div className="student-map-prep-set-title">
                              <strong>{assignmentItem.set?.title || 'Practice set'}</strong>
                              {due && (
                                <span className={`student-map-prep-chip is-${due.tone}`}>{due.label}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="student-map-prep-question-count">
                              {totalQuestions} {totalQuestions === 1 ? 'question' : 'questions'}
                            </span>
                            {estimatedMinutes > 0 && (
                              <small className="student-map-prep-question-meta">about {estimatedMinutes} min</small>
                            )}
                          </td>
                          <td data-label="Progress">
                            <div className="student-map-prep-progress-mini">
                              <div className="student-map-prep-progress-labels">
                                <span>{progress.answered} of {progress.total} answered</span>
                                <strong>{progress.percentage}%</strong>
                              </div>
                              <div className="student-map-prep-progress-mini-bar">
                                <i
                                  className={progress.percentage >= 100 ? 'is-complete' : undefined}
                                  style={{ width: `${progress.percentage}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="student-map-prep-table-action">
                            <button
                              type="button"
                              className={`btn ${isFinished ? 'btn-secondary' : 'btn-primary'}`}
                              disabled={action.disabled}
                              onClick={() => isFinished
                                ? void openAttemptReview(existingAttempt._id)
                                : void startAssignment(assignmentItem)}
                            >
                              {action.label}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="student-map-prep-list">
            <div className="student-map-prep-section-head">
              <h2>My focus skills</h2>
            </div>
            {focusSkills.length === 0 ? (
              <div className="student-map-prep-empty-state compact">
                <span>Your teacher has not set focus skills yet.</span>
              </div>
            ) : (
              <>
                <p className="student-map-prep-section-hint">Skills your teacher is tracking for you.</p>
                <div className="student-map-prep-skill-chips">
                  {focusSkills.map((skill) => (
                    <span key={skill} className="student-map-prep-skill-chip">{skill}</span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="student-map-prep-list">
            <div className="student-map-prep-section-head">
              <h2>Practice more</h2>
            </div>
            {optionalSets.length === 0 ? (
              <div className="student-map-prep-empty-state compact">
                <span>There are no optional sets for you right now.</span>
              </div>
            ) : (
              <div className="student-map-prep-table-wrap">
                <table className="student-map-prep-table">
                  <caption className="student-map-prep-sr-only">Optional practice sets</caption>
                  <thead>
                    <tr>
                      <th scope="col">Plan</th>
                      <th scope="col">Status</th>
                      <th scope="col" aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody>
                    {optionalSets.map((planItem) => (
                      <tr key={planItem._id}>
                        <td><strong>{planItem.title || 'MAP plan'}</strong></td>
                        <td><span className="student-map-prep-chip is-soft">{planItem.status || 'active'} plan</span></td>
                        <td className="student-map-prep-table-action">
                          <button type="button" className="btn btn-ghost" onClick={() => setMessage('Optional sets are ready for teacher assignment.')}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="student-map-prep-list">
            <div className="student-map-prep-section-head">
              <h2>Finished</h2>
            </div>
            {finishedSets.length === 0 ? (
              <div className="student-map-prep-empty-state compact"><span>No finished sets yet.</span></div>
            ) : (
              <div className="student-map-prep-finished-list">
                {finishedSets.map((attemptItem) => (
                  <div key={attemptItem._id} className="student-map-prep-finished-row">
                    <div className="student-map-prep-finished-main">
                      <strong>{attemptItem.set?.title || 'Finished set'}</strong>
                      <small>
                        {attemptItem.status === 'reviewed' ? 'Reviewed' : 'Submitted'}
                        {formatSubmittedDate(attemptItem.submittedAt) && ` · ${formatSubmittedDate(attemptItem.submittedAt)}`}
                      </small>
                    </div>
                    <span className="student-map-prep-score">
                      {attemptItem.score ?? 0} of {attemptItem.maxScore ?? 0}
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openAttemptReview(attemptItem._id)}>
                      Review answers
                    </button>
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
