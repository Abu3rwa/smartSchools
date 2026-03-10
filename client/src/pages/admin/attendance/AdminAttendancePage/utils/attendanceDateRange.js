import { VIEW_MODES } from '../constants';

export function getDateRangeForViewMode(currentDate, viewMode) {
    const today = new Date(currentDate);
    let startDate;
    let endDate;

    if (viewMode === VIEW_MODES.TODAY) {
        startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
    } else if (viewMode === VIEW_MODES.WEEK) {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startDate = new Date(startOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startOfWeek);
        endDate.setDate(startOfWeek.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
    } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
}

export function navigateDateByViewMode(currentDate, viewMode, direction) {
    const newDate = new Date(currentDate);

    if (viewMode === VIEW_MODES.TODAY) {
        newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
    } else if (viewMode === VIEW_MODES.WEEK) {
        newDate.setDate(newDate.getDate() + (direction === 'prev' ? -7 : 7));
    } else {
        newDate.setMonth(newDate.getMonth() + (direction === 'prev' ? -1 : 1));
    }

    return newDate;
}

export function getDateRangeText(currentDate, viewMode, locale = undefined) {
    const today = new Date(currentDate);

    if (viewMode === VIEW_MODES.TODAY) {
        return today.toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    if (viewMode === VIEW_MODES.WEEK) {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${startOfWeek.toLocaleDateString(locale)} - ${endOfWeek.toLocaleDateString(locale)}`;
    }

    return today.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function formatDateTime(date, locale = undefined) {
    return new Date(date).toLocaleString(locale);
}

export function formatTime(date, locale = undefined) {
    return new Date(date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date, locale = undefined) {
    return new Date(date).toLocaleDateString(locale);
}
