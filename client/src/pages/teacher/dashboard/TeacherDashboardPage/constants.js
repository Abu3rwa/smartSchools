import {
    HiOutlineBell,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineUsers
} from 'react-icons/hi';

export const QUICK_ACTIONS = [
    { labelKey: 'quickActions.enterGrades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
    { labelKey: 'quickActions.lessonPlans', path: '/portal/lessons', icon: HiOutlineDocumentText },
    { labelKey: 'quickActions.myTimetable', path: '/portal/my-timetable', icon: HiOutlineClock },
    { labelKey: 'quickActions.myAttendance', path: '/portal/my-attendance', icon: HiOutlineUsers },
    { labelKey: 'quickActions.newsletters', path: '/portal/newsletters', icon: HiOutlineBell }
];
