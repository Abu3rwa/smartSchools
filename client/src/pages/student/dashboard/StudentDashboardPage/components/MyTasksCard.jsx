import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';

const statusLabel = (value) => {
    return String(value || 'assigned')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const formatDueDate = (value) => {
    if (!value) return 'Any time';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Any time';

    return parsed.toLocaleDateString();
};

const resolveTaskTitle = (task = {}) => {
    return task.title || task.objectiveName || 'Task';
};

const MyTasksCard = ({ tasks = [], loading = false }) => {
    return (
        <section className="student-card tasks-card">
            <h2><HiOutlineClipboardList className="card-icon" /> My Tasks</h2>
            <div className="card-action">
                <Link to="/portal/academic-excellence" className="link-sm">Open all</Link>
            </div>

            {loading ? (
                <p className="empty-text">Loading tasks...</p>
            ) : tasks.length === 0 ? (
                <p className="empty-text">No tasks assigned right now.</p>
            ) : (
                <ul className="tasks-list">
                    {tasks.map((task) => (
                        <li key={task._id} className="tasks-item">
                            <div className="tasks-item-main">
                                <span className="tasks-title">{resolveTaskTitle(task)}</span>
                                <span className="tasks-meta">Due: {formatDueDate(task.dueDate)}</span>
                            </div>
                            <span className={`tasks-status status-${task.status || 'assigned'}`}>
                                {statusLabel(task.status)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default MyTasksCard;