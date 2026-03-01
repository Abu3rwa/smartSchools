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
        title: 'Total Students',
        icon: HiOutlineUserGroup,
        color: 'primary'
    },
    {
        key: 'totalClasses',
        changeKey: 'classes',
        title: 'Total Classes',
        icon: HiOutlineAcademicCap,
        color: 'purple'
    },
    {
        key: 'totalGrades',
        changeKey: 'grades',
        title: 'Grades Entered',
        icon: HiOutlineClipboardList,
        color: 'emerald'
    },
    {
        key: 'avgPerformance',
        changeKey: 'performance',
        title: 'Avg. Performance',
        icon: HiOutlineTrendingUp,
        color: 'amber'
    }
];

export const DASHBOARD_QUICK_ACTIONS = [
    { label: 'Enter Grades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
    { label: 'View Classes', path: '/portal/classes', icon: HiOutlineAcademicCap },
    { label: 'Send Reports', path: '/portal/notifications', icon: HiOutlineBell },
    { label: 'View Analytics', path: '/portal/students', icon: HiOutlineChartBar }
];
