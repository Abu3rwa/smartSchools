import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import {
    startSubmission, submitSubmission, fetchMySubmissions,
    selectActiveSubmission, selectSubmitting, clearActiveSubmission,
} from '../../../store/slices/socialStudiesSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

export default function StudentSocialStudiesAssessmentPage() {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const submission = useSelector(selectActiveSubmission);
    const submitting = useSelector(selectSubmitting);

    const [assignment, setAssignment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            try {
                const res = await api.get(`/social-studies/assignments/${assignmentId}`);
                const a = res.data.data;
                setAssignment(a);

                const sub = await dispatch(startSubmission(assignmentId)).unwrap();
                if (a.timeLimit) {
                    const elapsed = sub.startedAt ? Math.floor((Date.now() - new Date(sub.startedAt)) / 1000) : 0;
                    setTimeLeft(Math.max(0, a.timeLimit - elapsed));
                }
            } catch (err) {
                toast.error(err?.response?.data?.message || String(err) || 'Failed to start');
            } finally {
                setLoading(false);
            }
        };
        init();
        return () => { dispatch(clearActiveSubmission()); clearInterval(timerRef.current); };
    }, [dispatch, assignmentId]);

    // Timer
    useEffect(() => {
        if (timeLeft == null || timeLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { clearInterval(timerRef.current); handleSubmit(true); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [timeLeft, submitted]);

    const handleAnswer = (questionId, value) => {
        setAnswers(prev => ({ ...prev, [String(questionId)]: value }));
    };

    const handleSubmit = async (autoSubmit = false) => {
        if (submitting) return;
        if (!autoSubmit && !window.confirm('Submit your answers? You cannot change them after submission.')) return;
        clearInterval(timerRef.current);

        try {
            let activeSubmission = submission;
            if (!activeSubmission?._id && !activeSubmission?.id) {
                activeSubmission = await dispatch(startSubmission(assignmentId)).unwrap();
            }

            const submissionId = activeSubmission?._id || activeSubmission?.id;
            if (!submissionId) {
                toast.error('Unable to start submission. Please try again.');
                return;
            }

            const answersArr = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
            await dispatch(submitSubmission({ id: submissionId, answers: answersArr })).unwrap();
            await dispatch(fetchMySubmissions());
            setSubmitted(true);
            toast.success('Assignment submitted successfully.');
        } catch (err) {
            toast.error(err?.message || String(err) || 'Submission failed');
        }
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    if (loading) return <div style={{ padding: 32 }}>Starting assignment…</div>;
    if (!assignment) return <div style={{ padding: 32, color: '#888' }}>Assignment not found.</div>;

    if (submitted) {
        const sub = submission;
        return (
            <FeatureGate feature="socialStudies">
                <div className="ss-page" style={{ padding: 32, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>
                        {sub?.percentage >= 60 ? '🎉' : '📝'}
                    </div>
                    <h2 style={{ margin: 0 }}>
                        {sub?.status === 'submitted' ? 'Submitted for Review' : 'Assignment Complete!'}
                    </h2>
                    {sub?.status === 'graded' ? (
                        <>
                            <p style={{ fontSize: 36, fontWeight: 800, color: sub?.percentage >= 60 ? '#166534' : '#991b1b', margin: '12px 0' }}>
                                {sub?.score}/{sub?.totalPoints}
                            </p>
                            <p style={{ color: '#666' }}>{sub?.percentage}%</p>
                        </>
                    ) : (
                        <p style={{ color: '#666', marginTop: 8 }}>Your answers have been submitted. Your teacher will review and grade them shortly.</p>
                    )}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                        <button onClick={() => navigate('/portal/social-studies/student')} className="btn btn-primary">Back to Social Studies</button>
                        {sub?._id && <button onClick={() => navigate(`/portal/social-studies/student/results/${sub._id}`)} className="btn btn-secondary">See Answers</button>}
                    </div>
                </div>
            </FeatureGate>
        );
    }

    const questions = assignment.questions || [];
    const answeredCount = Object.keys(answers).length;

    return (
        <FeatureGate feature="socialStudies">
            <div className="ss-page" style={{ padding: 24, maxWidth: 780, margin: '0 auto' }}>
                {/* Sticky header */}
                <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingBottom: 16, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{assignment.title}</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                                {answeredCount}/{questions.length} answered
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {timeLeft != null && (
                                <span style={{ fontWeight: 700, fontSize: 18, color: timeLeft < 60 ? '#ef4444' : '#374151', background: timeLeft < 60 ? '#fee2e2' : '#f3f4f6', padding: '4px 12px', borderRadius: 8 }}>
                                    ⏱ {formatTime(timeLeft)}
                                </span>
                            )}
                            <button type="button" onClick={() => handleSubmit(false)} className="btn-primary" disabled={submitting}>
                                {submitting ? 'Submitting…' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginTop: 10, background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%`, background: '#2563eb', height: '100%', transition: 'width 0.2s' }} />
                    </div>
                </div>

                {assignment.instructions && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#1e40af', fontSize: 14 }}>
                        <strong>Instructions:</strong> {assignment.instructions}
                    </div>
                )}

                {/* Questions */}
                {questions.map((q, idx) => {
                    const qId = String(q.questionId || q._id || `q-${idx}`);
                    const selected = answers[qId];

                    return (
                        <div key={qId} style={{ background: '#fff', border: `2px solid ${selected ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 12, padding: 20, marginBottom: 16, transition: 'border-color 0.15s' }}>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                <span style={{ width: 30, height: 30, background: selected ? '#2563eb' : '#f3f4f6', color: selected ? '#fff' : '#374151', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{idx + 1}</span>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111827', lineHeight: 1.5 }}>{q.questionText}</p>
                            </div>

                            {q.questionType === 'multiple_choice' && (
                                <div style={{ paddingLeft: 42 }}>
                                    {(q.options || []).map(opt => (
                                        <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', marginBottom: 6, background: selected === opt.label ? '#eff6ff' : '#f9fafb', border: `1px solid ${selected === opt.label ? '#93c5fd' : '#e5e7eb'}`, transition: 'all 0.1s' }}>
                                            <input type="radio" name={`q-${qId}`} value={opt.label} checked={selected === opt.label} onChange={() => handleAnswer(qId, opt.label)} style={{ flexShrink: 0 }} />
                                            <span style={{ fontSize: 14 }}><strong>{opt.label}.</strong> {opt.text}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {q.questionType === 'true_false' && (
                                <div style={{ paddingLeft: 42, display: 'flex', gap: 12 }}>
                                    {['True', 'False'].map(v => (
                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: selected === v ? '#eff6ff' : '#f9fafb', border: `1px solid ${selected === v ? '#93c5fd' : '#e5e7eb'}`, fontWeight: selected === v ? 700 : 400, fontSize: 14, transition: 'all 0.1s' }}>
                                            <input type="radio" name={`q-${qId}`} value={v} checked={selected === v} onChange={() => handleAnswer(qId, v)} />
                                            {v}
                                        </label>
                                    ))}
                                </div>
                            )}

                            {q.questionType === 'short_answer' && (
                                <div style={{ paddingLeft: 42 }}>
                                    <textarea
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', minHeight: 80, boxSizing: 'border-box' }}
                                        value={selected || ''}
                                        onChange={e => handleAnswer(qId, e.target.value)}
                                        placeholder="Type your answer here…"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}

                <div style={{ paddingTop: 16, borderTop: '2px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => handleSubmit(false)} className="btn-primary" disabled={submitting} style={{ padding: '10px 24px', fontSize: 15 }}>
                        {submitting ? 'Submitting…' : `Submit ${answeredCount}/${questions.length} Answers`}
                    </button>
                </div>
            </div>
        </FeatureGate>
    );
}
