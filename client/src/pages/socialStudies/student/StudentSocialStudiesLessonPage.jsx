import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DOMPurify from 'isomorphic-dompurify';
import {
    fetchLessonForStudent,
    selectActiveLesson, selectActiveLessonLoading, clearActiveLesson,
} from '../../../store/slices/socialStudiesSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

const buildLessonSrcDoc = (rawContent) => {
    const raw = String(rawContent || '').trim();
    if (!raw) return '';

    const allowTags = ['iframe'];
    const allowAttrs = ['allowfullscreen', 'frameborder', 'src', 'title', 'style'];
    const hasFullDocument = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(raw);

    if (hasFullDocument) {
        return DOMPurify.sanitize(raw, {
            ADD_TAGS: allowTags,
            ADD_ATTR: allowAttrs,
            FORBID_TAGS: ['script'],
        });
    }

   




    
    const safeFragment = DOMPurify.sanitize(raw, {
        ADD_TAGS: allowTags,
        ADD_ATTR: allowAttrs,
        FORBID_TAGS: ['script'],
    });

    return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;">${safeFragment}</body></html>`;
};

export default function StudentSocialStudiesLessonPage() {
    const { lessonId } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const lesson = useSelector(selectActiveLesson);
    const loading = useSelector(selectActiveLessonLoading);

    useEffect(() => {
        dispatch(fetchLessonForStudent(lessonId));
        return () => dispatch(clearActiveLesson());
    }, [dispatch, lessonId]);

    if (loading) return <div style={{ padding: 32 }}>Loading lesson…</div>;
    if (!lesson) return <div style={{ padding: 32, color: '#888' }}>Lesson not available.</div>;

    const lessonSrcDoc = buildLessonSrcDoc(lesson.content);

    return (
        <FeatureGate feature="socialStudies">
            <div className="ss-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
                <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: 16, padding: '4px 0' }}>← Back</button>

                {/* Lesson header */}
                <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid var(--border-color,#e5e7eb)' }}>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary,#111827)' }}>{lesson.title}</h1>
                    {lesson.estimatedDuration && (
                        <p style={{ margin: '8px 0 0', color: 'var(--text-secondary,#6b7280)', fontSize: 14 }}>
                            📖 Estimated reading time: {lesson.estimatedDuration} min
                        </p>
                    )}
                </div>

                {/* Lesson content — rendered HTML */}
                {lessonSrcDoc ? (
                    <iframe
                        title={`${lesson.title || 'Social Studies Lesson'} content`}
                        srcDoc={lessonSrcDoc}
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        style={{
                            width: '100%',
                            minHeight: '70vh',
                            border: '1.5px solid var(--border-color,#e5e7eb)',
                            borderRadius: 12,
                            background: '#fff',
                        }}
                    />
                ) : (
                    <div className="ss-empty">
                        <p>This lesson has no content yet.</p>
                    </div>
                )}

                <div style={{ marginTop: 36, paddingTop: 20, borderTop: '2px solid var(--border-color,#e5e7eb)' }}>
                    <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Done Reading</button>
                </div>
            </div>
        </FeatureGate>
    );
}
