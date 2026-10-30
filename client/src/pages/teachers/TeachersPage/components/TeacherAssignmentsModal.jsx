import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import { getTeacherFullName, sortAssignments } from '../utils/teacherPresentation';

const TeacherAssignmentsModal = ({
    open,
    selectedTeacher,
    classes,
    subjects,
    submitting,
    onClose,
    onAddAssignment,
    onRemoveExistingAssignment
}) => {
    const { t } = useTranslation(['teachers', 'common']);
    const currentYear = useSelector(selectCurrentAcademicYear);
    const [classId, setClassId] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const [isClassTeacher, setIsClassTeacher] = useState(false);

    const groups = useMemo(() => {
        const sorted = sortAssignments(selectedTeacher?.assignedClasses);
        const byYear = new Map();
        sorted.forEach((assignment) => {
            const year = assignment.class?.academicYear || '';
            if (!byYear.has(year)) byYear.set(year, []);
            byYear.get(year).push(assignment);
        });
        return [...byYear.entries()];
    }, [selectedTeacher]);

    if (!open || !selectedTeacher) return null;

    const total = selectedTeacher.assignedClasses?.length || 0;

    const handleAdd = async () => {
        if (!classId || !subjectId) {
            toast.error(t('teachers:toast.selectClassAndSubject'));
            return;
        }
        const ok = await onAddAssignment({ classId, subjectId, isClassTeacher });
        if (ok) {
            setClassId('');
            setSubjectId('');
            setIsClassTeacher(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal assign-modal" onClick={(event) => event.stopPropagation()}>
                <div className="assign-head">
                    <div>
                        <h3>{t('teachers:assignments.title', { name: getTeacherFullName(selectedTeacher) })}</h3>
                        <p className="assign-who">
                            {selectedTeacher.employeeId}
                            {selectedTeacher.department?.name ? ` · ${selectedTeacher.department.name}` : ''}
                        </p>
                    </div>
                    <button type="button" className="assign-close" onClick={onClose} aria-label={t('common:actions.close')}>
                        <HiOutlineX size={16} />
                    </button>
                </div>

                <div className="assign-body">
                    <section className="assign-list">
                        <div className="assign-panel-head">
                            <h4>{t('teachers:assignments.currentTitle')}</h4>
                            <span className="assign-count">{total}</span>
                        </div>

                        {groups.length === 0 && (
                            <p className="assign-empty">{t('teachers:assignments.noneAssigned')}</p>
                        )}

                        {groups.map(([year, rows]) => (
                            <div key={year || 'none'} className={`assign-year${year === currentYear ? '' : ' is-past'}`}>
                                <div className="assign-year-head">
                                    <span className="assign-year-label">{year || t('teachers:assignments.unknownClass')}</span>
                                    <span className={`assign-tag${year === currentYear ? ' is-now' : ''}`}>
                                        {year === currentYear
                                            ? t('teachers:assignments.currentYear')
                                            : t('teachers:assignments.previousYear')}
                                    </span>
                                </div>
                                <div className="assign-rows">
                                    {rows.map((assignment) => (
                                        <div key={assignment._id} className="assign-row">
                                            <span className="assign-row-class">
                                                {assignment.class?.name || t('teachers:assignments.unknownClass')}
                                            </span>
                                            <span className="assign-row-subject">
                                                <span>{assignment.subject?.name || t('teachers:assignments.unknownSubject')}</span>
                                                {assignment.subject?.code && (
                                                    <span className="assign-code">{assignment.subject.code}</span>
                                                )}
                                                {assignment.isClassTeacher && (
                                                    <span className="assign-homeroom">{t('teachers:assignments.homeroomBadge')}</span>
                                                )}
                                            </span>
                                            <button
                                                type="button"
                                                className="assign-remove"
                                                onClick={() => onRemoveExistingAssignment(assignment._id)}
                                                disabled={submitting}
                                                aria-label={t('common:actions.remove')}
                                            >
                                                <HiOutlineTrash size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>

                    <section className="assign-form">
                        <div className="assign-form-card">
                            <h4>{t('teachers:assignments.addTitle')}</h4>
                            <p className="assign-form-sub">{t('teachers:assignments.addSub')}</p>

                            <div className="assign-field">
                                <label htmlFor="assign-class">{t('teachers:assignments.classLabel')}</label>
                                <select id="assign-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                                    <option value="">{t('teachers:assignments.selectClass')}</option>
                                    {classes.map((classItem) => (
                                        <option key={classItem._id} value={classItem._id}>
                                            {classItem.name} · {classItem.academicYear}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="assign-field">
                                <label htmlFor="assign-subject">{t('teachers:assignments.subjectLabel')}</label>
                                <select id="assign-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                                    <option value="">{t('teachers:assignments.selectSubject')}</option>
                                    {subjects.map((subject) => (
                                        <option key={subject._id} value={subject._id}>
                                            {subject.name} · {subject.code}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="button"
                                className={`assign-toggle${isClassTeacher ? ' is-on' : ''}`}
                                role="switch"
                                aria-checked={isClassTeacher}
                                onClick={() => setIsClassTeacher((v) => !v)}
                            >
                                <span className="assign-toggle-box" aria-hidden="true" />
                                <span className="assign-toggle-text">
                                    <b>{t('teachers:assignments.homeroomToggle')}</b>
                                    <span>{t('teachers:assignments.homeroomHint')}</span>
                                </span>
                            </button>

                            <button type="button" className="assign-add" onClick={handleAdd} disabled={submitting}>
                                <HiOutlinePlus size={15} />
                                {t('teachers:assignments.addButton')}
                            </button>
                            <p className="assign-hint">{t('teachers:assignments.addHint')}</p>
                        </div>
                    </section>
                </div>

                <div className="assign-foot">
                    <span className="assign-sum">
                        <b>{total}</b> {t('teachers:assignments.summaryAssignments')} · {groups.length} {t('teachers:assignments.summaryYears')}
                    </span>
                    <span className="assign-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('common:actions.cancel')}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={onClose}>
                            {t('common:actions.done')}
                        </button>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TeacherAssignmentsModal;