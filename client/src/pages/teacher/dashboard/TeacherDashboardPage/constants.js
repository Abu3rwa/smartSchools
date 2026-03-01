import {
    HiOutlineBell,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineUsers
} from 'react-icons/hi';

export const QUICK_ACTIONS = [
    { label: 'Enter Grades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
    { label: 'Lesson Plans', path: '/portal/lessons', icon: HiOutlineDocumentText },
    { label: 'My Timetable', path: '/portal/my-timetable', icon: HiOutlineClock },
    { label: 'My Attendance', path: '/portal/my-attendance', icon: HiOutlineUsers },
    { label: 'Newsletters', path: '/portal/newsletters', icon: HiOutlineBell }
];
