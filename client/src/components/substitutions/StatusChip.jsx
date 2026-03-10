import { Chip } from '@mui/material';

const STATUS_COLORS = {
  SUBMITTED: 'info',
  CONFIRMED: 'success',
  DECLINED: 'error',
  CANCELLED: 'default',
  EXPIRED: 'warning',
};

const StatusChip = ({ status, label }) => {
  const color = STATUS_COLORS[status] || 'default';
  return <Chip label={label || status} color={color} size="small" variant="outlined" />;
};

export default StatusChip;
