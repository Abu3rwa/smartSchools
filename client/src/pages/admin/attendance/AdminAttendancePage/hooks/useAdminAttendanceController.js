import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchTeachers } from '../../../../../store/slices/teacherSlice';
import { fetchClasses } from '../../../../../store/slices/classSlice';
import { fetchSubjects } from '../../../../../store/slices/subjectSlice';
import attendanceService from '../../../../../services/attendanceService';
import { ATTENDANCE_STATUS_COLORS, DEFAULT_FILTERS, VIEW_MODES } from '../constants';
import {
    formatDate as formatDateValue,
    formatDateTime as formatDateTimeValue,
    formatTime as formatTimeValue,
    getDateRangeForViewMode,
    getDateRangeText,
    navigateDateByViewMode
} from '../utils/attendanceDateRange';
import {
    buildStatusChartData,
    getAttendanceStats,
    mapRecordToUI
} from '../utils/attendancePresentation';

const INITIAL_VIEW_MODE = VIEW_MODES.TODAY;

export default function useAdminAttendanceController() {
    const { t, i18n } = useTranslation(['adminAttendance']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
    const dispatch = useDispatch();
    const teachers = useSelector((state) => state.teachers.teachers) || [];
    const classes = useSelector((state) => state.classes.classes) || [];
    const subjects = useSelector((state) => state.subjects.subjects) || [];

    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedAttendance, setSelectedAttendance] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [viewMode, setViewMode] = useState(INITIAL_VIEW_MODE);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [pendingSummary, setPendingSummary] = useState({
        pendingToday: 0,
        pendingOverall: 0
    });

    useEffect(() => {
        dispatch(fetchTeachers());
        dispatch(fetchClasses());
        dispatch(fetchSubjects());
    }, [dispatch]);

    const fetchAttendanceData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const { startDate, endDate } = getDateRangeForViewMode(currentDate, viewMode);
            const params = {
                viewMode: 'range',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                ...(filters.teacher && { teacher: filters.teacher }),
                ...(filters.class && { class: filters.class }),
                ...(filters.subject && { subject: filters.subject }),
                ...(filters.status && { status: filters.status })
            };

            const res = await attendanceService.getAdminAttendance(params);
            const records = res?.attendanceRecords ?? [];
            setAttendanceData(records.map(mapRecordToUI));
            setPendingSummary({
                pendingToday: Number(res?.summary?.pendingToday ?? 0),
                pendingOverall: Number(res?.summary?.pendingOverall ?? 0)
            });
        } catch (err) {
            setError(err.response?.data?.message || err.message || t('adminAttendance:error.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [currentDate, filters, viewMode, t]);

    useEffect(() => {
        fetchAttendanceData();
    }, [fetchAttendanceData]);

    const handleExport = useCallback(async () => {
        try {
            const { startDate, endDate } = getDateRangeForViewMode(currentDate, viewMode);
            const params = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                format: 'csv',
                ...(filters.teacher && { teacher: filters.teacher }),
                ...(filters.class && { class: filters.class }),
                ...(filters.subject && { subject: filters.subject })
            };

            const blob = await attendanceService.exportAttendanceData(params);
            const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute(
                'download',
                `attendance_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err.response?.data?.message || err.message || t('adminAttendance:error.exportFailed'));
        }
    }, [currentDate, filters.class, filters.subject, filters.teacher, viewMode, t]);

    const handleViewDetails = useCallback((attendanceRecord) => {
        setSelectedAttendance(attendanceRecord);
        setShowDetailsModal(true);
    }, []);

    const closeDetailsModal = useCallback(() => {
        setShowDetailsModal(false);
    }, []);

    const clearFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const navigateDate = useCallback((direction) => {
        setCurrentDate((prev) => navigateDateByViewMode(prev, viewMode, direction));
    }, [viewMode]);

    const baseStats = useMemo(() => getAttendanceStats(attendanceData), [attendanceData]);
    const stats = useMemo(() => ({
        ...baseStats,
        pendingToday: pendingSummary.pendingToday,
        pendingOverall: pendingSummary.pendingOverall
    }), [baseStats, pendingSummary.pendingOverall, pendingSummary.pendingToday]);
    const statusChartData = useMemo(
        () => buildStatusChartData(stats, ATTENDANCE_STATUS_COLORS),
        [stats]
    );
    const dateRangeText = useMemo(() => getDateRangeText(currentDate, viewMode, locale), [currentDate, viewMode, locale]);
    const hasActiveFilters = Boolean(filters.teacher || filters.class || filters.subject || filters.status);
    const formatDateTime = useCallback((date) => formatDateTimeValue(date, locale), [locale]);
    const formatTime = useCallback((date) => formatTimeValue(date, locale), [locale]);
    const formatDate = useCallback((date) => formatDateValue(date, locale), [locale]);

    return {
        attendanceData,
        classes,
        clearFilters,
        closeDetailsModal,
        currentDate,
        dateRangeText,
        error,
        fetchAttendanceData,
        filters,
        formatDateTime,
        formatDate,
        formatTime,
        handleExport,
        handleViewDetails,
        hasActiveFilters,
        loading,
        navigateDate,
        selectedAttendance,
        setFilters,
        setViewMode,
        showDetailsModal,
        stats,
        statusChartData,
        subjects,
        teachers,
        viewMode
    };
}
