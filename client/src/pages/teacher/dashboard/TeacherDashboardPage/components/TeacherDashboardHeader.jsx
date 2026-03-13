import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getGreeting } from '../utils/teacherDashboardPresentation';

const TeacherDashboardHeader = ({ firstName, isSm }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <header className="teacher-dashboard-header">
            <Typography variant={isSm ? 'h5' : 'h4'} sx={{ fontWeight: 700, mb: 0.5 }}>
                {getGreeting(t)}, {firstName}!
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('dashboard:teacherDashboard.header.subtitle')}
            </Typography>
        </header>
    );
};

export default TeacherDashboardHeader;
