import { Box, Typography } from '@mui/material';

/**
 * Dashboard page header with title and subtitle.
 * Uses existing CSS classes: admin-dashboard-title, admin-dashboard-subtitle.
 */
export default function AdminDashboardHeader({ title, subtitle }) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'flex-start' },
                mb: { xs: 2, md: 3 },
                gap: 2,
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="h5"
                    component="h1"
                    className="admin-dashboard-title"
                    sx={{
                        mb: 0.5,
                        fontWeight: 700,
                        fontSize: { xs: '1.25rem', sm: '1.4rem', md: '1.5rem' },
                    }}
                >
                    {title}
                </Typography>
                <Typography variant="body2" className="admin-dashboard-subtitle">
                    {subtitle}
                </Typography>
            </Box>
        </Box>
    );
}
