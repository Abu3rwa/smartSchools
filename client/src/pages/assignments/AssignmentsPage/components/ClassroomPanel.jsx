import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ClassroomPanel = ({ classroom, selectedClass, selectedSubject }) => {
    const { t } = useTranslation(['assignments']);
    const [changing, setChanging] = useState(false);
    const [courseId, setCourseId] = useState('');

    if (!classroom?.canUse) return null;

    const { connection, mapping, courses, coursesLoading, busy } = classroom;
    const hasSelection = Boolean(selectedClass && selectedSubject);
    const showPicker = hasSelection && (!mapping || changing);

    const startChange = async () => {
        setChanging(true);
        setCourseId('');
        if (courses.length === 0) await classroom.loadCourses();
    };

    const handleSave = async () => {
        const saved = await classroom.saveMapping(courseId);
        if (saved) {
            setChanging(false);
            setCourseId('');
        }
    };

    return (
        <div className="card classroom-panel">
            <div className="card-header">
                <h3 className="card-title">{t('assignments:classroom.panel.title')}</h3>
            </div>

            {!connection.connected ? (
                <div className="classroom-panel__body">
                    <p className="text-muted">{t('assignments:classroom.panel.notConnected')}</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={classroom.connect} disabled={busy}>
                        {t('assignments:classroom.panel.connect')}
                    </button>
                </div>
            ) : (
                <div className="classroom-panel__body">
                    <div className="classroom-panel__row">
                        <span>
                            {t('assignments:classroom.panel.connectedAs', { email: connection.email || '' })}
                        </span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={classroom.disconnect} disabled={busy}>
                            {t('assignments:classroom.panel.disconnect')}
                        </button>
                    </div>

                    {!hasSelection && (
                        <p className="text-muted">{t('assignments:classroom.panel.selectClassSubject')}</p>
                    )}

                    {hasSelection && mapping && !changing && (
                        <div className="classroom-panel__row">
                            <span>
                                {t('assignments:classroom.panel.mappedTo', {
                                    course: [mapping.courseName, mapping.courseSection].filter(Boolean).join(' · ')
                                })}
                            </span>
                            <span className="classroom-panel__actions">
                                <button type="button" className="btn btn-outline btn-sm" onClick={startChange} disabled={busy}>
                                    {t('assignments:classroom.panel.change')}
                                </button>
                                <button type="button" className="btn btn-outline btn-sm" onClick={classroom.removeMapping} disabled={busy}>
                                    {t('assignments:classroom.panel.remove')}
                                </button>
                            </span>
                        </div>
                    )}

                    {showPicker && (
                        <div className="classroom-panel__row">
                            <label className="classroom-panel__picker">
                                <span>{t('assignments:classroom.panel.chooseCourse')}</span>
                                <select
                                    value={courseId}
                                    onFocus={() => { if (courses.length === 0 && !coursesLoading) classroom.loadCourses(); }}
                                    onChange={(event) => setCourseId(event.target.value)}
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
                            <span className="classroom-panel__actions">
                                <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy || !courseId}>
                                    {t('assignments:classroom.panel.saveMapping')}
                                </button>
                                {changing && (
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setChanging(false)} disabled={busy}>
                                        {t('assignments:classroom.panel.cancel')}
                                    </button>
                                )}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClassroomPanel;
