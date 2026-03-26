import { Box, Button, Paper, Typography } from '@mui/material';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import GroupingFilters from './components/GroupingFilters';
import StudentGroupOverview from './components/StudentGroupOverview';
import StudentGroupCard from './components/StudentGroupCard';
import useStudentGrouping from './hooks/useStudentGrouping';
import './TeacherStudentGroupingPage.css';

const TeacherStudentGroupingPage = () => {
    const {
        classes,
        subjectOptions,
        groups,
        notStarted,
        overview,
        loading,
        overviewLoading,
        overrideSaving,
        activitiesRefreshing,
        error,
        selectedClassId,
        selectedSubjectId,
        view,
        handleClassChange,
        handleSubjectChange,
        handleStandardClick,
        handleBackToOverview,
        handleOverride,
        handleRefreshActivities
    } = useStudentGrouping();

    return (
        <Box className="student-grouping-page" sx={{ p: { xs: 2, md: 3 } }}>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h5" fontWeight={600} gutterBottom>
                    Student Grouping
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    View skill-level groups per standard based on mastery data. Drag students between groups to override.
                </Typography>
            </Paper>

            <GroupingFilters
                classes={classes}
                subjectOptions={subjectOptions}
                selectedClassId={selectedClassId}
                selectedSubjectId={selectedSubjectId}
                onClassChange={handleClassChange}
                onSubjectChange={handleSubjectChange}
            />

            {!selectedClassId && (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        Select a class to view student grouping data.
                    </Typography>
                </Paper>
            )}

            {selectedClassId && view === 'overview' && (
                <StudentGroupOverview
                    overview={overview}
                    overviewLoading={overviewLoading}
                    onStandardClick={handleStandardClick}
                />
            )}

            {selectedClassId && view === 'detail' && (
                <>
                    <Box sx={{ mb: 2 }}>
                        <Button
                            startIcon={<HiOutlineArrowLeft />}
                            onClick={handleBackToOverview}
                            size="small"
                        >
                            Back to Overview
                        </Button>
                    </Box>

                    {error && (
                        <Paper sx={{ p: 2, mb: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
                            <Typography variant="body2">{error}</Typography>
                        </Paper>
                    )}

                    <StudentGroupCard
                        groups={groups}
                        notStarted={notStarted}
                        loading={loading}
                        overrideSaving={overrideSaving}
                        activitiesRefreshing={activitiesRefreshing}
                        onOverride={handleOverride}
                        onRefreshActivities={handleRefreshActivities}
                    />
                </>
            )}
        </Box>
    );
};

export default TeacherStudentGroupingPage;
