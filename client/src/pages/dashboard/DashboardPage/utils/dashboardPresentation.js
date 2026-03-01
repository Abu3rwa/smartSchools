import { DASHBOARD_STAT_CONFIG } from '../constants';

export const isPositiveChange = (changeValue = '') => {
    return String(changeValue).startsWith('+');
};

const getStatValue = ({ key, dashboardStats, classes, students }) => {
    if (key === 'totalStudents') {
        return dashboardStats.totalStudents || students.length || 0;
    }

    if (key === 'totalClasses') {
        return dashboardStats.totalClasses || classes.length || 0;
    }

    if (key === 'totalGrades') {
        return dashboardStats.totalGrades?.toLocaleString() || '0';
    }

    if (key === 'avgPerformance') {
        return dashboardStats.avgPerformance || '0%';
    }

    return 0;
};

export const buildDashboardStats = ({ dashboardStats = {}, classes = [], students = [] }) => {
    return DASHBOARD_STAT_CONFIG.map((config) => ({
        ...config,
        value: getStatValue({ key: config.key, dashboardStats, classes, students }),
        change: dashboardStats.changes?.[config.changeKey] || '+0%'
    }));
};
