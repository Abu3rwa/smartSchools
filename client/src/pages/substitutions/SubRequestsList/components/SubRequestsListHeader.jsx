import { Box, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SubRequestsListHeader = ({ canCreate, onCreate }) => {
  const { t } = useTranslation(['subRequestsList']);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <Box>
        <h1 style={{ marginBottom: 8, fontSize: '1.75rem' }}>{t('subRequestsList:header.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          {t('subRequestsList:header.subtitle')}
        </p>
      </Box>
      {canCreate && (
        <Button variant="contained" onClick={onCreate}>
          {t('subRequestsList:actions.createSubRequest')}
        </Button>
      )}
    </Box>
  );
};

export default SubRequestsListHeader;
