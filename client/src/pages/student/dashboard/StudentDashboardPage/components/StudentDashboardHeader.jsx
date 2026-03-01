import { getGreeting } from '../utils/studentDashboardPresentation';

const StudentDashboardHeader = ({ firstName }) => {
    return (
        <header className="student-dashboard-header">
            <h1>{getGreeting()}, {firstName}!</h1>
            <p>Here&apos;s your overview for today.</p>
        </header>
    );
};

export default StudentDashboardHeader;
