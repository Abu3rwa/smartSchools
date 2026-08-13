import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import {
    fetchLessons, createLesson, deleteLesson, updateUnit,
    selectLessonsByUnit, selectUnits, selectAssignments,
    fetchAssignments,
} from '../../../store/slices/socialStudiesSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

export default function SocialStudiesUnitDetailPage() {
    const { unitId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const units = useSelector(selectUnits);
    const unit = units.find(u => u._id === unitId);
    const lessons = useSelector(selectLessonsByUnit(unitId));
    const assignments = useSelector(selectAssignments);

    const [showNewLesson, setShowNewLesson] = useState(false);
    const [newLessonTitle, setNewLessonTitle] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        dispatch(fetchLessons(unitId));
        dispatch(fetchAssignments({ unitId }));
    }, [dispatch, unitId]);

    const handlePublishUnit = async () => {
        try {
            await dispatch(updateUnit({ id: unitId, data: { isPublished: true } })).unwrap();
            toast.success('Unit published — students can now see it');
        } catch (err) {
            toast.error(err || 'Failed to publish');
        }
    };

    const handleCreateLesson = async () => {
        if (!newLessonTitle.trim()) return toast.error('Lesson title required');
        setSaving(true);
        try {
            const lesson = await dispatch(createLesson({ unitId, title: newLessonTitle.trim() })).unwrap();
            toast.success('Lesson created');
            setShowNewLesson(false);
            setNewLessonTitle('');
            navigate(`/portal/social-studies/lessons/${lesson._id}/edit`);
        } catch (err) {
            toast.error(err || 'Failed');
        } finally { setSaving(false); }
    };

    const handleDeleteLesson = async (lesson) => {
        if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
        try {
            await dispatch(deleteLesson(lesson._id)).unwrap();
            toast.success('Lesson deleted');
        } catch (err) {
            toast.error(err || 'Failed');
        }
    };

    const unitAssignments = assignments.filter(a => a.unit?._id === unitId || a.unit === unitId);

    return (
        <div className="ss-page" style={{ padding: 24 }}>
                {/* Header */}
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{unit?.title || 'Loading…'}</h1>
                            {unit?.description && <p style={{ margin: '4px 0 0', color: '#666' }}>{unit.description}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {unit && !unit.isPublished && (
                                <button onClick={handlePublishUnit} className="btn btn-primary">Publish Unit</button>
                            )}
                            {unit?.isPublished && <span style={{ padding: '6px 14px', background: '#dcfce7', color: '#166534', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Published</span>}
                        </div>
                    </div>
                </div>

                {/* Lessons */}
                <section style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Lessons</h2>
                        <button onClick={() => setShowNewLesson(true)} className="btn btn-primary">+ Add Lesson</button>
                    </div>

                    {showNewLesson && (
                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 16, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                autoFocus
                                style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
                                value={newLessonTitle}
                                onChange={e => setNewLessonTitle(e.target.value)}
                                placeholder="Lesson title…"
                                onKeyDown={e => e.key === 'Enter' && handleCreateLesson()}
                            />
                            <button onClick={handleCreateLesson} className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
                            <button onClick={() => setShowNewLesson(false)} className="btn btn-secondary">Cancel</button>
                        </div>
                    )}

                    {lessons.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e7eb' }}>
                            <p style={{ margin: 0, color: '#888' }}>No lessons yet. Add your first lesson above.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {lessons.map((lesson, idx) => (
                                <div key={lesson._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ width: 28, height: 28, background: '#eff6ff', color: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600 }}>{lesson.title}</p>
                                            {lesson.estimatedDuration && <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{lesson.estimatedDuration} min</p>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: lesson.isPublished ? '#dcfce7' : '#f3f4f6', color: lesson.isPublished ? '#166534' : '#6b7280', fontWeight: 600 }}>
                                            {lesson.isPublished ? 'Published' : 'Draft'}
                                        </span>
                                        <button onClick={() => navigate(`/portal/social-studies/lessons/${lesson._id}/edit`)} className="btn btn-primary btn-sm">Edit</button>
                                        <button onClick={() => navigate(`/portal/social-studies/assignments/new?lessonId=${lesson._id}&unitId=${unitId}`)} className="btn btn-secondary btn-sm">Assign</button>
                                        <button onClick={() => handleDeleteLesson(lesson)} className="btn btn-danger btn-sm">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Assignments */}
                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Assignments</h2>
                    </div>
                    {unitAssignments.length === 0 ? (
                        <p style={{ color: '#888' }}>No assignments created from this unit yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {unitAssignments.map(a => (
                                <div key={a._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: 600 }}>{a.title}</p>
                                        <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{a.assignmentType} · {a.questions?.length || 0} questions · {a.class?.name}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: a.status === 'published' ? '#dcfce7' : '#fef9c3', color: a.status === 'published' ? '#166534' : '#854d0e', fontWeight: 600 }}>
                                            {a.status}
                                        </span>
                                        <button onClick={() => navigate(`/portal/social-studies/assignments/${a._id}/results`)} className="btn btn-secondary btn-sm">Results</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
    );
}
