import { Grid } from '@mui/material';
import AdminStatCard from './AdminStatCard.jsx';

/**
 * Grid of stat cards. Preserves layout: xs={6} sm={6} md={3}.
 */
export default function AdminStatsGrid({ stats }) {
    return (
        <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
            {stats.map((stat, index) => (
                <Grid item xs={6} sm={6} md={3} key={index}>
                    <AdminStatCard
                        icon={stat.icon}
                        variant={stat.color}
                        value={stat.value}
                        label={stat.title}
                        subtitle={stat.subtitle}
                    />
                </Grid>
            ))}
        </Grid>
    );
}
