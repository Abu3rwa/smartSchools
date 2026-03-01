import { Link } from 'react-router-dom';
import { HiOutlineArrowRight } from 'react-icons/hi';

const QuickActionsCard = ({ actions }) => {
    return (
        <div className="card quick-actions-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="quick-actions-grid">
                {actions.map((action, index) => (
                    <Link to={action.path} className="quick-action" key={index}>
                        <action.icon size={22} />
                        <span>{action.label}</span>
                        <HiOutlineArrowRight className="action-arrow" size={18} />
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default QuickActionsCard;
