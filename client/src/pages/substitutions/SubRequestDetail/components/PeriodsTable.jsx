import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { getEntityName, getPeriodTitle } from '../utils/subRequestDetailUtils';

const PeriodsTable = ({ periods }) => {
  if (!periods?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No period details available
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Period</TableCell>
            <TableCell>Class</TableCell>
            <TableCell>Subject</TableCell>
            <TableCell>Room</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {periods.map((period, index) => (
            <TableRow key={period?.periodId?._id || period?.periodId || index}>
              <TableCell>{getPeriodTitle(period)}</TableCell>
              <TableCell>{getEntityName(period.classId)}</TableCell>
              <TableCell>{getEntityName(period.subjectId)}</TableCell>
              <TableCell>{getEntityName(period.roomId)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default PeriodsTable;