import { Box, Grid, Typography } from '@mui/material';
import { isPositiveChange } from '../utils/dashboardPresentation';

const DashboardStatsGrid = ({ stats }) => {
    return (
        <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
            {stats.map((stat, index) => (
                <Grid item xs={6} sm={6} md={3} key={index}>
                    <Box className={`stat-card stat-${stat.color}`}>
                        <Box className="stat-icon">
                            <stat.icon size={22} />
                        </Box>
                        <Box className="stat-content">
                            <Typography variant="caption" className="stat-title">
                                {stat.title}
                            </Typography>
                            <Typography variant="h6" className="stat-value">
                                {stat.value}
                            </Typography>
                            <Typography
                                variant="caption"
                                className={`stat-change ${isPositiveChange(stat.change) ? 'positive' : ''}`}
                            >
                                {stat.change}
                            </Typography>
                        </Box>
                    </Box>
                </Grid>
            ))}
        </Grid>
    );
};

export default DashboardStatsGrid;
