import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { getTeacherFullName } from '../utils/teacherPresentation';

const TeacherAssignmentsModal = ({
    open,
    selectedTeacher,
    assignments,
    classes,
    subjects,
    submitting,
    onClose,
    onSubmit,
    onAddAssignmentRow,
    onRemoveAssignmentRow,
    onAssignmentChange
}) => {
    const { t } = useTranslation(['teachers']);
    if (!open || !selectedTeacher) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t('teachers:assignments.title', { name: getTeacherFullName(selectedTeacher) })}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="assignments-container">
                            {assignments.map((assignment, index) => (
                                <div key={index} className="assignment-row">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>{t('teachers:assignments.class')}</label>
                                            <select
                                                value={assignment.classId}
                                                onChange={(event) => onAssignmentChange(index, 'classId', event.target.value)}
                                                required
                                            >
                                                <option value="">{t('teachers:assignments.selectClass')}</option>
                                                {classes.map((classItem) => (
                                                    <option key={classItem._id} value={classItem._id}>
                                                        {classItem.name} ({classItem.academicYear})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>{t('teachers:assignments.subject')}</label>
                                            <select
                                                value={assignment.subjectId}
                                                onChange={(event) => onAssignmentChange(index, 'subjectId', event.target.value)}
                                                required
                                            >
                                                <option value="">{t('teachers:assignments.selectSubject')}</option>
                                                {subjects.map((subject) => (
                                                    <option key={subject._id} value={subject._id}>
                                                        {subject.name} ({subject.code})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={assignment.isClassTeacher}
                                                onChange={(event) => onAssignmentChange(index, 'isClassTeacher', event.target.checked)}
                                            />
                                            {t('teachers:assignments.setAsClassTeacher')}
                                        </label>
                                    </div>
                                    {assignments.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-danger"
                                            onClick={() => onRemoveAssignmentRow(index)}
                                        >
                                            <HiOutlineTrash size={14} /> {t('common:actions.remove')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onAddAssignmentRow}
                            style={{ marginTop: '1rem' }}
                        >
                            <HiOutlinePlus size={16} /> {t('teachers:assignments.addAnotherClass')}
                        </button>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('common:actions.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? t('teachers:actions.assigning') : t('teachers:actions.assignClasses')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TeacherAssignmentsModal;
