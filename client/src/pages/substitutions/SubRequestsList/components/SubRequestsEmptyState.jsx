import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SubRequestsEmptyState = ({ hasFilters }) => {
  const { t } = useTranslation(['subRequestsList']);

  return (
    <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="body2">
        {hasFilters
          ? t('subRequestsList:empty.filtered')
          : t('subRequestsList:empty.unfiltered')}
      </Typography>
    </Box>
  );
};

export default SubRequestsEmptyState;
