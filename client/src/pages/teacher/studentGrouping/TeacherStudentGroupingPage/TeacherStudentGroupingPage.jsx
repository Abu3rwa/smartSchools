import { Box, Button, Paper, Typography } from '@mui/material';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { HiOutlineDownload } from 'react-icons/hi';
import GroupingFilters from './components/GroupingFilters';
import StudentGroupOverview from './components/StudentGroupOverview';
import StudentGroupCard from './components/StudentGroupCard';
import GroupingReportHistoryPanel from './components/GroupingReportHistoryPanel';
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
        handleRefreshActivities,
        exportingPdf,
        handleExportPdf,
        exportingOverviewPdf,
        historyLoading,
        historyItems,
        historyPagination,
        historyPage,
        historyReportType,
        downloadingReportId,
        handleExportOverviewPdf,
        handleHistoryPageChange,
        handleHistoryReportTypeChange,
        handleDownloadReport,
        handleRefreshHistory
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
                <>
                    <Box sx={{ mb: 2 }}>
                        <Button
                            startIcon={<HiOutlineDownload />}
                            onClick={handleExportOverviewPdf}
                            size="small"
                            variant="outlined"
                            disabled={exportingOverviewPdf || overviewLoading}
                        >
                            {exportingOverviewPdf ? 'Exporting...' : 'Export Class Overview PDF'}
                        </Button>
                    </Box>

                    <StudentGroupOverview
                        overview={overview}
                        overviewLoading={overviewLoading}
                        onStandardClick={handleStandardClick}
                    />
                </>
            )}

            {selectedClassId && view === 'detail' && (
                <>
                    <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button
                                startIcon={<HiOutlineArrowLeft />}
                                onClick={handleBackToOverview}
                                size="small"
                            >
                                Back to Overview
                            </Button>
                            <Button
                                startIcon={<HiOutlineDownload />}
                                onClick={handleExportPdf}
                                size="small"
                                variant="outlined"
                                disabled={exportingPdf || loading}
                            >
                                {exportingPdf ? 'Exporting...' : 'Export PDF'}
                            </Button>
                        </Box>
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

            {selectedClassId && (
                <GroupingReportHistoryPanel
                    items={historyItems}
                    loading={historyLoading}
                    pagination={historyPagination}
                    page={historyPage}
                    reportType={historyReportType}
                    downloadingReportId={downloadingReportId}
                    onPageChange={handleHistoryPageChange}
                    onReportTypeChange={handleHistoryReportTypeChange}
                    onDownload={handleDownloadReport}
                    onRefresh={handleRefreshHistory}
                />
            )}
        </Box>
    );
};

export default TeacherStudentGroupingPage;
