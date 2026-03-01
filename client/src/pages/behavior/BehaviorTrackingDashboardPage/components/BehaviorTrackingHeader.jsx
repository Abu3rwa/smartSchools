import { Box, Typography } from '@mui/material';

const BehaviorTrackingHeader = () => {
    return (
        <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Behavior Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Track events, sessions, performance, and operational insights.
            </Typography>
        </Box>
    );
};

export default BehaviorTrackingHeader;
