import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const DashboardHeader = ({ firstName, isSm }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'flex-start' },
                mb: { xs: 2, md: 3 },
                gap: 2
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="h5"
                    component="h1"
                    sx={{
                        mb: 0.5,
                        fontWeight: 700,
                        fontSize: { xs: '1.25rem', sm: '1.4rem', md: '1.5rem' },
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {t('dashboard:header.welcome', { firstName: firstName || '' })}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('dashboard:header.subtitle')}
                </Typography>
            </Box>
            <Box sx={{ flexShrink: 0 }}>
                <Link
                    to="/portal/grades/entry"
                    className="btn btn-primary dashboard-cta"
                    style={{ width: isSm ? '100%' : 'auto' }}
                >
                    <HiOutlineClipboardList size={18} />
                    {t('dashboard:header.enterGrades')}
                </Link>
            </Box>
        </Box>
    );
};

export default DashboardHeader;
