import {
    Card,
    CardContent,
    Grid,
    Typography
} from '@mui/material';
import { formatRatePercentage } from '../utils/behaviorTrackingDashboardPresentation';

const BehaviorTrackingSummaryCards = ({ summary }) => {
    return (
        <Grid container spacing={2} mb={2}>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="body2">Total Events</Typography>
                        <Typography variant="h5">{summary.totalEvents ?? 0}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="body2">Active Users</Typography>
                        <Typography variant="h5">{summary.activeUsers ?? 0}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="body2">Active Sessions</Typography>
                        <Typography variant="h5">{summary.activeSessions ?? 0}</Typography>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={3}>
                <Card>
                    <CardContent>
                        <Typography variant="body2">Error Rate</Typography>
                        <Typography variant="h5">{formatRatePercentage(summary.errorRate)}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
};

export default BehaviorTrackingSummaryCards;
