import {
    Box,
    Card,
    CardContent,
    Chip,
    Grid,
    Stack,
    Typography
} from '@mui/material';
import { getInsightChipColor } from '../utils/behaviorTrackingDashboardPresentation';

const BehaviorTrackingLiveSection = ({ insights, sessions }) => {
    return (
        <>
            <Grid item xs={12} lg={4}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" mb={1}>
                            Actionable Insights
                        </Typography>
                        <Stack spacing={1}>
                            {insights.map((insight, index) => (
                                <Box
                                    key={`${insight.title}-${index}`}
                                    sx={{
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        p: 1.25
                                    }}
                                >
                                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                                        <Chip
                                            size="small"
                                            label={insight.level}
                                            color={getInsightChipColor(insight.level)}
                                        />
                                        <Typography variant="subtitle2">{insight.title}</Typography>
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {insight.action}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {insight.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            </Grid>

            <Grid item xs={12} lg={4}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" mb={1}>
                            Active Sessions
                        </Typography>
                        <Stack spacing={1}>
                            {sessions.slice(0, 10).map((session) => (
                                <Box
                                    key={session.sessionId}
                                    sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}
                                >
                                    <Typography variant="subtitle2">
                                        {session.user?.firstName} {session.user?.lastName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {session.user?.email}
                                    </Typography>
                                    <Typography variant="caption" display="block" color="text.secondary">
                                        Last seen: {new Date(session.lastSeenAt).toLocaleString()}
                                    </Typography>
                                </Box>
                            ))}
                            {!sessions.length && (
                                <Typography variant="body2" color="text.secondary">
                                    No active sessions
                                </Typography>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            </Grid>
        </>
    );
};

export default BehaviorTrackingLiveSection;
