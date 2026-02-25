import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTeachers } from '../../../../../store/slices/teacherSlice';
import { fetchClasses } from '../../../../../store/slices/classSlice';
import { fetchSubjects } from '../../../../../store/slices/subjectSlice';
import attendanceService from '../../../../../services/attendanceService';
import { ATTENDANCE_STATUS_COLORS, DEFAULT_FILTERS, VIEW_MODES } from '../constants';
import {
    formatDateTime,
    formatTime,
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
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to load attendance');
        } finally {
            setLoading(false);
        }
    }, [currentDate, filters, viewMode]);

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
            setError(err.response?.data?.message || err.message || 'Export failed');
        }
    }, [currentDate, filters.class, filters.subject, filters.teacher, viewMode]);

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

    const stats = useMemo(() => getAttendanceStats(attendanceData), [attendanceData]);
    const statusChartData = useMemo(
        () => buildStatusChartData(stats, ATTENDANCE_STATUS_COLORS),
        [stats]
    );
    const dateRangeText = useMemo(() => getDateRangeText(currentDate, viewMode), [currentDate, viewMode]);
    const hasActiveFilters = Boolean(filters.teacher || filters.class || filters.subject || filters.status);

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
