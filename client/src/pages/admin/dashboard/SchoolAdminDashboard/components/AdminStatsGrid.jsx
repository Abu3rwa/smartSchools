import { Grid } from '@mui/material';
import { useTranslation } from 'react-i18next';
import AdminStatCard from './AdminStatCard.jsx';

/**
 * Grid of stat cards. Preserves layout: xs={6} sm={6} md={3}.
 */
export default function AdminStatsGrid({ stats }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
            {stats.map((stat, index) => (
                <Grid item xs={6} sm={6} md={3} key={index}>
                    <AdminStatCard
                        icon={stat.icon}
                        variant={stat.color}
                        value={stat.value}
                        label={t(`adminDashboard:${stat.titleKey}`)}
                        subtitle={stat.subtitleKey ? t(`adminDashboard:${stat.subtitleKey}`, stat.subtitleParams) : ''}
                    />
                </Grid>
            ))}
        </Grid>
    );
}
