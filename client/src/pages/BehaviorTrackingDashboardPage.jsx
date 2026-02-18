import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography
} from '@mui/material';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import behaviorTrackingService from '../services/behaviorTrackingService';

const LIVE_REFRESH_MS = 15000;

const formatDuration = (seconds = 0) => {
    const total = Number(seconds) || 0;
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}m ${secs}s`;
};

const BehaviorTrackingDashboardPage = () => {
    const [period, setPeriod] = useState('week');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dashboard, setDashboard] = useState(null);
    const [liveSnapshot, setLiveSnapshot] = useState(null);
    const [events, setEvents] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [liveMode, setLiveMode] = useState(true);

    const fetchDashboard = async (nextPeriod = period) => {
        setLoading(true);
        setError('');
        try {
            const [dashboardResponse, eventsResponse, sessionsResponse, liveResponse] = await Promise.all([
                behaviorTrackingService.getDashboard({ period: nextPeriod }),
                behaviorTrackingService.getEvents({ period: 'day', limit: 20, page: 1 }),
                behaviorTrackingService.getActiveSessions(),
                behaviorTrackingService.getLiveSnapshot({ minutes: 15 })
            ]);

            setDashboard(dashboardResponse.data.data);
            setEvents(eventsResponse.data.data || []);
            setSessions(sessionsResponse.data.data || []);
            setLiveSnapshot(liveResponse.data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Failed to load behavior dashboard');
        } finally {
            setLoading(false);
        }
    };

    const refreshLive = async () => {
        try {
            const [liveResponse, sessionsResponse] = await Promise.all([
                behaviorTrackingService.getLiveSnapshot({ minutes: 15 }),
                behaviorTrackingService.getActiveSessions()
            ]);
            setLiveSnapshot(liveResponse.data.data);
            setSessions(sessionsResponse.data.data || []);
        } catch {
            // silent in live mode
        }
    };

    useEffect(() => {
        fetchDashboard(period);
    }, [period]);

    useEffect(() => {
        if (!liveMode) return undefined;
        const timerId = setInterval(() => {
            refreshLive();
        }, LIVE_REFRESH_MS);
        return () => clearInterval(timerId);
    }, [liveMode]);

    const summary = dashboard?.summary || {};

    const timelineData = useMemo(() => dashboard?.timeline || [], [dashboard]);
    const topEventData = useMemo(() => dashboard?.topEventTypes || [], [dashboard]);

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} mb={2} spacing={2}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>Behavior Analytics</Typography>
                    <Typography variant="body2" color="text.secondary">Track events, sessions, performance, and operational insights.</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel id="behavior-period-label">Period</InputLabel>
                        <Select
                            labelId="behavior-period-label"
                            value={period}
                            label="Period"
                            onChange={(event) => setPeriod(event.target.value)}
                        >
                            <MenuItem value="day">Last Day</MenuItem>
                            <MenuItem value="week">Last Week</MenuItem>
                            <MenuItem value="month">Last Month</MenuItem>
                            <MenuItem value="quarter">Last Quarter</MenuItem>
                            <MenuItem value="year">Last Year</MenuItem>
                        </Select>
                    </FormControl>
                    <Button variant={liveMode ? 'contained' : 'outlined'} onClick={() => setLiveMode((prev) => !prev)}>
                        {liveMode ? 'Live: ON' : 'Live: OFF'}
                    </Button>
                    <Button variant="outlined" onClick={() => fetchDashboard(period)}>Refresh</Button>
                </Stack>
            </Stack>

            {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

            <Grid container spacing={2} mb={2}>
                <Grid item xs={12} md={3}>
                    <Card><CardContent><Typography variant="body2">Total Events</Typography><Typography variant="h5">{summary.totalEvents ?? 0}</Typography></CardContent></Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card><CardContent><Typography variant="body2">Active Users</Typography><Typography variant="h5">{summary.activeUsers ?? 0}</Typography></CardContent></Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card><CardContent><Typography variant="body2">Active Sessions</Typography><Typography variant="h5">{summary.activeSessions ?? 0}</Typography></CardContent></Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card><CardContent><Typography variant="body2">Error Rate</Typography><Typography variant="h5">{Number(summary.errorRate || 0).toFixed(2)}%</Typography></CardContent></Card>
                </Grid>
            </Grid>

            {liveSnapshot ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Last {liveSnapshot.windowMinutes} minutes: {liveSnapshot.eventsLastWindow} events, {liveSnapshot.activeSessions} active sessions, {liveSnapshot.errorsLastWindow} errors ({Number(liveSnapshot.errorRate || 0).toFixed(2)}%).
                </Alert>
            ) : null}

            <Grid container spacing={2} mb={2}>
                <Grid item xs={12} lg={8}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" mb={1}>Event Timeline</Typography>
                            <Box sx={{ width: '100%', height: 320 }}>
                                <ResponsiveContainer>
                                    <LineChart data={timelineData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="interval" />
                                        <YAxis />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="totalEvents" stroke="#1976d2" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="errors" stroke="#d32f2f" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} lg={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" mb={1}>Top Event Types</Typography>
                            <Box sx={{ width: '100%', height: 320 }}>
                                <ResponsiveContainer>
                                    <BarChart data={topEventData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" />
                                        <YAxis type="category" dataKey="eventType" width={120} />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#1976d2" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} lg={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" mb={1}>Actionable Insights</Typography>
                            <Stack spacing={1}>
                                {(dashboard?.insights || []).map((insight, index) => (
                                    <Box key={`${insight.title}-${index}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                                            <Chip size="small" label={insight.level} color={insight.level === 'high' ? 'error' : insight.level === 'medium' ? 'warning' : 'default'} />
                                            <Typography variant="subtitle2">{insight.title}</Typography>
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary">{insight.action}</Typography>
                                        <Typography variant="caption" color="text.secondary">{insight.value}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" mb={1}>Active Sessions</Typography>
                            <Stack spacing={1}>
                                {sessions.slice(0, 10).map((session) => (
                                    <Box key={session.sessionId} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                                        <Typography variant="subtitle2">{session.user?.firstName} {session.user?.lastName}</Typography>
                                        <Typography variant="caption" color="text.secondary">{session.user?.email}</Typography>
                                        <Typography variant="caption" display="block" color="text.secondary">Last seen: {new Date(session.lastSeenAt).toLocaleString()}</Typography>
                                    </Box>
                                ))}
                                {!sessions.length && <Typography variant="body2" color="text.secondary">No active sessions</Typography>}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" mb={1}>Recent Events</Typography>
                            <Stack spacing={1}>
                                {events.map((event) => (
                                    <Box key={event._id} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                                        <Typography variant="subtitle2">{event.action}</Typography>
                                        <Typography variant="caption" color="text.secondary">{event.eventType} · {new Date(event.timestamp).toLocaleString()}</Typography>
                                        <Typography variant="caption" display="block" color="text.secondary">Status {event.statusCode || 200} · {formatDuration(event.responseTime ? Math.round(event.responseTime / 1000) : 0)}</Typography>
                                    </Box>
                                ))}
                                {!events.length && <Typography variant="body2" color="text.secondary">No recent events</Typography>}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {loading ? <Typography variant="body2" color="text.secondary" mt={2}>Loading behavior dashboard...</Typography> : null}
        </Box>
    );
};

export default BehaviorTrackingDashboardPage;