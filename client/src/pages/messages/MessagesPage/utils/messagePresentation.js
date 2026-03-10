import { format } from 'date-fns';
import { MESSAGE_DATE_FORMAT, MESSAGE_GROUP_DAY_MS } from '../constants';

const getStartOfLocalDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const formatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, MESSAGE_DATE_FORMAT);
};

export const formatStudentNames = (studentNames) => {
    if (!Array.isArray(studentNames) || studentNames.length === 0) return '';
    return studentNames.join(', ');
};

export const formatClassLabel = (classOption, t) => {
    if (!classOption) return t('messages:compose.classFallback');
    if (classOption.label) return classOption.label;

    const parts = [];
    if (classOption.name) parts.push(classOption.name);
    if (classOption.grade != null) {
        parts.push(t('messages:compose.gradeLabel', { grade: classOption.grade }));
    }
    if (classOption.section) parts.push(classOption.section);
    return parts.join(' · ') || t('messages:compose.classFallback');
};

export const groupMessagesByAge = (messages = []) => {
    const today = [];
    const yesterday = [];
    const older = [];
    const todayStart = getStartOfLocalDay(new Date());
    if (!todayStart) {
        return { today, yesterday, older };
    }

    for (const message of messages) {
        const messageStart = getStartOfLocalDay(message?.createdAt);
        if (!messageStart) {
            older.push(message);
            continue;
        }

        const diffDays = Math.floor((todayStart.getTime() - messageStart.getTime()) / MESSAGE_GROUP_DAY_MS);
        if (diffDays <= 0) {
            today.push(message);
            continue;
        }
        if (diffDays === 1) {
            yesterday.push(message);
            continue;
        }
        older.push(message);
    }

    return { today, yesterday, older };
};
