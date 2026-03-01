import {
    Box,
    Card,
    CardContent,
    Grid,
    Stack,
    Typography
} from '@mui/material';
import { formatDuration } from '../utils/behaviorTrackingDashboardPresentation';

const BehaviorTrackingEventsList = ({ events }) => {
    return (
        <Grid item xs={12} lg={4}>
            <Card>
                <CardContent>
                    <Typography variant="h6" mb={1}>
                        Recent Events
                    </Typography>
                    <Stack spacing={1}>
                        {events.map((event) => (
                            <Box
                                key={event._id}
                                sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
                            >
                                <Typography variant="subtitle2">{event.action}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {event.eventType} · {new Date(event.timestamp).toLocaleString()}
                                </Typography>
                                <Typography variant="caption" display="block" color="text.secondary">
                                    Status {event.statusCode || 200} ·{' '}
                                    {formatDuration(
                                        event.responseTime ? Math.round(event.responseTime / 1000) : 0
                                    )}
                                </Typography>
                            </Box>
                        ))}
                        {!events.length && (
                            <Typography variant="body2" color="text.secondary">
                                No recent events
                            </Typography>
                        )}
                    </Stack>
                </CardContent>
            </Card>
        </Grid>
    );
};

export default BehaviorTrackingEventsList;
