import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser } from '../../../../../store/slices/authSlice';
import { fetchClasses, selectClasses } from '../../../../../store/slices/classSlice';
import { fetchStudents, selectStudents } from '../../../../../store/slices/studentSlice';
import { selectCurrentAcademicYear } from '../../../../../store/slices/uiSlice';
import {
    fetchDashboardStats,
    selectDashboardStats,
    selectDashboardLoading,
    selectDashboardError,
} from '../../../../../store/slices/dashboardSlice';
import api from '../../../../../config/api';
import {
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineUsers,
    HiOutlineCheckCircle,
} from 'react-icons/hi';

/**
 * Fetches and exposes all data for the School Admin Dashboard.
 * Preserves original API calls, Redux selectors/actions, and derived data.
 */
export function useSchoolAdminDashboardData() {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const classes = useSelector(selectClasses);
    const students = useSelector(selectStudents);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const dashboardStats = useSelector(selectDashboardStats);
    const loading = useSelector(selectDashboardLoading);
    const error = useSelector(selectDashboardError);

    const [teachers, setTeachers] = useState([]);
    const [attendanceSummary, setAttendanceSummary] = useState(null);
    const [loadingAdditional, setLoadingAdditional] = useState(true);

    const fetchAdditionalData = async () => {
        try {
            setLoadingAdditional(true);
            const [teachersResult, attendanceResult] = await Promise.allSettled([
                api.get('/users', { params: { role: 'teacher', limit: 100 } }),
                api.get('/attendance/admin', { params: { viewMode: 'today' } }),
            ]);

            if (teachersResult.status === 'fulfilled') {
                const teachersRes = teachersResult.value;
                if (teachersRes.data.success) {
                    setTeachers(teachersRes.data.data?.users || []);
                } else {
                    setTeachers([]);
                }
            } else {
                setTeachers([]);
                console.error('Error fetching teachers:', teachersResult.reason);
            }

            if (attendanceResult.status === 'fulfilled') {
                const attendanceRes = attendanceResult.value;
                const attendancePayload = attendanceRes.data?.data || attendanceRes.data || {};
                const records = attendancePayload.attendanceRecords || [];
                const totalStudents = records.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
                const totalPresent = records.reduce((sum, r) => sum + (r.present || 0), 0);
                const totalAbsent = records.reduce((sum, r) => sum + (r.absent || 0), 0);
                const attendanceRate =
                    totalStudents > 0 ? Number(((totalPresent / totalStudents) * 100).toFixed(1)) : 0;
                setAttendanceSummary({
                    totalClasses: records.length,
                    totalStudents,
                    totalPresent,
                    totalAbsent,
                    attendanceRate,
                });
            } else {
                setAttendanceSummary(null);
                console.error('Error fetching attendance summary:', attendanceResult.reason);
            }
        } finally {
            setLoadingAdditional(false);
        }
    };

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchStudents({ limit: 10 }));
        dispatch(fetchDashboardStats(academicYear));
        fetchAdditionalData();
    }, [dispatch, academicYear]);

    const todayLabel = useMemo(
        () =>
            new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }).format(new Date()),
        []
    );

    const classDistributionData = useMemo(() => {
        const fromStats = Array.isArray(dashboardStats?.classDistribution)
            ? dashboardStats.classDistribution
            : [];
        if (fromStats.length > 0) {
            return fromStats.map((item) => ({
                name: item.name?.substring(0, 18) || 'Class',
                students: Number(item.students) || 0,
            }));
        }
        return classes
            .slice(0, 12)
            .map((cls) => ({
                name: cls.name?.substring(0, 18) || 'Class',
                students: cls.studentCount || 0,
            }))
            .filter((item) => item.students > 0);
    }, [classes, dashboardStats]);

    const performanceTrendData = useMemo(() => {
        const fromStats = Array.isArray(dashboardStats?.performanceTrend)
            ? dashboardStats.performanceTrend
            : [];
        if (fromStats.length > 0) {
            return fromStats.map((item) => ({
                month: item.month,
                average: Number(item.average) || 0,
            }));
        }
        return [];
    }, [dashboardStats]);

    const stats = useMemo(
        () => [
            {
                title: 'Total Students',
                value: dashboardStats.totalStudents || students.length || 0,
                icon: HiOutlineUserGroup,
                color: 'primary',
                change: dashboardStats.changes?.students || '+0%',
            },
            {
                title: 'Total Classes',
                value: dashboardStats.totalClasses || classes.length || 0,
                icon: HiOutlineAcademicCap,
                color: 'purple',
                change: dashboardStats.changes?.classes || '+0%',
            },
            {
                title: 'Teachers',
                value: teachers.length || 0,
                icon: HiOutlineUsers,
                color: 'blue',
                subtitle: `${teachers.filter((t) => t.status === 'active').length} active`,
            },
            {
                title: 'Attendance Rate',
                value: Number.isFinite(attendanceSummary?.attendanceRate)
                    ? `${attendanceSummary.attendanceRate}%`
                    : 'N/A',
                icon: HiOutlineCheckCircle,
                color: 'green',
                subtitle: attendanceSummary
                    ? `${attendanceSummary.totalPresent}/${attendanceSummary.totalStudents} today`
                    : 'No data',
            },
        ],
        [dashboardStats, students.length, classes.length, teachers, attendanceSummary]
    );

    const isLoading = loading || loadingAdditional;

    const retry = () => {
        dispatch(fetchDashboardStats(academicYear));
        fetchAdditionalData();
    };

    return {
        user,
        todayLabel,
        stats,
        classDistributionData,
        performanceTrendData,
        students,
        classes,
        attendanceSummary,
        loading: isLoading,
        error,
        retry,
    };
}
