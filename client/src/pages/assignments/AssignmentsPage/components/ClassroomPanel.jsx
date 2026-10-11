import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const getSubjectId = (subject) => String(subject?._id || subject?.id || '');

const ClassroomPanel = ({ classroom, selectedClass, availableSubjects = [] }) => {
    const { t } = useTranslation(['assignments']);
    const [draftState, setDraftState] = useState({ classId: '', values: {} });
    const draftCourses = draftState.classId === selectedClass ? draftState.values : {};

    const subjects = useMemo(() => {
        const seen = new Set();
        return (Array.isArray(availableSubjects) ? availableSubjects : [])
            .filter((subject) => {
                const id = getSubjectId(subject);
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
    }, [availableSubjects]);

    if (!classroom?.canViewPanel) return null;

    const {
        enabled,
        statusLoading,
        statusError,
        refreshStatus,
        connection,
        mappingsBySubject,
        courses,
        coursesLoading,
        busy
    } = classroom;

    const getCourseValue = (subjectId) => (
        Object.prototype.hasOwnProperty.call(draftCourses, subjectId)
            ? draftCourses[subjectId]
            : mappingsBySubject[subjectId]?.courseId || ''
    );

    const changedMappings = subjects
        .map((subject) => {
            const subjectId = getSubjectId(subject);
            const courseId = getCourseValue(subjectId);
            return {
                subjectId,
                courseId,
                existingCourseId: mappingsBySubject[subjectId]?.courseId || ''
            };
        })
        .filter(({ courseId, existingCourseId }) => courseId && courseId !== existingCourseId);

    const saveAll = async () => {
        const saved = await classroom.saveMappings(changedMappings);
        if (saved) setDraftState({ classId: selectedClass, values: {} });
    };

    const removeMapping = async (subjectId) => {
        await classroom.removeMapping(subjectId);
        setDraftState((state) => {
            const current = state.classId === selectedClass ? state.values : {};
            const next = { ...current };
            delete next[subjectId];
            return { classId: selectedClass, values: next };
        });
    };

    return (
        <div className="card classroom-panel">
            <div className="card-header">
                <h3 className="card-title">{t('assignments:classroom.panel.title')}</h3>
            </div>

            {statusLoading ? (
                <div className="classroom-panel__body">
                    <p className="text-muted">{t('assignments:classroom.panel.checking')}</p>
                </div>
            ) : statusError ? (
                <div className="classroom-panel__body" role="status">
                    <p className="text-muted">
                        {statusError.networkError
                            ? t('assignments:classroom.panel.statusNetworkError')
                            : t('assignments:classroom.panel.statusHttpError', { status: statusError.httpStatus })}
                    </p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={refreshStatus}>
                        {t('assignments:classroom.panel.retryStatus')}
                    </button>
                </div>
            ) : !enabled ? (
                <div className="classroom-panel__body" role="status">
                    <p className="text-muted">{t('assignments:classroom.panel.disabled')}</p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={refreshStatus}>
                        {t('assignments:classroom.panel.retryStatus')}
                    </button>
                </div>
            ) : !classroom.isTeacher ? (
                <div className="classroom-panel__body">
                    <p className="text-muted">{t('assignments:classroom.panel.teacherOnly')}</p>
                </div>
            ) : !connection.connected ? (
                <div className="classroom-panel__body">
                    <p className="text-muted">{t('assignments:classroom.panel.notConnected')}</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={classroom.connect} disabled={busy}>
                        {t('assignments:classroom.panel.connect')}
                    </button>
                </div>
            ) : (
                <div className="classroom-panel__body">
                    <div className="classroom-panel__row">
                        <span>{t('assignments:classroom.panel.connectedAs', { email: connection.email || '' })}</span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={classroom.disconnect} disabled={busy}>
                            {t('assignments:classroom.panel.disconnect')}
                        </button>
                    </div>

                    {!selectedClass ? (
                        <p className="text-muted">{t('assignments:classroom.panel.selectClass')}</p>
                    ) : subjects.length === 0 ? (
                        <p className="text-muted">{t('assignments:classroom.panel.noSubjects')}</p>
                    ) : (
                        <>
                            <p className="text-muted">{t('assignments:classroom.panel.mapSubjects')}</p>
                            {subjects.map((subject) => {
                                const subjectId = getSubjectId(subject);
                                const currentMapping = mappingsBySubject[subjectId];
                                return (
                                    <div className="classroom-panel__row" key={subjectId}>
                                        <label className="classroom-panel__picker">
                                            <span>{subject.name || t('assignments:classroom.panel.subject')}</span>
                                            <select
                                                value={getCourseValue(subjectId)}
                                                onFocus={() => {
                                                    if (courses.length === 0 && !coursesLoading) classroom.loadCourses();
                                                }}
                                                onChange={(event) => setDraftState((state) => ({
                                                    classId: selectedClass,
                                                    values: {
                                                        ...(state.classId === selectedClass ? state.values : {}),
                                                        [subjectId]: event.target.value
                                                    }
                                                }))}
                                                disabled={busy || coursesLoading}
                                            >
                                                <option value="">
                                                    {coursesLoading
                                                        ? t('assignments:classroom.panel.loadingCourses')
                                                        : t('assignments:classroom.panel.selectCourse')}
                                                </option>
                                                {courses.map((course) => (
                                                    <option key={course.id} value={course.id}>
                                                        {[course.name, course.section].filter(Boolean).join(' · ')}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {currentMapping && (
                                            <span className="text-muted">
                                                {t('assignments:classroom.panel.currentMapping', {
                                                    course: [currentMapping.courseName, currentMapping.courseSection]
                                                        .filter(Boolean)
                                                        .join(' · ')
                                                })}
                                            </span>
                                        )}
                                        {currentMapping && (
                                            <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                onClick={() => removeMapping(subjectId)}
                                                disabled={busy}
                                            >
                                                {t('assignments:classroom.panel.remove')}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                            <div className="classroom-panel__row">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={saveAll}
                                    disabled={busy || changedMappings.length === 0}
                                >
                                    {t('assignments:classroom.panel.saveAllMappings')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClassroomPanel;
