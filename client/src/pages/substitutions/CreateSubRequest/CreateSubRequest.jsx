import { Alert, Box, Typography } from '@mui/material';
import PageContainer from '../../../components/layout/PageContainer';
import { COVERAGE_TYPES } from './constants';
import CreateSubRequestHeader from './components/CreateSubRequestHeader';
import LoadCandidatesForm from './components/LoadCandidatesForm';
import AffectedPeriodsTable from './components/AffectedPeriodsTable';
import CoverageTypeSelector from './components/CoverageTypeSelector';
import SingleCoverageSelector from './components/SingleCoverageSelector';
import PerPeriodCoverageSelector from './components/PerPeriodCoverageSelector';
import NotesFields from './components/NotesFields';
import SubmitSection from './components/SubmitSection';
import useCreateSubRequest from './hooks/useCreateSubRequest';

const CreateSubRequest = () => {
  const {
    teacherOptions,
    teachersLoading,
    absentTeacherId,
    setAbsentTeacherId,
    date,
    setDate,
    coverageType,
    setCoverageType,
    singleSubstituteId,
    setSingleSubstituteId,
    perPeriodSelections,
    handleSelectPerPeriod,
    principalNote,
    setPrincipalNote,
    materialsLink,
    setMaterialsLink,
    loaded,
    candidatesLoading,
    candidatesError,
    candidatesAll,
    candidatesByPeriod,
    targetPeriods,
    createLoading,
    createError,
    canSubmit,
    handleLoadCandidates,
    handleSubmit
  } = useCreateSubRequest();

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <CreateSubRequestHeader />

        <LoadCandidatesForm
          teacherOptions={teacherOptions}
          teachersLoading={teachersLoading}
          selectedTeacherId={absentTeacherId}
          date={date}
          onTeacherChange={setAbsentTeacherId}
          onDateChange={(event) => setDate(event.target.value)}
          onLoad={handleLoadCandidates}
          candidatesLoading={candidatesLoading}
        />

        {candidatesError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {candidatesError}
          </Alert>
        )}

        {createError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {createError}
          </Alert>
        )}

        {loaded && targetPeriods.length > 0 && (
          <>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Affected Periods
            </Typography>
            <AffectedPeriodsTable targetPeriods={targetPeriods} />

            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Coverage Type
            </Typography>
            <CoverageTypeSelector value={coverageType} onChange={setCoverageType} />

            {coverageType === COVERAGE_TYPES.SINGLE ? (
              <SingleCoverageSelector
                candidates={candidatesAll}
                selectedId={singleSubstituteId}
                onSelect={setSingleSubstituteId}
              />
            ) : (
              <PerPeriodCoverageSelector
                targetPeriods={targetPeriods}
                candidatesByPeriod={candidatesByPeriod}
                selections={perPeriodSelections}
                onSelect={handleSelectPerPeriod}
              />
            )}

            <NotesFields
              principalNote={principalNote}
              materialsLink={materialsLink}
              onPrincipalNoteChange={(event) => setPrincipalNote(event.target.value)}
              onMaterialsLinkChange={(event) => setMaterialsLink(event.target.value)}
            />

            <SubmitSection loading={createLoading} disabled={!canSubmit} onSubmit={handleSubmit} />
          </>
        )}
      </Box>
    </PageContainer>
  );
};

export default CreateSubRequest;