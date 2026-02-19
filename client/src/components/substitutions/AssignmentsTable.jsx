import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import StatusChip from './StatusChip';

const formatTime12 = (value) => {
  if (!value || typeof value !== 'string') return value || '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const AssignmentsTable = ({ assignments, showSubstituteColumn = true }) => {
  if (!assignments || assignments.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No assignments
      </Typography>
    );
  }

  const getSubstituteName = (a) => {
    const sub = a.substituteTeacherId;
    if (!sub) return '—';
    if (typeof sub === 'object') {
      const first = sub.firstName || '';
      const last = sub.lastName || '';
      return `${first} ${last}`.trim() || sub.email || '—';
    }
    return '—';
  };

  const getPeriodLabel = (a) => {
    const period = a.periodId;
    if (!period) return '—';
    if (typeof period === 'object') {
      if (period.name) return period.name;
      if (period.startTime && period.endTime) {
        return `${formatTime12(period.startTime)} - ${formatTime12(period.endTime)}`;
      }
      return '—';
    }
    return '—';
  };

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Period</TableCell>
            {showSubstituteColumn && <TableCell>Substitute Teacher</TableCell>}
            <TableCell>Status</TableCell>
            <TableCell>Response Note</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assignments.map((a, idx) => (
            <TableRow key={a._id || idx}>
              <TableCell>{getPeriodLabel(a)}</TableCell>
              {showSubstituteColumn && <TableCell>{getSubstituteName(a)}</TableCell>}
              <TableCell>
                <StatusChip status={a.status || 'PENDING'} />
              </TableCell>
              <TableCell sx={{ maxWidth: 200 }}>{a.teacherResponseNote || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default AssignmentsTable;
