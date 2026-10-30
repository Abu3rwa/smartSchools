import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectClasses } from '../../../../../store/slices/classSlice';
import { selectSubjects } from '../../../../../store/slices/subjectSlice';
import { selectCurrentAcademicYear } from '../../../../../store/slices/uiSlice';
import {
    fetchStudentGroups,
    fetchGroupingOverview,
    saveGroupingOverride,
    refreshGroupActivities,
    clearGroupingData,
    selectGroupingGroups,
    selectGroupingNotStarted,
    selectGroupingOverview,
    selectGroupingLoading,
    selectOverviewLoading,
    selectOverrideSaving,
    selectActivitiesRefreshing,
    selectGroupingError
} from '../../../../../store/slices/studentGroupingSlice';
import studentGroupingService from '../../../../../services/studentGroupingService';

const useStudentGrouping = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const groups = useSelector(selectGroupingGroups);
    const notStarted = useSelector(selectGroupingNotStarted);
    const overview = useSelector(selectGroupingOverview);
    const loading = useSelector(selectGroupingLoading);
    const overviewLoading = useSelector(selectOverviewLoading);
    const overrideSaving = useSelector(selectOverrideSaving);
    const activitiesRefreshing = useSelector(selectActivitiesRefreshing);
    const error = useSelector(selectGroupingError);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedStandardId, setSelectedStandardId] = useState('');
    const [view, setView] = useState('overview'); // 'overview' | 'detail'
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportingOverviewPdf, setExportingOverviewPdf] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyReportType, setHistoryReportType] = useState('');
    const [historyPagination, setHistoryPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    });
    const [downloadingReportId, setDownloadingReportId] = useState('');

    const selectedClass = useMemo(
        () => classes.find((item) => item._id === selectedClassId) || null,
        [classes, selectedClassId]
    );

    const subjectOptions = useMemo(() => {
        if (!selectedClass?.subjects?.length) return [];

        const ids = selectedClass.subjects
            .map((entry) => {
                if (entry?.subject?._id) return String(entry.subject._id);
                if (entry?.subject) return String(entry.subject);
                return '';
            })
            .filter(Boolean);

        const uniqueIds = Array.from(new Set(ids));
        return uniqueIds.map((id) => {
            const subject = subjects.find((s) => String(s._id) === id);
            return {
                _id: id,
                name: subject?.name || subject?.subjectName || id
            };
        });
    }, [selectedClass, subjects]);

    // Load overview when class is selected
    useEffect(() => {
        if (selectedClassId && academicYear) {
            dispatch(fetchGroupingOverview({
                classId: selectedClassId,
                academicYear,
                subjectId: selectedSubjectId || undefined
            }));
        }
    }, [selectedClassId, selectedSubjectId, academicYear, dispatch]);

    // Load detailed groups when standard selected
    useEffect(() => {
        if (selectedClassId && selectedStandardId && academicYear) {
            dispatch(fetchStudentGroups({
                classId: selectedClassId,
                standardId: selectedStandardId,
                academicYear
            }));
        }
    }, [selectedClassId, selectedStandardId, academicYear, dispatch]);

    const loadHistory = useCallback(async ({
        classId,
        page = historyPage,
        reportType = historyReportType
    } = {}) => {
        if (!classId || !academicYear) {
            setHistoryItems([]);
            setHistoryPagination({
                page: 1,
                limit: 10,
                total: 0,
                pages: 0
            });
            return;
        }

        setHistoryLoading(true);
        try {
            const result = await studentGroupingService.getReportHistory({
                classId,
                page,
                limit: 10,
                academicYear,
                reportType: reportType || undefined,
                subjectId: selectedSubjectId || undefined
            });

            setHistoryItems(result.items || []);
            setHistoryPagination(result.pagination || {
                page,
                limit: 10,
                total: 0,
                pages: 0
            });
        } catch (historyError) {
            setHistoryItems([]);
            setHistoryPagination({
                page,
                limit: 10,
                total: 0,
                pages: 0
            });
            toast.error(historyError?.response?.data?.message || 'Failed to load report history.');
        } finally {
            setHistoryLoading(false);
        }
    }, [academicYear, historyPage, historyReportType, selectedSubjectId]);

    useEffect(() => {
        if (!selectedClassId || !academicYear) return;
        loadHistory({
            classId: selectedClassId,
            page: historyPage,
            reportType: historyReportType
        });
    }, [selectedClassId, academicYear, historyPage, historyReportType, selectedSubjectId, loadHistory]);

    const handleClassChange = useCallback((classId) => {
        setSelectedClassId(classId);
        setSelectedSubjectId('');
        setSelectedStandardId('');
        setView('overview');
        setHistoryPage(1);
        setHistoryReportType('');
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleSubjectChange = useCallback((subjectId) => {
        setSelectedSubjectId(subjectId);
        setSelectedStandardId('');
        setView('overview');
        setHistoryPage(1);
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleStandardClick = useCallback((standardId) => {
        setSelectedStandardId(standardId);
        setView('detail');
    }, []);

    const handleBackToOverview = useCallback(() => {
        setSelectedStandardId('');
        setView('overview');
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleOverride = useCallback(async ({ studentId, newLevel, reason }) => {
        if (!selectedClassId || !selectedStandardId) return;
        await dispatch(saveGroupingOverride({
            classId: selectedClassId,
            standardId: selectedStandardId,
            studentId,
            newLevel,
            reason,
            academicYear
        })).unwrap();

        // Refresh groups after override
        dispatch(fetchStudentGroups({
            classId: selectedClassId,
            standardId: selectedStandardId,
            academicYear
        }));
    }, [selectedClassId, selectedStandardId, academicYear, dispatch]);

    const handleRefreshActivities = useCallback(async (level) => {
        if (!selectedClassId || !selectedStandardId) return;
        await dispatch(refreshGroupActivities({
            classId: selectedClassId,
            standardId: selectedStandardId,
            level
        })).unwrap();
    }, [selectedClassId, selectedStandardId, dispatch]);

    const handleExportPdf = useCallback(async () => {
        if (!selectedClassId || !selectedStandardId || !academicYear) return;

        setExportingPdf(true);
        try {
            await studentGroupingService.exportStandardPdf({
                classId: selectedClassId,
                standardId: selectedStandardId,
                academicYear
            });
        } catch (error) {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                'Failed to export PDF.';
            toast.error(message);
        } finally {
            setExportingPdf(false);
        }
    }, [selectedClassId, selectedStandardId, academicYear]);

    const handleExportOverviewPdf = useCallback(async () => {
        if (!selectedClassId || !academicYear) return;

        setExportingOverviewPdf(true);
        try {
            await studentGroupingService.exportOverviewPdf({
                classId: selectedClassId,
                academicYear,
                subjectId: selectedSubjectId || undefined
            });

            await loadHistory({
                classId: selectedClassId,
                page: 1,
                reportType: historyReportType
            });
            setHistoryPage(1);
        } catch (exportError) {
            const message =
                exportError?.response?.data?.message ||
                exportError?.message ||
                'Failed to export class overview PDF.';
            toast.error(message);
        } finally {
            setExportingOverviewPdf(false);
        }
    }, [selectedClassId, academicYear, selectedSubjectId, loadHistory, historyReportType]);

    const handleHistoryPageChange = useCallback((page) => {
        setHistoryPage(page);
    }, []);

    const handleHistoryReportTypeChange = useCallback((reportType) => {
        setHistoryReportType(reportType);
        setHistoryPage(1);
    }, []);

    const handleDownloadReport = useCallback(async (reportId) => {
        if (!reportId) return;

        setDownloadingReportId(reportId);
        try {
            await studentGroupingService.downloadArchivedReport({ reportId });
        } catch (downloadError) {
            const message =
                downloadError?.response?.data?.message ||
                downloadError?.message ||
                'Failed to download report.';
            toast.error(message);
        } finally {
            setDownloadingReportId('');
        }
    }, []);

    const handleRefreshHistory = useCallback(() => {
        if (!selectedClassId) return;
        loadHistory({
            classId: selectedClassId,
            page: historyPage,
            reportType: historyReportType
        });
    }, [selectedClassId, historyPage, historyReportType, loadHistory]);

    return {
        classes,
        subjectOptions,
        academicYear,
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
        selectedStandardId,
        view,
        exportingPdf,
        exportingOverviewPdf,
        historyLoading,
        historyItems,
        historyPagination,
        historyPage,
        historyReportType,
        downloadingReportId,
        handleClassChange,
        handleSubjectChange,
        handleStandardClick,
        handleBackToOverview,
        handleOverride,
        handleRefreshActivities,
        handleExportPdf,
        handleExportOverviewPdf,
        handleHistoryPageChange,
        handleHistoryReportTypeChange,
        handleDownloadReport,
        handleRefreshHistory
    };
};

export default useStudentGrouping;
