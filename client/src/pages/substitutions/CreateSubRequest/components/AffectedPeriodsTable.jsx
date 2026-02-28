import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import {
  getGradeClassLabel,
  getPeriodLabel,
  getRoomLabel,
  getSubjectLabel,
  getTimeLabel
} from '../utils/createSubRequestUtils';

const AffectedPeriodsTable = ({ targetPeriods }) => (
  <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxWidth: 600 }}>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Period</TableCell>
          <TableCell>Time</TableCell>
          <TableCell>Class</TableCell>
          <TableCell>Subject</TableCell>
          <TableCell>Room</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {targetPeriods.map((period, index) => {
          const periodRef = period.periodId?.name ? period.periodId : null;
          const label = getPeriodLabel(periodRef, period._periodName || `Period ${index + 1}`);
          return (
            <TableRow key={period.periodId?._id || period.periodId || index}>
              <TableCell>{label}</TableCell>
              <TableCell>{getTimeLabel(period)}</TableCell>
              <TableCell>{getGradeClassLabel(period)}</TableCell>
              <TableCell>{getSubjectLabel(period)}</TableCell>
              <TableCell>{getRoomLabel(period)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

export default AffectedPeriodsTable;