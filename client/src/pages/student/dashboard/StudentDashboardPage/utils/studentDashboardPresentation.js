import { MAX_ASSIGNMENTS_DISPLAY } from '../constants';

export const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export const formatTime12h = (timeValue) => {
    if (!timeValue || typeof timeValue !== 'string') return null;
    const match = timeValue.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hour = Number.parseInt(match[1], 10);
    const minute = match[2];
    if (hour < 0 || hour > 23) return null;

    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour < 12 ? 'AM' : 'PM';

    return `${hour12}:${minute} ${ampm}`;
};

export const getTodayStart = () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return todayStart;
};

export const formatDueDate = (dueDate, todayStart) => {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    if (due.getTime() === todayStart.getTime()) {
        return 'Due today';
    }

    return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const buildUpcomingPracticeDueItems = (assignments = [], todayStart) => {
    return assignments
        .filter((assignment) => assignment.dueDate && !assignment.mastery?.isMastered)
        .map((assignment) => ({
            ...assignment,
            source: 'practice',
            id: assignment._id,
            due: new Date(assignment.dueDate)
        }))
        .filter((assignment) => {
            const dueStart = new Date(assignment.due);
            dueStart.setHours(0, 0, 0, 0);
            return dueStart >= todayStart;
        });
};

const buildUpcomingClassDueItems = (classAssignments = [], todayStart) => {
    return classAssignments
        .filter((assignment) => assignment?.dueDate)
        .map((assignment) => ({
            ...assignment,
            source: 'class_assignment',
            id: assignment?.id || assignment?._id,
            due: new Date(assignment.dueDate)
        }))
        .filter((assignment) => {
            const dueStart = new Date(assignment.due);
            dueStart.setHours(0, 0, 0, 0);
            return dueStart >= todayStart;
        });
};

export const getUpcomingAssignments = (practiceAssignments = [], classAssignments = [], todayStart) => {
    const upcomingPractice = buildUpcomingPracticeDueItems(practiceAssignments, todayStart);
    const upcomingClass = buildUpcomingClassDueItems(classAssignments, todayStart);

    return [...upcomingPractice, ...upcomingClass]
        .sort((a, b) => a.due - b.due)
        .slice(0, MAX_ASSIGNMENTS_DISPLAY);
};
