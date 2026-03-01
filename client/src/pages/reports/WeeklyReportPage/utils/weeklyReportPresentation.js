import { format, startOfWeek, endOfWeek } from 'date-fns';
import {
    DATE_INPUT_FORMAT,
    LESSON_DATE_FORMAT,
    WEEK_RANGE_END_FORMAT,
    WEEK_RANGE_FORMAT,
    WEEK_STARTS_ON
} from '../constants';

export const getWeekRange = (selectedWeek) => {
    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
    const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

    return { weekStart, weekEnd };
};

export const getWeeklyLessons = ({ lessons = [], weekStart, weekEnd }) => {
    return lessons.filter((lesson) => {
        const lessonDate = new Date(lesson.date);
        return lessonDate >= weekStart && lessonDate <= weekEnd;
    });
};

export const formatDateInputValue = (dateValue) => {
    return format(dateValue, DATE_INPUT_FORMAT);
};

export const formatWeekRangeLabel = ({ weekStart, weekEnd }) => {
    return `${format(weekStart, WEEK_RANGE_FORMAT)} - ${format(weekEnd, WEEK_RANGE_END_FORMAT)}`;
};

export const formatLessonDate = (dateValue) => {
    return format(new Date(dateValue), LESSON_DATE_FORMAT);
};

export const getStudentParentEmail = (student) => {
    return student?.parentInfo?.fatherEmail || student?.email || '-';
};
