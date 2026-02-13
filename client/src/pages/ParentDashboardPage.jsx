import { useSelector } from 'react-redux';
import { selectUser } from '../store/slices/authSlice';
import { HiOutlineUserGroup, HiOutlineMail, HiOutlinePhone } from 'react-icons/hi';
import './ParentDashboardPage.css';

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const ParentDashboardPage = () => {
    const user = useSelector(selectUser);
    const firstName = user?.firstName ?? 'Parent';

    return (
        <div className="parent-dashboard">
            <header className="parent-dashboard-header">
                <h1>{getGreeting()}, {firstName}!</h1>
                <p>Parent portal – view your child&apos;s progress and reports.</p>
            </header>

            <div className="parent-dashboard-card">
                <div className="parent-dashboard-icon">
                    <HiOutlineUserGroup size={32} />
                </div>
                <h2>Your child&apos;s reports</h2>
                <p className="parent-dashboard-message">
                    To see grades and reports for your child, your account must be linked to their student record.
                    Contact your school administrator to link your parent account.
                </p>
                <div className="parent-dashboard-contact">
                    <p>You can also receive reports by email when the school sends them.</p>
                    <span className="parent-dashboard-hint">
                        <HiOutlineMail size={18} /> Check the email associated with your account.
                    </span>
                    <span className="parent-dashboard-hint">
                        <HiOutlinePhone size={18} /> For linking and access questions, contact the school office.
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ParentDashboardPage;
