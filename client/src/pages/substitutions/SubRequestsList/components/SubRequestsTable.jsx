import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import Paper from '@mui/material/Paper';
import { useTranslation } from 'react-i18next';
import StatusChip from '../../../../components/substitutions/StatusChip';
import { formatDate, getPersonName } from '../utils/subRequestsListUtils';

const SubRequestsTable = ({ items, onView }) => {
  const { t, i18n } = useTranslation(['subRequestsList']);
  const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('subRequestsList:table.date')}</TableCell>
            <TableCell>{t('subRequestsList:table.absentTeacher')}</TableCell>
            <TableCell>{t('subRequestsList:table.coverageType')}</TableCell>
            <TableCell>{t('subRequestsList:table.status')}</TableCell>
            <TableCell>{t('subRequestsList:table.createdBy')}</TableCell>
            <TableCell>{t('subRequestsList:table.updated')}</TableCell>
            <TableCell>{t('subRequestsList:table.actions')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((request) => (
            <TableRow key={request._id} hover>
              <TableCell>{formatDate(request.date, locale)}</TableCell>
              <TableCell>{getPersonName(request.absentTeacherId)}</TableCell>
              <TableCell>
                {request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? t('subRequestsList:coverage.single') : t('subRequestsList:coverage.perPeriod')}
              </TableCell>
              <TableCell>
                <StatusChip
                  status={request.status}
                  label={t(`subRequestsList:status.${String(request.status || '').toLowerCase()}`)}
                />
              </TableCell>
              <TableCell>{getPersonName(request.createdBy)}</TableCell>
              <TableCell>{formatDate(request.updatedAt, locale)}</TableCell>
              <TableCell>
                <Button size="small" onClick={() => onView(request._id)}>
                  {t('common:actions.view')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default SubRequestsTable;
