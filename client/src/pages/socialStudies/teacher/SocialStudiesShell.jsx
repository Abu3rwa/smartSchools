import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    fetchUnits, fetchLessons, createUnit,
    selectUnits, selectUnitsLoading, selectLessonsByUnit,
} from '../../../store/slices/socialStudiesSlice';import { selectCurrentAcademicYear, selectSelectedSemester } from '../../../store/slices/uiSlice';
import FeatureGate from '../../../components/FeatureGate';
import { selectUser } from '../../../store/slices/authSlice';
import '../SocialStudies.css';

// ── Unit tree item ────────────────────────────────────────────────────────
function UnitTreeItem({ unit, isExpanded, isActive, onToggle, onAssign }) {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const lessons = useSelector(selectLessonsByUnit(unit._id));
    const params = useParams(); 

      
    useEffect(() => {
        if (isExpanded && lessons.length === 0) {
            dispatch(fetchLessons(unit._id));
        }
    }, [isExpanded, unit._id, dispatch]);

    const activeLessonId = params.lessonId || '';

    return (
        <div>
            {/* Unit row */}
            <button
                onClick={() => onToggle(unit._id)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 14px', border: 'none', background: isExpanded ? 'var(--bg-tertiary,#f0f2f5)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', borderRadius: 8,
                    color: 'var(--text-primary,#0f172a)', fontFamily: 'inherit',
                    borderLeft: isExpanded ? '3px solid #2563eb' : '3px solid transparent',
                    transition: 'all 0.12s',
                }}
            >
                <span style={{ fontSize: 13, transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', color: '#6b7280', flexShrink: 0 }}>▶</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {unit.title}
                </span>
                {unit.gradeLevel != null && (
                    <span style={{ fontSize: 10, padding: '1px 5px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 99, flexShrink: 0, fontWeight: 700 }}>G{unit.gradeLevel}</span>
                )}
                {!unit.isPublished && (
                    <span style={{ fontSize: 10, padding: '1px 5px', background: '#fef9c3', color: '#854d0e', borderRadius: 99, flexShrink: 0, fontWeight: 700 }}>Draft</span>
                )}
            </button>

            {/* Lessons list */}
            {isExpanded && (
                <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
                    {lessons.length === 0 ? (
                        <p style={{ fontSize: 12, color: '#9ca3af', padding: '4px 14px', margin: 0 }}>No lessons yet</p>
                    ) : (
                        lessons.map(lesson => {
                            const isLessonActive = activeLessonId === lesson._id;
                            return (
                                <button
                                    key={lesson._id}
                                    onClick={() => navigate(`/portal/social-studies/lessons/${lesson._id}/edit`)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '7px 10px 7px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                                        borderRadius: 7, fontFamily: 'inherit',
                                        background: isLessonActive ? '#eff6ff' : 'transparent',
                                        color: isLessonActive ? '#1d4ed8' : 'var(--text-secondary,#374151)',
                                        fontWeight: isLessonActive ? 700 : 400,
                                        borderLeft: `2px solid ${isLessonActive ? '#3b82f6' : 'transparent'}`,
                                        transition: 'all 0.1s',
                                    }}
                                >
                                    <span style={{ fontSize: 11, flexShrink: 0, color: lesson.isPublished ? '#16a34a' : '#9ca3af' }}>
                                        {lesson.isPublished ? '●' : '○'}
                                    </span>
                                    <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {lesson.title}
                                    </span>
                                </button>
                            );
                        })
                    )}
                    {/* Assign from unit shortcut */}
                    <button
                        onClick={() => onAssign(unit._id)}
                        style={{ width: '100%', padding: '5px 10px 5px 26px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#2563eb', fontFamily: 'inherit', borderRadius: 6 }}
                    >
                        + Assign from unit
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Shell ─────────────────────────────────────────────────────────────────
export default function SocialStudiesShell() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const academicYear = useSelector(selectCurrentAcademicYear);
    const semester = useSelector(selectSelectedSemester);
    const units = useSelector(selectUnits);
    const loading = useSelector(selectUnitsLoading);
    const user = useSelector(selectUser);
    const isTeacher = user?.role === 'teacher';

    const [expanded, setExpanded] = useState({});    // { unitId: true/false }
    const [showNewUnit, setShowNewUnit] = useState(false);
    const [newUnitTitle, setNewUnitTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        dispatch(fetchUnits({ academicYear, semester }));
    }, [dispatch, academicYear, semester]);

    // Auto-expand unit whose lesson is currently open
    const params = useParams();
    useEffect(() => {
        if (params.lessonId && units.length > 0) {
            // We don't have lessonId→unitId mapping here directly,
            // but we can expand the first unit that has lessons loaded matching this lesson
            // This is best-effort; the user can also toggle manually
        }
    }, [params.lessonId, units]);

    const toggle = (unitId) => {
        setExpanded(prev => ({ ...prev, [unitId]: !prev[unitId] }));
    };

    const handleCreateUnit = async () => {
        if (!newUnitTitle.trim()) return;
        setCreating(true);
        try {
            const result = await dispatch(createUnit({ title: newUnitTitle.trim(), academicYear })).unwrap();
            setNewUnitTitle('');
            setShowNewUnit(false);
            setExpanded(prev => ({ ...prev, [result._id]: true }));
            toast.success('Unit created');
        } catch (err) {
            toast.error(err || 'Failed to create unit');
        } finally {
            setCreating(false);
        }
    };

    const isCurriculumRoot = location.pathname === '/portal/social-studies' || location.pathname === '/portal/social-studies/';

    return (
        <FeatureGate feature="socialStudies">
            <div className="ss-page" style={{ display: 'flex', alignItems: 'flex-start', minHeight: '60vh' }}>

                {/* ── Sidebar ── */}
                <aside style={{
                    width: sidebarCollapsed ? 44 : 264,
                    flexShrink: 0,
                    borderRight: '1.5px solid var(--border-color,#e5e7eb)',
                    background: 'var(--bg-card,#fff)',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'width 0.2s',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: 'var(--header-height, 70px)',
                    maxHeight: 'calc(100vh - var(--header-height, 70px))',
                    overflowY: 'auto',
                }}>
                    {/* Sidebar header */}
                    <div style={{ padding: sidebarCollapsed ? '12px 6px' : '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color,#e5e7eb)', flexShrink: 0 }}>
                        {!sidebarCollapsed && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary,#6b7280)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Units</span>
                        )}                        <button
                            onClick={() => setSidebarCollapsed(p => !p)}
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16, padding: 2, lineHeight: 1, marginLeft: sidebarCollapsed ? 'auto' : 0 }}
                        >
                            {sidebarCollapsed ? '→' : '←'}
                        </button>
                    </div>

                    {!sidebarCollapsed && (
                        <>
                            {/* Scrollable unit list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
                                {/* Overview link */}
                                <button
                                    onClick={() => navigate('/portal/social-studies')}
                                    style={{
                                        width: '100%', padding: '8px 14px', border: 'none', borderRadius: 8, background: isCurriculumRoot ? '#eff6ff' : 'transparent',
                                        color: isCurriculumRoot ? '#1d4ed8' : 'var(--text-secondary,#374151)', fontWeight: isCurriculumRoot ? 700 : 400,
                                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13,
                                        borderLeft: `3px solid ${isCurriculumRoot ? '#3b82f6' : 'transparent'}`,
                                        marginBottom: 4,
                                    }}
                                >
                                    📚 All Units
                                </button>
                                {isTeacher && (
                                    <p style={{ fontSize: 11, color: '#9ca3af', padding: '0 14px 6px', margin: 0, lineHeight: 1.4 }}>
                                        Showing units for your grade(s)
                                    </p>
                                )}

                                {loading ? (
                                    <p style={{ fontSize: 12, color: '#9ca3af', padding: '4px 14px' }}>Loading…</p>
                                ) : units.length === 0 ? (
                                    <p style={{ fontSize: 12, color: '#9ca3af', padding: '4px 14px' }}>No units yet</p>
                                ) : (
                                    units.map(unit => (
                                        <UnitTreeItem
                                            key={unit._id}
                                            unit={unit}
                                            isExpanded={!!expanded[unit._id]}
                                            isActive={location.pathname.includes(unit._id)}
                                            onToggle={toggle}
                                            onAssign={(unitId) => navigate(`/portal/social-studies/assignments/new?unitId=${unitId}`)}
                                        />
                                    ))
                                )}
                            </div>

                            {/* + New Unit */}
                            <div style={{ padding: '8px 8px 10px', borderTop: '1px solid var(--border-color,#e5e7eb)', flexShrink: 0 }}>
                                {showNewUnit ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <input
                                            autoFocus
                                            value={newUnitTitle}
                                            onChange={e => setNewUnitTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleCreateUnit(); if (e.key === 'Escape') setShowNewUnit(false); }}
                                            placeholder="Unit title…"
                                            style={{ flex: 1, padding: '6px 8px', border: '1.5px solid #2563eb', borderRadius: 7, fontSize: 13, outline: 'none' }}
                                        />
                                        <button onClick={handleCreateUnit} disabled={creating} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 13 }}>
                                            {creating ? '…' : '✓'}
                                        </button>
                                        <button onClick={() => setShowNewUnit(false)} className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: 13 }}>✕</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowNewUnit(true)} className="btn btn-primary" style={{ width: '100%', fontSize: 13 }}>
                                        + New Unit
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </aside>

                {/* ── Main content ── */}
                <main style={{ flex: 1, minWidth: 0 }}>
                    <Outlet />
                </main>
            </div>
        </FeatureGate>
    );
}
