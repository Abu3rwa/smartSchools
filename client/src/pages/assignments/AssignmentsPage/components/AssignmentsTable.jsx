import { HiOutlineClipboardList } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { formatAssignmentDueDate } from '../utils/assignmentPresentation';

const AssignmentsTable = ({
    loading,
    assignments,
    canCreateAssignments,
    onPublishAssignment,
    onOpenGradePanel,
    onEditAssignment,
    onDeleteAssignment,
    onSendReminder,
    sendingReminder,
    publishingAssignment
}) => {
    const { t } = useTranslation(['assignments']);

    return (
        <div className="card assignments-list">
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlineClipboardList />
                    {t('assignments:table.title')}
                </h3>
            </div>

            {loading ? (
                <div className="loading-state">{t('assignments:table.loading')}</div>
            ) : assignments.length === 0 ? (
                <div className="empty-state">{t('assignments:table.empty')}</div>
            ) : (
                <div className="table-container">
                    <table className="assignment-table">
                        <thead>
                            <tr>
                                <th>{t('assignments:table.columns.title')}</th>
                                <th>{t('assignments:table.columns.type')}</th>
                                <th>{t('assignments:table.columns.status')}</th>
                                <th>{t('assignments:table.columns.due')}</th>
                                <th>{t('assignments:table.columns.max')}</th>
                                <th>{t('assignments:table.columns.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assignments.map((assignment) => (
                                <tr key={assignment.id}>
                                    <td>{assignment.title}</td>
                                    <td>{assignment.assignmentType?.name || assignment.assignmentType?.key || t('assignments:common.empty')}</td>
                                    <td>
                                        <span className={`status-badge ${assignment.status}`}>
                                            {t(`assignments:status.${assignment.status}`, { defaultValue: assignment.status })}
                                        </span>
                                    </td>
                                    <td>{formatAssignmentDueDate(assignment.dueDate)}</td>
                                    <td>{assignment.maxMarks}</td>
                                    <td className="action-cell">
                                        {assignment.status === 'draft' && canCreateAssignments && (
                                            <div className="reminder-dropdown" style={{ display: 'inline-block', position: 'relative' }}>
                                                <select
                                                    className="btn btn-outline btn-sm"
                                                    disabled={publishingAssignment === assignment.id}
                                                    value=""
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            onPublishAssignment(assignment.id, e.target.value);
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                >
                                                    <option value="" disabled>
                                                        {publishingAssignment === assignment.id
                                                            ? t('assignments:actions.publishing')
                                                            : t('assignments:actions.publish')}
                                                    </option>
                                                    <option value="both">{t('assignments:actions.publishBoth')}</option>
                                                    <option value="students">{t('assignments:actions.publishStudents')}</option>
                                                    <option value="parents">{t('assignments:actions.publishParents')}</option>
                                                </select>
                                            </div>
                                        )}
                                        {(assignment.status === 'published' || assignment.status === 'closed') && canCreateAssignments && (
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenGradePanel(assignment)}>
                                                {t('assignments:actions.grade')}
                                            </button>
                                        )}
                                        {assignment.status === 'published' && canCreateAssignments && onSendReminder && (
                                            <div className="reminder-dropdown" style={{ display: 'inline-block', position: 'relative' }}>
                                                <select
                                                    className="btn btn-outline btn-sm"
                                                    disabled={sendingReminder === assignment.id}
                                                    value=""
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            onSendReminder(assignment.id, e.target.value);
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                >
                                                    <option value="" disabled>
                                                        {sendingReminder === assignment.id ? t('assignments:actions.sending', { defaultValue: 'Sending…' }) : t('assignments:actions.remind', { defaultValue: 'Send Reminder' })}
                                                    </option>
                                                    <option value="both">{t('assignments:actions.remindBoth', { defaultValue: 'Students & Parents' })}</option>
                                                    <option value="students">{t('assignments:actions.remindStudents', { defaultValue: 'Students Only' })}</option>
                                                    <option value="parents">{t('assignments:actions.remindParents', { defaultValue: 'Parents Only' })}</option>
                                                </select>
                                            </div>
                                        )}
                                        {canCreateAssignments && (
                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditAssignment(assignment)}>
                                                {t('assignments:actions.edit')}
                                            </button>
                                        )}
                                        {canCreateAssignments && (
                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDeleteAssignment(assignment)}>
                                                {t('assignments:actions.delete')}
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
