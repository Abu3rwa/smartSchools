import { Link } from 'react-router-dom';

const ClassesOverviewCard = ({ classes }) => {
    return (
        <div className="card classes-overview-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">Classes Overview</h3>
                <Link to="/portal/classes" className="btn btn-ghost btn-sm">View All</Link>
            </div>
            <div className="classes-list">
                {classes.slice(0, 4).map((cls, index) => (
                    <Link
                        key={cls._id}
                        to={`/portal/classes/${cls._id}`}
                        className="class-item animate-fadeIn"
                        style={{ animationDelay: `${index * 0.05}s` }}
                    >
                        <div className="class-info">
                            <span className="class-name">{cls.name}</span>
                            <span className="class-year">{cls.academicYear}</span>
                        </div>
                        <span className="class-count">{cls.studentCount || 0} students</span>
                    </Link>
                ))}
                {classes.length === 0 && (
                    <p className="empty-message">No classes found. Create a class to get started.</p>
                )}
            </div>
        </div>
    );
};

export default ClassesOverviewCard;
