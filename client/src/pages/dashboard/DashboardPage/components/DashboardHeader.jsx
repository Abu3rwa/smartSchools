import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';

const DashboardHeader = ({ firstName, isSm }) => {
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
                    Welcome back, {firstName}! 👋
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Here&apos;s what&apos;s happening with your classes today.
                </Typography>
            </Box>
            <Box sx={{ flexShrink: 0 }}>
                <Link
                    to="/portal/grades/entry"
                    className="btn btn-primary dashboard-cta"
                    style={{ width: isSm ? '100%' : 'auto' }}
                >
                    <HiOutlineClipboardList size={18} />
                    Enter Grades
                </Link>
            </Box>
        </Box>
    );
};

export default DashboardHeader;
