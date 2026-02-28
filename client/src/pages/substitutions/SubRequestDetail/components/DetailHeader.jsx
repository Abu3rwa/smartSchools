import { Box, Chip, Stack, Typography } from '@mui/material';
import StatusChip from '../../../../components/substitutions/StatusChip';

const DetailHeader = ({ title, subtitle, status, counts }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: { xs: 'flex-start', sm: 'center' },
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 2,
      mb: 3
    }}
  >
    <Box>
      <Typography variant="h4" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 1 }}>
      <StatusChip status={status} />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={`Pending: ${counts.pending}`} />
        <Chip size="small" color="success" label={`Confirmed: ${counts.confirmed}`} />
        {counts.declined > 0 && <Chip size="small" color="error" label={`Declined: ${counts.declined}`} />}
      </Stack>
    </Box>
  </Box>
);

export default DetailHeader;
