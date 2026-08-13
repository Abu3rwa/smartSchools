import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import api from '../../../config/api';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

export default function StudentSocialStudiesResultsPage() {
    const { submissionId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/social-studies/submissions/${submissionId}`)
            .then(res => setData(res.data.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [submissionId]);

    if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
    if (!data) return <div style={{ padding: 32, color: '#888' }}>Result not found.</div>;

    const { assignment, answers = [], score, totalPoints, percentage, status } = data;
    const questions = assignment?.questions || [];

    const getAnswer = (questionId) => answers.find(a => String(a.questionId) === String(questionId));

    return (
        <FeatureGate feature="socialStudies">
            <div className="ss-page" style={{ padding: 24, maxWidth: 780, margin: '0 auto' }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '0 0 16px', display: 'block' }}>← Back</button>

                {/* Score Banner */}
                <div style={{ background: percentage >= 60 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${percentage >= 60 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: 24, marginBottom: 28, textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#6b7280' }}>{assignment?.title}</p>
                    {status === 'graded' ? (
                        <>
                            <p style={{ margin: 0, fontSize: 40, fontWeight: 800, color: percentage >= 60 ? '#166534' : '#991b1b' }}>
                                {score}/{totalPoints}
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: 18, color: percentage >= 60 ? '#166534' : '#991b1b' }}>{percentage}%</p>
                        </>
                    ) : (
                        <p style={{ margin: 0, fontSize: 18, color: '#854d0e', fontWeight: 600 }}>Awaiting teacher review</p>
                    )}
                </div>

                {/* Question review */}
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Answer Review</h2>

                {questions.map((q, idx) => {
                    const ans = getAnswer(q.questionId);
                    const isCorrect = ans?.isCorrect;
                    const isShortAnswer = q.questionType === 'short_answer';

                    return (
                        <div key={String(q.questionId)} style={{ background: '#fff', border: `2px solid ${isShortAnswer ? '#e5e7eb' : isCorrect ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                                <span style={{ width: 28, height: 28, borderRadius: '50%', background: isShortAnswer ? '#f3f4f6' : isCorrect ? '#dcfce7' : '#fee2e2', color: isShortAnswer ? '#6b7280' : isCorrect ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                                    {isShortAnswer ? idx + 1 : isCorrect ? '✓' : '✗'}
                                </span>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111827' }}>{q.questionText}</p>
                            </div>

                            <div style={{ paddingLeft: 38, fontSize: 14 }}>
                                <p style={{ margin: '0 0 4px', color: '#374151' }}>
                                    <strong>Your answer:</strong>{' '}
                                    <span style={{ color: isShortAnswer ? '#374151' : isCorrect ? '#166534' : '#991b1b', fontWeight: 600 }}>
                                        {ans?.answer || '(no answer)'}
                                    </span>
                                </p>
                                {!isShortAnswer && !isCorrect && q.correctAnswer && (
                                    <p style={{ margin: '0 0 4px', color: '#166534' }}>
                                        <strong>Correct answer:</strong> {q.correctAnswer}
                                    </p>
                                )}
                                {isShortAnswer && ans && (
                                    <p style={{ margin: '0 0 4px', color: '#6b7280' }}>
                                        Points: <strong>{ans.pointsEarned ?? '–'}</strong> / {q.points}
                                    </p>
                                )}
                                {q.explanation && (
                                    <p style={{ margin: '8px 0 0', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, color: '#374151', fontStyle: 'italic' }}>
                                        💬 {q.explanation}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}

                <div style={{ marginTop: 24 }}>
                    <button onClick={() => navigate('/portal/social-studies/student')} className="btn btn-primary">Back to Social Studies</button>
                </div>
            </div>
        </FeatureGate>
    );
}
