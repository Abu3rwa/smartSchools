import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchStudentAssignments, fetchMySubmissions,
    selectStudentAssignments, selectStudentAssignmentsLoading,
    selectMySubmissions,
} from '../../../store/slices/socialStudiesSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

const STATUS_COLOR = {
    in_progress: { bg: '#fef9c3', color: '#854d0e' },
    submitted: { bg: '#eff6ff', color: '#1d4ed8' },
    graded: { bg: '#dcfce7', color: '#166534' },
};

export default function StudentSocialStudiesPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const academicYear = useSelector(selectCurrentAcademicYear);
    const assignments = useSelector(selectStudentAssignments);
    const loading = useSelector(selectStudentAssignmentsLoading);
    const mySubmissions = useSelector(selectMySubmissions);

    useEffect(() => {
        dispatch(fetchStudentAssignments({ academicYear }));
        dispatch(fetchMySubmissions());
    }, [dispatch, academicYear]);

    const subMap = Object.fromEntries(mySubmissions.map(s => [String(s.assignment?._id || s.assignment), s]));

    const pending = assignments.filter(a => {
        const sub = subMap[String(a._id)];
        return !sub || sub.status === 'in_progress';
    });
    const completed = assignments.filter(a => {
        const sub = subMap[String(a._id)];
        return sub && (sub.status === 'submitted' || sub.status === 'graded');
    });

    return (
        <FeatureGate feature="socialStudies">
            <div className="ss-page" style={{ padding: 24 }}>
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Social Studies</h1>
                    <p style={{ margin: '4px 0 0', color: '#666' }}>Your lessons and assignments</p>
                </div>

                {loading ? <p>Loading…</p> : (
                    <>
                        {/* Pending Assignments */}
                        <section style={{ marginBottom: 32 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
                                Pending {pending.length > 0 && <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 99, fontSize: 12, padding: '2px 8px', marginLeft: 6 }}>{pending.length}</span>}
                            </h2>
                            {pending.length === 0 ? (
                                <p style={{ color: '#888' }}>All assignments completed!</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {pending.map(a => {
                                        const sub = subMap[String(a._id)];
                                        const typeColors = { classwork: '#eff6ff', homework: '#fef9c3', quiz: '#f0fdf4' };
                                        const typeText = { classwork: '#1d4ed8', homework: '#854d0e', quiz: '#166534' };
                                        return (
                                            <div key={a._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: typeColors[a.assignmentType] || '#f3f4f6', color: typeText[a.assignmentType] || '#374151' }}>
                                                            {a.assignmentType}
                                                        </span>
                                                        {a.dueDate && (
                                                            <span style={{ fontSize: 12, color: new Date(a.dueDate) < new Date() ? '#ef4444' : '#6b7280' }}>
                                                                Due {new Date(a.dueDate).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{a.title}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                                                        {a.unit?.title} · {a.lesson?.title} · {a.questions?.length || 0} questions
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    {a.lesson?._id && (
                                                        <button onClick={() => navigate(`/portal/social-studies/student/lessons/${a.lesson._id}`)} className="btn-secondary" style={{ fontSize: 13 }}>
                                                            Read Lesson
                                                        </button>
                                                    )}
                                                    <button onClick={() => navigate(`/portal/social-studies/student/assignments/${a._id}`)} className="btn-primary" style={{ fontSize: 13 }}>
                                                        {sub?.status === 'in_progress' ? 'Continue' : 'Start'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* Completed / Past Work */}
                        <section>
                            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Past Work</h2>
                            {completed.length === 0 ? (
                                <p style={{ color: '#888' }}>No completed assignments yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {completed.map(a => {
                                        const sub = subMap[String(a._id)];
                                        const sc = STATUS_COLOR[sub?.status] || STATUS_COLOR.submitted;
                                        return (
                                            <div key={a._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 600 }}>{a.title}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{a.unit?.title} · {a.assignmentType}</p>
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    {sub?.status === 'graded' && (
                                                        <span style={{ fontWeight: 700, fontSize: 16, color: sub.percentage >= 60 ? '#166534' : '#991b1b' }}>
                                                            {sub.score}/{sub.totalPoints} ({sub.percentage}%)
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, fontWeight: 600, background: sc.bg, color: sc.color }}>
                                                        {sub?.status}
                                                    </span>
                                                    <button onClick={() => navigate(`/portal/social-studies/student/results/${sub?._id}`)} className="btn-secondary" style={{ fontSize: 13 }}>
                                                        View
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </FeatureGate>
    );
}
