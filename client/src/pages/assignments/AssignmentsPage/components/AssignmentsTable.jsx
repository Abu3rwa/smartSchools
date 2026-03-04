import { HiOutlineClipboardList } from 'react-icons/hi';
import { formatAssignmentDueDate } from '../utils/assignmentPresentation';

const AssignmentsTable = ({
    loading,
    assignments,
    canCreateAssignments,
    onPublishAssignment,
    onOpenGradePanel,
    onEditAssignment,
    onDeleteAssignment
}) => {
    return (
        <div className="card assignments-list">
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlineClipboardList />
                    Assignments
                </h3>
            </div>

            {loading ? (
                <div className="loading-state">Loading assignments...</div>
            ) : assignments.length === 0 ? (
                <div className="empty-state">No assignments found for current filters.</div>
            ) : (
                <div className="table-container">
                    <table className="assignment-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Due</th>
                                <th>Max</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((assignment) => (
                                <tr key={assignment.id}>
                                    <td>{assignment.title}</td>
                                    <td>{assignment.assignmentType?.name || assignment.assignmentType?.key || '-'}</td>
                                    <td><span className={`status-badge ${assignment.status}`}>{assignment.status}</span></td>
                                    <td>{formatAssignmentDueDate(assignment.dueDate)}</td>
                                    <td>{assignment.maxMarks}</td>
                                    <td className="action-cell">
                                        {assignment.status === 'draft' && canCreateAssignments && (
                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => onPublishAssignment(assignment.id)}>
                                                Publish
                                            </button>
                                        )}
                                        {(assignment.status === 'published' || assignment.status === 'closed') && canCreateAssignments && (
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenGradePanel(assignment)}>
                                                Grade
                                            </button>
                                        )}
                                        {canCreateAssignments && (
                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditAssignment(assignment)}>
                                                Edit
                                            </button>
                                        )}
                                        {canCreateAssignments && (
                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDeleteAssignment(assignment)}>
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AssignmentsTable;
