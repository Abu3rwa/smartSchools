import {
    HiOutlineAcademicCap,
    HiOutlineBell,
    HiOutlineChartBar,
    HiOutlineClipboardList,
    HiOutlineTrendingUp,
    HiOutlineUserGroup
} from 'react-icons/hi';

export const DASHBOARD_STAT_CONFIG = [
    {
        key: 'totalStudents',
        changeKey: 'students',
        titleKey: 'stats.totalStudents',
        icon: HiOutlineUserGroup,
        color: 'primary'
    },
    {
        key: 'totalClasses',
        changeKey: 'classes',
        titleKey: 'stats.totalClasses',
        icon: HiOutlineAcademicCap,
        color: 'purple'
    },
    {
        key: 'totalGrades',
        changeKey: 'grades',
        titleKey: 'stats.totalGrades',
        icon: HiOutlineClipboardList,
        color: 'emerald'
    },
    {
        key: 'avgPerformance',
        changeKey: 'performance',
        titleKey: 'stats.avgPerformance',
        icon: HiOutlineTrendingUp,
        color: 'amber'
    }
];

export const DASHBOARD_QUICK_ACTIONS = [
    { labelKey: 'quickActions.enterGrades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
    { labelKey: 'quickActions.viewClasses', path: '/portal/classes', icon: HiOutlineAcademicCap },
    { labelKey: 'quickActions.sendReports', path: '/portal/notifications', icon: HiOutlineBell },
    { labelKey: 'quickActions.viewAnalytics', path: '/portal/students', icon: HiOutlineChartBar }
];
