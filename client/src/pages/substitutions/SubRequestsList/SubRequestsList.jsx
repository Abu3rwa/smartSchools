import { Alert, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../../components/layout/PageContainer';
import { STATUS_OPTIONS } from './constants';
import SubRequestsListHeader from './components/SubRequestsListHeader';
import SubRequestsFilters from './components/SubRequestsFilters';
import SubRequestsTable from './components/SubRequestsTable';
import SubRequestsEmptyState from './components/SubRequestsEmptyState';
import SubRequestsSkeleton from './components/SubRequestsSkeleton';
import useSubRequestsList from './hooks/useSubRequestsList';

const SubRequestsList = () => {
  const navigate = useNavigate();
  const {
    loading,
    error,
    items,
    filters,
    setFilters,
    applyFilters,
    teacherOptions,
    canCreate
  } = useSubRequestsList();

  const hasFilters = Boolean(
    filters.status ||
      filters.startDate ||
      filters.endDate ||
      (canCreate && (filters.absentTeacherId || filters.substituteTeacherId))
  );

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <SubRequestsListHeader
          canCreate={canCreate}
          onCreate={() => navigate('/portal/substitutions/create')}
        />

        <SubRequestsFilters
          filters={filters}
          statusOptions={STATUS_OPTIONS}
          teacherOptions={teacherOptions}
          canCreate={canCreate}
          loading={loading}
          onChange={(field, value) => setFilters((prev) => ({ ...prev, [field]: value }))}
          onApply={applyFilters}
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && items.length === 0 ? (
          <SubRequestsSkeleton />
        ) : items.length === 0 ? (
          <SubRequestsEmptyState hasFilters={hasFilters} />
        ) : (
          <SubRequestsTable items={items} onView={(id) => navigate(`/portal/substitutions/${id}`)} />
        )}
      </Box>
    </PageContainer>
  );
};

export default SubRequestsList;
