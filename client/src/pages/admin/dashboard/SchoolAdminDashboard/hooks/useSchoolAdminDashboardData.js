import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../../../../config/api';
import { selectUser } from '../../../../../store/slices/authSlice';
import { selectCurrentAcademicYear, selectLanguage } from '../../../../../store/slices/uiSlice';
import {
    buildAttendanceSegments,
    formatCount,
    formatDelta,
    formatMonthKeyLabel,
    formatPercent,
} from '../utils/schoolAdminDashboardPresentation.js';

/**
 * Loads the whole admin dashboard from a single aggregated endpoint.
 * Sheet-level data (classes, subjects, teachers) already comes from MainLayout.
 */
export function useSchoolAdminDashboardData() {
    const { t } = useTranslation(['adminDashboard']);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const language = useSelector(selectLanguage);

    const [result, setResult] = useState({ key: null, summary: null, error: null });
    const [reloadToken, setReloadToken] = useState(0);

    const requestKey = `${academicYear || 'current'}|${reloadToken}`;

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        api.get('/dashboard/school-admin', {
            params: {
                ...(academicYear ? { academicYear } : {}),
                ...(reloadToken > 0 ? { refresh: 1 } : {}),
            },
            signal: controller.signal,
        })
            .then((response) => {
                if (cancelled) return;
                setResult({
                    key: requestKey,
                    summary: response.data?.data || null,
                    error: null,
                });
            })
            .catch((requestError) => {
                if (cancelled || requestError.code === 'ERR_CANCELED') return;
                setResult({
                    key: requestKey,
                    summary: null,
                    error: requestError.response?.data?.message || requestError.message,
                });
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [requestKey, academicYear, reloadToken]);

    // A key mismatch means a request is in flight; stale data stays visible meanwhile.
    const loading = result.key !== requestKey;
    const summary = result.summary;
    const error = loading ? null : result.error;

    const locale = language === 'ar' ? 'ar' : 'en';

    const todayLabel = useMemo(
        () =>
            new Intl.DateTimeFormat(locale, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }).format(new Date()),
        [locale]
    );

    const stats = useMemo(() => {
        if (!summary) return [];
        const { students, classes, teachers, attendance } = summary;
        return [
            {
                key: 'students',
                label: t('adminDashboard:stats.totalStudents'),
                value: formatCount(students.total, locale),
                meta: t('adminDashboard:metrics.newThisMonth', {
                    newCount: formatDelta(students.newThisMonth),
                }),
            },
            {
                key: 'classes',
                label: t('adminDashboard:stats.totalClasses'),
                value: formatCount(classes.total, locale),
                meta: t('adminDashboard:metrics.newThisMonth', {
                    newCount: formatDelta(classes.newThisMonth),
                }),
            },
            {
                key: 'teachers',
                label: t('adminDashboard:stats.teachers'),
                value: formatCount(teachers.total, locale),
                meta: t('adminDashboard:metrics.activeTeachers', {
                    activeCount: formatCount(teachers.active, locale),
                }),
            },
            {
                key: 'attendance',
                label: t('adminDashboard:stats.attendanceRate'),
                value: formatPercent(attendance.rate) || t('adminDashboard:common.noDataShort'),
                meta: attendance.totalStudents > 0
                    ? t('adminDashboard:metrics.presentOf', {
                        presentCount: formatCount(attendance.present, locale),
                        totalCount: formatCount(attendance.totalStudents, locale),
                    })
                    : t('adminDashboard:metrics.noAttendance'),
            },
        ];
    }, [summary, t, locale]);

    const performanceTrend = useMemo(
        () =>
            (summary?.performanceTrend || []).map((point) => ({
                monthKey: point.monthKey,
                label: formatMonthKeyLabel(point.monthKey, locale),
                average: point.average,
            })),
        [summary, locale]
    );

    const attendanceSegments = useMemo(
        () => buildAttendanceSegments(summary?.attendance),
        [summary]
    );

    const classDistribution = summary?.classDistribution || [];
    const recentStudents = summary?.recentStudents || [];
    const hasData = Boolean(summary);

    const retry = () => setReloadToken((token) => token + 1);

    return {
        user,
        academicYear,
        locale,
        todayLabel,
        stats,
        attendance: summary?.attendance || null,
        attendanceSegments,
        classDistribution,
        performanceTrend,
        recentStudents,
        loading,
        error,
        retry,
        hasData,
        showInitialSkeleton: loading && !hasData,
    };
}
