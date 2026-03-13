import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineClipboardList } from 'react-icons/hi';
import SectionCard from './SectionCard';

const SubRequestsCard = ({ pendingCount, pendingSubsCount }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <SectionCard
            className="sub-requests-card"
            title={t('dashboard:teacherDashboard.subRequests.title')}
            icon={HiOutlineClipboardList}
            action={
                <Link to="/portal/substitutions" className="btn btn-ghost btn-sm">
                    {t('dashboard:teacherDashboard.subRequests.viewAll')}
                </Link>
            }
        >
            {pendingCount.loading ? (
                <p className="empty-text">{t('dashboard:teacherDashboard.subRequests.loading')}</p>
            ) : pendingSubsCount > 0 ? (
                <Box sx={{ py: 1 }}>
                    <Typography variant="body1" fontWeight={600} color="primary.main">
                        {t('dashboard:teacherDashboard.subRequests.pendingRequestsCount', { count: pendingSubsCount })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {t('dashboard:teacherDashboard.subRequests.confirmOrDecline')}
                    </Typography>
                    <Link
                        to="/portal/substitutions"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8, display: 'inline-block' }}
                    >
                        {t('dashboard:teacherDashboard.subRequests.viewAndRespond')}
                    </Link>
                </Box>
            ) : (
                <p className="empty-text">{t('dashboard:teacherDashboard.subRequests.empty')}</p>
            )}
        </SectionCard>
    );
};

export default SubRequestsCard;
