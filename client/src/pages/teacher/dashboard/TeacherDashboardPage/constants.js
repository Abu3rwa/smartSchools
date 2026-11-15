import {
    HiOutlineBell,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineUsers
} from 'react-icons/hi';

export const TONE_VAR = {
    teal: 'var(--td-teal)',
    blue: 'var(--td-blue)',
    purple: 'var(--td-purple)',
    amber: 'var(--td-amber)',
    pink: 'var(--td-pink)',
    cyan: 'var(--td-cyan)',
    emerald: 'var(--td-emerald)',
    red: 'var(--td-red)'
};

export const SLOT_TONES = ['teal', 'blue', 'purple', 'amber', 'pink', 'cyan'];

export const toneVar = (tone) => TONE_VAR[tone] || TONE_VAR.teal;

export const QUICK_ACTIONS = [
    { labelKey: 'quickActions.enterGrades', path: '/portal/grades/entry', icon: HiOutlineClipboardList, tone: 'teal' },
    { labelKey: 'quickActions.lessonPlans', path: '/portal/lessons', icon: HiOutlineDocumentText, tone: 'purple' },
    { labelKey: 'quickActions.myTimetable', path: '/portal/my-timetable', icon: HiOutlineClock, tone: 'blue' },
    { labelKey: 'quickActions.myAttendance', path: '/portal/my-attendance', icon: HiOutlineUsers, tone: 'amber' },
    { labelKey: 'quickActions.newsletters', path: '/portal/newsletters', icon: HiOutlineBell, tone: 'pink' }
];