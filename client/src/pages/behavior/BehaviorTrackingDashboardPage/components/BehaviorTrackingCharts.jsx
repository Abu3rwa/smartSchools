import {
    Box,
    Card,
    CardContent,
    Grid,
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

const BehaviorTrackingCharts = ({ timelineData, topEventData }) => {
    return (
        <Grid container spacing={2} mb={2}>
            <Grid item xs={12} lg={8}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" mb={1}>
                            Event Timeline
                        </Typography>
                        <Box sx={{ width: '100%', height: 320 }}>
                            <ResponsiveContainer>
                                <LineChart data={timelineData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="interval" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line
                                        type="monotone"
                                        dataKey="totalEvents"
                                        stroke="#1976d2"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="errors"
                                        stroke="#d32f2f"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} lg={4}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" mb={1}>
                            Top Event Types
                        </Typography>
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
    );
};

export default BehaviorTrackingCharts;
