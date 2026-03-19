import { PERMISSIONS } from '../../../constants/permissions';

export const MAX_SHORTCUTS = 10;

export const SHORTCUT_CANDIDATES = [
    { path: '/portal/dashboard', labelKey: 'dashboard' },
    { path: '/portal/classes', labelKey: 'classes', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/students', labelKey: 'students', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/assignments', labelKey: 'assignments', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/gradebook', labelKey: 'gradebook', roles: ['admin', 'teacher', 'department_principal'] },
    {
        path: '/portal/standards/gradebook',
        labelKey: 'standardsGradebook',
        roles: ['admin', 'teacher', 'department_principal'],
        feature: 'standardsPractice'
    },
    { path: '/portal/attendance', labelKey: 'attendance', roles: ['admin', 'department_principal'] },
    { path: '/portal/notifications', labelKey: 'notifications' },
    {
        path: '/portal/messages',
        labelKey: 'messages',
        roles: ['admin', 'teacher', 'department_principal', 'staff']
    },
    {
        path: '/portal/email-composer',
        labelKey: 'emailComposer',
        roles: ['admin', 'teacher', 'department_principal', 'staff'],
        permissions: [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS]
    },
    {
        path: '/portal/sbr/generate',
        labelKey: 'sbrGenerate',
        roles: ['admin', 'teacher'],
        permissions: [PERMISSIONS.GENERATE_SBR_REPORTS]
    },
    { path: '/portal/my-grades', labelKey: 'myGrades', roles: ['student'] },
    { path: '/portal/practice', labelKey: 'practice', roles: ['student'] },
    {
        path: '/portal/academic-excellence',
        labelKey: 'academicExcellence',
        roles: ['student'],
        feature: 'academicIntelligence'
    },
    { path: '/portal/settings', labelKey: 'settings' }
];
