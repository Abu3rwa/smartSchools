import { Box, Divider, Typography } from '@mui/material';
import PageContainer from '../../../components/layout/PageContainer';
import DetailHeader from './components/DetailHeader';
import SummaryGrid from './components/SummaryGrid';
import DetailSection from './components/DetailSection';
import DetailLoadingState from './components/DetailLoadingState';
import DetailErrorState from './components/DetailErrorState';
import PeriodsTable from './components/PeriodsTable';
import AssignmentsSection from './components/AssignmentsSection';
import TeacherResponsePanel from './components/TeacherResponsePanel';
import TimelineSection from './components/TimelineSection';
import DetailActions from './components/DetailActions';
import CancelRequestDialog from './components/CancelRequestDialog';
import useSubRequestDetail from './hooks/useSubRequestDetail';
import {
  formatDate,
  formatDateTime,
  getCoverageLabel,
  getPersonName
} from './utils/subRequestDetailUtils';

const SubRequestDetail = () => {
  const {
    loading,
    error,
    item,
    respondInPortal,
    cancelModal,
    setCancelModal,
    cancelNote,
    setCancelNote,
    cancelling,
    teacherNote,
    setTeacherNote,
    responseNotesByAssignment,
    setResponseNoteForAssignment,
    teacherAction,
    handleCancel,
    handleTeacherRespond,
    displayAssignments,
    assignmentCounts,
    hasConfirmedForTeacher,
    hasPendingForTeacher,
    hasDeclinedForTeacher,
    isAbsentTeacher,
    isTeacher,
    canCancel,
    navigate
  } = useSubRequestDetail();

  if (loading && !item) {
    return (
      <PageContainer>
        <DetailLoadingState />
      </PageContainer>
    );
  }

  if (error && !item) {
    return (
      <PageContainer>
        <DetailErrorState message={error} onBack={() => navigate('/portal/substitutions')} />
      </PageContainer>
    );
  }

  if (!item) return null;

  const subtitle = `${formatDate(item.date)} · ${getPersonName(item.absentTeacherId)} · ${getCoverageLabel(item.coverageType)}`;

  const summaryItems = [
    { label: 'Created by', value: getPersonName(item.createdBy) },
    { label: 'Created at', value: formatDateTime(item.createdAt) },
    { label: 'Expires at', value: formatDateTime(item.expiresAt) },
    { label: 'Coverage', value: getCoverageLabel(item.coverageType) },
    { label: 'Absent teacher', value: getPersonName(item.absentTeacherId) },
    { label: 'Request date', value: formatDate(item.date) }
  ];

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <DetailHeader title="Sub Request Detail" subtitle={subtitle} status={item.status} counts={assignmentCounts} />

        <SummaryGrid items={summaryItems} />

        <Divider sx={{ mb: 3 }} />

        <DetailSection title="Principal Note">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
            {item.principalNote || 'No note provided'}
          </Typography>
        </DetailSection>

        <DetailSection title="Subbing Materials">
          {item.materialsLink ? (
            <Typography variant="body2">
              <a href={item.materialsLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                {item.materialsLink}
              </a>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No materials link provided
            </Typography>
          )}
        </DetailSection>

        <DetailSection title="Requested Periods">
          <PeriodsTable
            periods={item.periods}
            assignments={displayAssignments}
            isTeacher={isTeacher && !isAbsentTeacher}
            requestStatus={item.status}
            note={teacherNote}
            responseNotesByAssignment={responseNotesByAssignment}
            onResponseNoteChange={setResponseNoteForAssignment}
            onRespond={handleTeacherRespond}
            respondLoading={respondInPortal.loading}
            activeAction={teacherAction}
          />
        </DetailSection>

        <AssignmentsSection assignments={displayAssignments} isTeacher={isTeacher} />

        <TeacherResponsePanel
          isTeacher={isTeacher}
          isAbsentTeacher={isAbsentTeacher}
          hasPending={hasPendingForTeacher}
          hasConfirmed={hasConfirmedForTeacher}
          hasDeclined={hasDeclinedForTeacher}
          status={item.status}
          coverageType={item.coverageType}
          assignments={displayAssignments}
          note={teacherNote}
          onNoteChange={(event) => setTeacherNote(event.target.value)}
          onRespond={handleTeacherRespond}
          respondLoading={respondInPortal.loading}
          activeAction={teacherAction}
        />

        <TimelineSection timeline={item.timeline} />

        <DetailActions
          onBack={() => navigate('/portal/substitutions')}
          onCancel={() => setCancelModal(true)}
          canCancel={canCancel}
        />
      </Box>

      <CancelRequestDialog
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        onConfirm={handleCancel}
        note={cancelNote}
        onNoteChange={(event) => setCancelNote(event.target.value)}
        cancelling={cancelling}
      />
    </PageContainer>
  );
};

export default SubRequestDetail;