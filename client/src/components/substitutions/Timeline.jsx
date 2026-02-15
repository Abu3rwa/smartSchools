import { Box, Typography, Stack } from '@mui/material';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const getActorName = (by) => {
  if (!by) return 'System';
  if (typeof by === 'object') {
    const first = by.firstName || '';
    const last = by.lastName || '';
    return `${first} ${last}`.trim() || 'Unknown';
  }
  return 'Unknown';
};

const Timeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No timeline events
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {[...timeline].reverse().map((event, idx) => (
        <Box
          key={idx}
          sx={{
            pl: 2,
            borderLeft: 2,
            borderColor: 'divider',
            py: 0.5,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            {event.action}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(event.at)} · {getActorName(event.by)}
          </Typography>
          {event.meta?.note && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {event.meta.note}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
};

export default Timeline;
