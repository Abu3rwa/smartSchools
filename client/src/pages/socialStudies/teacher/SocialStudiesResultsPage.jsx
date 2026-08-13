import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    fetchAssignmentResults, gradeSubmission,
    selectActiveResults, selectResultsLoading,
} from '../../../store/slices/socialStudiesSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

export default function SocialStudiesResultsPage() {
    const { assignmentId } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const results = useSelector(selectActiveResults);
    const loading = useSelector(selectResultsLoading);
    const [gradingSubId, setGradingSubId] = useState(null);
    const [manualGrades, setManualGrades] = useState({});

    useEffect(() => {
        dispatch(fetchAssignmentResults(assignmentId));
    }, [dispatch, assignmentId]);

    const assignment = results?.assignment;
    const submissions = results?.submissions || [];

    const startManualGrade = (sub) => {
        setGradingSubId(sub._id);
        const shortAnswerGrades = {};
        (sub.answers || []).forEach(a => {
            const q = assignment?.questions?.find(q => String(q.questionId) === String(a.questionId));
            if (q?.questionType === 'short_answer') {
                shortAnswerGrades[String(a.questionId)] = a.pointsEarned ?? 0;
            }
        });
        setManualGrades(shortAnswerGrades);
    };

    const handleGrade = async (subId) => {
        try {
            const questionGrades = Object.entries(manualGrades).map(([questionId, pointsEarned]) => ({ questionId, pointsEarned: Number(pointsEarned) }));
            await dispatch(gradeSubmission({ id: subId, questionGrades })).unwrap();
            toast.success('Submission graded and added to gradebook');
            setGradingSubId(null);
        } catch (err) {
            toast.error(err || 'Grading failed');
        }
    };

    const totalPoints = assignment?.totalPoints || 0;
    const submitted = submissions.filter(s => s.status !== 'in_progress').length;
    const graded = submissions.filter(s => s.status === 'graded').length;
    const avgScore = graded > 0 ? (submissions.filter(s => s.status === 'graded').reduce((a, s) => a + s.percentage, 0) / graded).toFixed(1) : null;

    if (loading) return <div style={{ padding: 32 }}>Loading results…</div>;

    return (
        <div className="ss-page" style={{ padding: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '0 0 16px', display: 'block' }}>← Back</button>

                {/* Summary */}
                <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>{assignment?.title}</h1>
                <p style={{ margin: '0 0 20px', color: '#666' }}>
                    {assignment?.assignmentType} · {assignment?.class?.name} · {totalPoints} points total
                </p>

                <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                    {[
                        ['Submitted', submitted, '#eff6ff', '#1d4ed8'],
                        ['Graded', graded, '#f0fdf4', '#166534'],
                        ['Avg Score', avgScore ? `${avgScore}%` : '—', '#fef9c3', '#854d0e'],
                    ].map(([label, val, bg, color]) => (
                        <div key={label} style={{ background: bg, color, borderRadius: 10, padding: '12px 20px', minWidth: 100 }}>
                            <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{val}</p>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{label}</p>
                        </div>
                    ))}
                </div>

                {/* Submissions list */}
                {submissions.length === 0 ? (
                    <p style={{ color: '#888' }}>No submissions yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {submissions.map(sub => {
                            const student = sub.student;
                            const needsGrading = sub.status === 'submitted';
                            const isGrading = gradingSubId === sub._id;

                            return (
                                <div key={sub._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600 }}>{student?.firstName} {student?.lastName}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                                                {student?.studentId} · Attempt {sub.attempt}
                                                {sub.submittedAt && ` · Submitted ${new Date(sub.submittedAt).toLocaleString()}`}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            {sub.status === 'graded' && (
                                                <span style={{ fontWeight: 700, color: sub.percentage >= 60 ? '#166534' : '#991b1b', fontSize: 18 }}>
                                                    {sub.score}/{totalPoints} ({sub.percentage}%)
                                                </span>
                                            )}
                                            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, fontWeight: 600, background: sub.status === 'graded' ? '#dcfce7' : sub.status === 'submitted' ? '#fef9c3' : '#f3f4f6', color: sub.status === 'graded' ? '#166534' : sub.status === 'submitted' ? '#854d0e' : '#6b7280' }}>
                                                {sub.status}
                                            </span>
                                            {needsGrading && !isGrading && (
                                                <button onClick={() => startManualGrade(sub)} className="btn-primary" style={{ fontSize: 13, padding: '6px 12px' }}>Grade</button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Manual grading panel for short_answer */}
                                    {isGrading && (
                                        <div style={{ marginTop: 16, background: '#f9fafb', borderRadius: 8, padding: 16 }}>
                                            <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 14 }}>Grade Short-Answer Questions</p>
                                            {(sub.answers || []).map(a => {
                                                const q = assignment?.questions?.find(q => String(q.questionId) === String(a.questionId));
                                                if (q?.questionType !== 'short_answer') return null;
                                                return (
                                                    <div key={String(a.questionId)} style={{ marginBottom: 14 }}>
                                                        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>{q.questionText}</p>
                                                        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#374151' }}>Student answer: <em>"{a.answer || '(no answer)'}"</em></p>
                                                        {q.correctAnswer && <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>Model answer: {q.correctAnswer}</p>}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: 13 }}>Points:</span>
                                                            <input type="number" min={0} max={q.points} value={manualGrades[String(a.questionId)] ?? 0} onChange={e => setManualGrades(prev => ({ ...prev, [String(a.questionId)]: e.target.value }))} style={{ width: 60, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                                                            <span style={{ fontSize: 12, color: '#6b7280' }}>/ {q.points}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                                <button onClick={() => handleGrade(sub._id)} className="btn btn-primary">Save Grades → Gradebook</button>
                                                <button onClick={() => setGradingSubId(null)} className="btn btn-secondary">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
    );
}
