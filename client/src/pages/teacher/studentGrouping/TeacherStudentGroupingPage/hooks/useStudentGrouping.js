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
    const [worksheetPacks, setWorksheetPacks] = useState([]);
    const [worksheetPacksLoading, setWorksheetPacksLoading] = useState(false);
    const [creatingWorksheetPack, setCreatingWorksheetPack] = useState(false);
    const [endingWorksheetPackId, setEndingWorksheetPackId] = useState('');
    const [publishingWorksheetPackId, setPublishingWorksheetPackId] = useState('');
    const [downloadingWorksheetPackId, setDownloadingWorksheetPackId] = useState('');
    const [printingWorksheetPackId, setPrintingWorksheetPackId] = useState('');

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

    const loadWorksheetPacks = useCallback(async ({ classId, standardId } = {}) => {
        if (!classId || !standardId) {
            setWorksheetPacks([]);
            return;
        }

        setWorksheetPacksLoading(true);
        try {
            const result = await studentGroupingService.listWorksheetPacks({
                classId,
                standardId,
                academicYear,
                page: 1,
                limit: 20
            });
            setWorksheetPacks(result.items || []);
        } catch (packError) {
            setWorksheetPacks([]);
            toast.error(packError?.response?.data?.message || 'Failed to load worksheet packs.');
        } finally {
            setWorksheetPacksLoading(false);
        }
    }, [academicYear]);

    useEffect(() => {
        if (!selectedClassId || !selectedStandardId) {
            setWorksheetPacks([]);
            return;
        }

        loadWorksheetPacks({
            classId: selectedClassId,
            standardId: selectedStandardId
        });
    }, [selectedClassId, selectedStandardId, loadWorksheetPacks]);

    const handleClassChange = useCallback((classId) => {
        setSelectedClassId(classId);
        setSelectedSubjectId('');
        setSelectedStandardId('');
        setView('overview');
        setHistoryPage(1);
        setHistoryReportType('');
        setWorksheetPacks([]);
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleSubjectChange = useCallback((subjectId) => {
        setSelectedSubjectId(subjectId);
        setSelectedStandardId('');
        setView('overview');
        setHistoryPage(1);
        setWorksheetPacks([]);
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleStandardClick = useCallback((standardId) => {
        setSelectedStandardId(standardId);
        setView('detail');
    }, []);

    const handleBackToOverview = useCallback(() => {
        setSelectedStandardId('');
        setView('overview');
        setWorksheetPacks([]);
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

    const handleCreateWorksheetPackDraft = useCallback(async () => {
        if (!selectedClassId || !selectedStandardId || !academicYear) return;

        setCreatingWorksheetPack(true);
        try {
            await studentGroupingService.createWorksheetPackDraft({
                classId: selectedClassId,
                standardId: selectedStandardId,
                academicYear
            });
            toast.success('Worksheet pack draft created.');
            await loadWorksheetPacks({
                classId: selectedClassId,
                standardId: selectedStandardId
            });
        } catch (packError) {
            toast.error(packError?.response?.data?.message || 'Failed to create worksheet pack draft.');
        } finally {
            setCreatingWorksheetPack(false);
        }
    }, [selectedClassId, selectedStandardId, academicYear, loadWorksheetPacks]);

    const handleEndWorksheetPackAuthoring = useCallback(async (packId) => {
        if (!packId) return;

        setEndingWorksheetPackId(packId);
        try {
            await studentGroupingService.endWorksheetPackAuthoring({ packId });
            toast.success('Authoring ended. Distribution actions are now enabled.');
            await loadWorksheetPacks({
                classId: selectedClassId,
                standardId: selectedStandardId
            });
        } catch (packError) {
            toast.error(packError?.response?.data?.message || 'Failed to end authoring.');
        } finally {
            setEndingWorksheetPackId('');
        }
    }, [selectedClassId, selectedStandardId, loadWorksheetPacks]);

    const handlePublishWorksheetPack = useCallback(async (packId) => {
        if (!packId) return;

        setPublishingWorksheetPackId(packId);
        try {
            await studentGroupingService.publishWorksheetPack({ packId });
            toast.success('Worksheet pack published.');
            await loadWorksheetPacks({
                classId: selectedClassId,
                standardId: selectedStandardId
            });
        } catch (packError) {
            toast.error(packError?.response?.data?.message || 'Failed to publish worksheet pack.');
        } finally {
            setPublishingWorksheetPackId('');
        }
    }, [selectedClassId, selectedStandardId, loadWorksheetPacks]);

    const handleDownloadWorksheetPack = useCallback(async (packId) => {
        if (!packId) return;

        setDownloadingWorksheetPackId(packId);
        try {
            await studentGroupingService.downloadWorksheetPackPdf({ packId });
        } catch (packError) {
            toast.error(packError?.response?.data?.message || 'Failed to download worksheet pack.');
        } finally {
            setDownloadingWorksheetPackId('');
        }
    }, []);

    const handlePrintWorksheetPack = useCallback(async (packId) => {
        if (!packId) return;

        setPrintingWorksheetPackId(packId);
        try {
            await studentGroupingService.printWorksheetPackPdf({ packId });
        } catch (packError) {
            toast.error(packError?.response?.data?.message || 'Failed to print worksheet pack.');
        } finally {
            setPrintingWorksheetPackId('');
        }
    }, []);

    const handleRefreshWorksheetPacks = useCallback(() => {
        if (!selectedClassId || !selectedStandardId) return;
        loadWorksheetPacks({
            classId: selectedClassId,
            standardId: selectedStandardId
        });
    }, [selectedClassId, selectedStandardId, loadWorksheetPacks]);

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
        worksheetPacks,
        worksheetPacksLoading,
        creatingWorksheetPack,
        endingWorksheetPackId,
        publishingWorksheetPackId,
        downloadingWorksheetPackId,
        printingWorksheetPackId,
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
        handleRefreshHistory,
        handleCreateWorksheetPackDraft,
        handleEndWorksheetPackAuthoring,
        handlePublishWorksheetPack,
        handleDownloadWorksheetPack,
        handlePrintWorksheetPack,
        handleRefreshWorksheetPacks
    };
};

export default useStudentGrouping;
