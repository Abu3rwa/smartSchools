import { Typography } from '@mui/material';
import { getGreeting } from '../utils/teacherDashboardPresentation';

const TeacherDashboardHeader = ({ firstName, isSm }) => {
    return (
        <header className="teacher-dashboard-header">
            <Typography variant={isSm ? 'h5' : 'h4'} sx={{ fontWeight: 700, mb: 0.5 }}>
                {getGreeting()}, {firstName}!
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Your teaching day at a glance.
            </Typography>
        </header>
    );
};

export default TeacherDashboardHeader;
