import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
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
    if (!open || !selectedTeacher) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>Assign Classes to {getTeacherFullName(selectedTeacher)}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="assignments-container">
                            {assignments.map((assignment, index) => (
                                <div key={index} className="assignment-row">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Class *</label>
                                            <select
                                                value={assignment.classId}
                                                onChange={(event) => onAssignmentChange(index, 'classId', event.target.value)}
                                                required
                                            >
                                                <option value="">Select a class</option>
                                                {classes.map((classItem) => (
                                                    <option key={classItem._id} value={classItem._id}>
                                                        {classItem.name} ({classItem.academicYear})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Subject *</label>
                                            <select
                                                value={assignment.subjectId}
                                                onChange={(event) => onAssignmentChange(index, 'subjectId', event.target.value)}
                                                required
                                            >
                                                <option value="">Select a subject</option>
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
                                            Set as Class Teacher
                                        </label>
                                    </div>
                                    {assignments.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-danger"
                                            onClick={() => onRemoveAssignmentRow(index)}
                                        >
                                            <HiOutlineTrash size={14} /> Remove
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
                            <HiOutlinePlus size={16} /> Add Another Class
                        </button>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Assigning...' : 'Assign Classes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TeacherAssignmentsModal;
