import { Box, Typography } from '@mui/material';
import Timeline from '../../../../components/substitutions/Timeline';

const TimelineSection = ({ timeline }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
      Timeline
    </Typography>
    <Timeline timeline={timeline} />
  </Box>
);

export default TimelineSection;