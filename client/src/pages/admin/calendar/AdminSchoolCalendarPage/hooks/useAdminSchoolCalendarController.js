import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addMonths, format, isSameDay, startOfMonth } from 'date-fns';
import { alpha } from '@mui/material/styles';
import { selectUser } from '../../../../../store/slices/authSlice';
import {
    buildCalendarMonthCacheKey,
    buildCalendarUpcomingCacheKey,
    cancelCalendarEvent,
    clearCalendarError,
    createCalendarEvent,
    fetchCalendarMonthEvents,
    fetchCalendarNotificationPreferences,
    fetchUpcomingCalendarEvents,
    selectCalendarError,
    selectCalendarMutationLoading,
    selectCalendarPreferences,
    selectMonthEventsEntry,
    selectMonthEventsLoading,
    selectUpcomingEventsEntry,
    selectUpcomingEventsLoading,
    updateCalendarEvent,
    updateCalendarNotificationPreferences
} from '../../../../../store/slices/calendarSlice';
import schoolCalendarService from '../../../../../services/schoolCalendarService';
import { CALENDAR_OBJECT_ID_PATTERN } from '../constants';
import {
    buildCalendarMonthGrid,
    calendarEventIntersectsDay,
    canUserManageCalendar,
    createDefaultCalendarEventForm,
    mergeAudienceOptions,
    resolveCalendarCategoryStyles,
    toAudienceOption,
    toDateInputValue
} from '../utils/calendarPresentation';

const useAdminSchoolCalendarController = (theme) => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);

    const canManage = canUserManageCalendar(user);
    const categoryStyles = useMemo(() => resolveCalendarCategoryStyles(theme), [theme]);

    const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [formState, setFormState] = useState(createDefaultCalendarEventForm(new Date()));
    const [formError, setFormError] = useState('');
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [menuEvent, setMenuEvent] = useState(null);
    const [audienceUserOptions, setAudienceUserOptions] = useState([]);
    const [audienceUserSearch, setAudienceUserSearch] = useState('');
    const [audienceUserLoading, setAudienceUserLoading] = useState(false);

    const calendarError = useSelector(selectCalendarError);
    const mutationLoading = useSelector(selectCalendarMutationLoading);
    const preferences = useSelector(selectCalendarPreferences);

    const monthRange = useMemo(() => {
        const startUtc = new Date(Date.UTC(
            currentMonth.getFullYear(),
            currentMonth.getMonth(),
            1,
            0,
            0,
            0,
            0
        ));
        const endUtc = new Date(Date.UTC(
            currentMonth.getFullYear(),
            currentMonth.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
        ));
        return {
            from: startUtc.toISOString(),
            to: endUtc.toISOString()
        };
    }, [currentMonth]);

    const monthCacheKey = useMemo(() => buildCalendarMonthCacheKey({
        from: monthRange.from,
        to: monthRange.to,
        category: activeFilter
    }), [monthRange.from, monthRange.to, activeFilter]);

    const upcomingCacheKey = useMemo(() => buildCalendarUpcomingCacheKey({
        category: activeFilter,
        limit: 15
    }), [activeFilter]);

    const monthEntry = useSelector((state) => selectMonthEventsEntry(state, monthCacheKey));
    const monthLoading = useSelector((state) => selectMonthEventsLoading(state, monthCacheKey));
    const upcomingEntry = useSelector((state) => selectUpcomingEventsEntry(state, upcomingCacheKey));
    const upcomingLoading = useSelector((state) => selectUpcomingEventsLoading(state, upcomingCacheKey));

    const monthEvents = monthEntry?.items || [];
    const upcomingEvents = upcomingEntry?.items || [];
    const monthGridCells = useMemo(() => buildCalendarMonthGrid(currentMonth), [currentMonth]);

    const dayStylesByKey = useMemo(() => {
        const dayStyleMap = new Map();
        monthGridCells.forEach((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const activeEvents = monthEvents.filter((event) => event.status !== 'CANCELLED' && calendarEventIntersectsDay(day, event));
            if (activeEvents.length === 0) return;

            const primaryEvent = activeEvents
                .slice()
                .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0];
            const categoryStyle = categoryStyles[primaryEvent.category] || categoryStyles.EVENT;

            dayStyleMap.set(key, {
                color: categoryStyle.color,
                backgroundColor: categoryStyle.dayBg,
                borderColor: categoryStyle.dayBorder
            });
        });
        return dayStyleMap;
    }, [categoryStyles, monthGridCells, monthEvents]);

    const selectedDayEvents = useMemo(() => {
        return monthEvents
            .filter((event) => calendarEventIntersectsDay(selectedDate, event))
            .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
    }, [monthEvents, selectedDate]);

    const selectedAudienceUsers = useMemo(
        () => (Array.isArray(formState.audienceUsers) ? formState.audienceUsers.map(toAudienceOption) : []),
        [formState.audienceUsers]
    );
    const audienceAutocompleteOptions = useMemo(
        () => mergeAudienceOptions(audienceUserOptions, selectedAudienceUsers),
        [audienceUserOptions, selectedAudienceUsers]
    );

    const mutedEventSet = useMemo(() => new Set(preferences?.mutedEventIds || []), [preferences]);

    useEffect(() => {
        dispatch(fetchCalendarMonthEvents({
            from: monthRange.from,
            to: monthRange.to,
            category: activeFilter,
            limit: 100
        }));
    }, [activeFilter, dispatch, monthRange.from, monthRange.to]);

    useEffect(() => {
        dispatch(fetchUpcomingCalendarEvents({
            category: activeFilter,
            limit: 15
        }));
    }, [activeFilter, dispatch]);

    useEffect(() => {
        dispatch(fetchCalendarNotificationPreferences());
    }, [dispatch]);

    useEffect(() => {
        return () => {
            dispatch(clearCalendarError());
        };
    }, [dispatch]);

    useEffect(() => {
        if (!dialogOpen || formState.visibility !== 'CUSTOM') return undefined;

        let active = true;
        const timer = setTimeout(async () => {
            setAudienceUserLoading(true);
            try {
                const response = await schoolCalendarService.searchAudienceUsers({
                    search: audienceUserSearch,
                    limit: 20
                });
                const users = response?.data?.users || [];
                if (!active) return;
                setAudienceUserOptions((previous) => mergeAudienceOptions(previous, users));
            } catch (_error) {
                // Keep UX stable if search fails; form submission will still validate on backend.
            } finally {
                if (active) {
                    setAudienceUserLoading(false);
                }
            }
        }, 250);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [audienceUserSearch, dialogOpen, formState.visibility]);

    const refreshCalendarData = () => {
        dispatch(fetchCalendarMonthEvents({
            from: monthRange.from,
            to: monthRange.to,
            category: activeFilter,
            limit: 100,
            force: true
        }));
        dispatch(fetchUpcomingCalendarEvents({
            category: activeFilter,
            limit: 15,
            force: true
        }));
    };

    const openCreateDialog = () => {
        setEditingEvent(null);
        setFormState(createDefaultCalendarEventForm(selectedDate));
        setFormError('');
        setAudienceUserOptions([]);
        setAudienceUserSearch('');
        setDialogOpen(true);
    };

    const openEditDialog = (event) => {
        const eventStart = new Date(event.startAt);
        const recurrence = event.recurrence || {};
        const recurrenceWeekDays = Array.isArray(recurrence.weekDays)
            ? recurrence.weekDays
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
            : [];
        const audienceEmails = Array.isArray(event.audience?.emails) ? event.audience.emails : [];
        const audienceUserIds = Array.isArray(event.audience?.userIds) ? event.audience.userIds : [];
        const audienceUsersFromEmails = audienceEmails.map((email, index) => toAudienceOption({
            id: audienceUserIds[index] || '',
            email
        }));
        const audienceUsersFromIds = audienceUserIds.map((id) => toAudienceOption({ id }));
        const audienceUsers = mergeAudienceOptions(audienceUsersFromEmails, audienceUsersFromIds);

        setEditingEvent(event);
        setFormState({
            title: event.title || '',
            description: event.description || '',
            category: event.category || 'EVENT',
            startAt: toDateInputValue(event.startAt),
            endAt: toDateInputValue(event.endAt),
            allDay: event.allDay !== false,
            location: event.location || '',
            visibility: event.audience?.visibility || 'SCHOOL_WIDE',
            audienceUsers,
            isRecurring: recurrence.isRecurring === true,
            recurrenceFrequency: recurrence.frequency || 'WEEKLY',
            recurrenceInterval: Number.parseInt(recurrence.interval, 10) || 1,
            recurrenceWeekDays: recurrenceWeekDays.length > 0
                ? recurrenceWeekDays
                : [Number.isNaN(eventStart.getTime()) ? new Date().getDay() : eventStart.getDay()],
            recurrenceUntil: toDateInputValue(recurrence.until)
        });
        setFormError('');
        setAudienceUserOptions(audienceUsers);
        setAudienceUserSearch('');
        setDialogOpen(true);
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setEditingEvent(null);
        setFormError('');
        setAudienceUserSearch('');
        setAudienceUserLoading(false);
        setAudienceUserOptions([]);
    };

    const submitEventForm = async () => {
        const title = formState.title.trim();
        const startAt = new Date(formState.startAt);
        const endAt = new Date(formState.endAt);
        const recurrenceInterval = Math.max(1, Number.parseInt(formState.recurrenceInterval, 10) || 1);
        const recurrenceWeekDays = Array.isArray(formState.recurrenceWeekDays)
            ? [...new Set(formState.recurrenceWeekDays
                .map((value) => Number.parseInt(value, 10))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
                .sort((left, right) => left - right)
            : [];
        const recurrenceUntil = formState.recurrenceUntil
            ? new Date(formState.recurrenceUntil)
            : null;
        const audienceUsers = Array.isArray(formState.audienceUsers)
            ? formState.audienceUsers.map(toAudienceOption)
            : [];
        const audienceEmails = [...new Set(
            audienceUsers
                .map((item) => String(item.email || '').trim().toLowerCase())
                .filter(Boolean)
        )];
        const audienceUserIds = [...new Set(
            audienceUsers
                .map((item) => String(item.id || '').trim())
                .filter((id) => CALENDAR_OBJECT_ID_PATTERN.test(id))
        )];

        if (!title) {
            setFormError('Title is required.');
            return;
        }
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
            setFormError('Start and end date are required.');
            return;
        }
        if (endAt < startAt) {
            setFormError('End date must be after start date.');
            return;
        }
        if (formState.isRecurring && formState.recurrenceFrequency === 'WEEKLY' && recurrenceWeekDays.length === 0) {
            setFormError('Select at least one weekday for weekly recurrence.');
            return;
        }
        if (formState.isRecurring && recurrenceUntil && Number.isNaN(recurrenceUntil.getTime())) {
            setFormError('Repeat until must be a valid date.');
            return;
        }
        if (formState.isRecurring && recurrenceUntil && recurrenceUntil < startAt) {
            setFormError('Repeat until must be after the event start date.');
            return;
        }
        if (formState.visibility === 'CUSTOM' && audienceEmails.length === 0 && audienceUserIds.length === 0) {
            setFormError('Select at least one recipient user for custom audience.');
            return;
        }

        const payload = {
            title,
            description: formState.description.trim(),
            category: formState.category,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            allDay: formState.allDay,
            location: formState.location.trim(),
            audience: {
                visibility: formState.visibility,
                emails: formState.visibility === 'CUSTOM' ? audienceEmails : [],
                userIds: formState.visibility === 'CUSTOM' ? audienceUserIds : []
            },
            recurrence: formState.isRecurring
                ? {
                    isRecurring: true,
                    frequency: String(formState.recurrenceFrequency || 'WEEKLY').toUpperCase(),
                    interval: recurrenceInterval,
                    weekDays: formState.recurrenceFrequency === 'WEEKLY' ? recurrenceWeekDays : [],
                    until: recurrenceUntil ? recurrenceUntil.toISOString() : null
                }
                : {
                    isRecurring: false
                }
        };

        if (payload.recurrence.isRecurring && payload.recurrence.frequency !== 'WEEKLY') {
            payload.recurrence.weekDays = [];
        }

        if (payload.recurrence.isRecurring && !payload.recurrence.until) {
            delete payload.recurrence.until;
        }

        if (!payload.recurrence.isRecurring) {
            payload.recurrence = { isRecurring: false };
        }

        const action = editingEvent
            ? updateCalendarEvent({ eventId: editingEvent.id, payload })
            : createCalendarEvent(payload);
        const result = await dispatch(action);
        if (result.meta.requestStatus === 'fulfilled') {
            closeDialog();
            refreshCalendarData();
        } else {
            setFormError(result.payload || 'Could not save event.');
        }
    };

    const handleCancelEvent = async (eventId) => {
        const shouldCancel = window.confirm('Cancel this event?');
        if (!shouldCancel) return;
        const result = await dispatch(cancelCalendarEvent(eventId));
        if (result.meta.requestStatus === 'fulfilled') {
            refreshCalendarData();
        }
    };

    const handleNotificationToggle = async (eventId, isEnabled) => {
        await dispatch(updateCalendarNotificationPreferences({
            eventId,
            eventEnabled: !isEnabled
        }));
    };

    const openEventActionsMenu = (mouseEvent, event) => {
        setMenuAnchor(mouseEvent.currentTarget);
        setMenuEvent(event);
    };

    const closeEventActionsMenu = () => {
        setMenuAnchor(null);
        setMenuEvent(null);
    };

    const handleEditFromMenu = () => {
        if (menuEvent) openEditDialog(menuEvent);
        closeEventActionsMenu();
    };

    const handleCancelFromMenu = () => {
        if (menuEvent) handleCancelEvent(menuEvent.id);
        closeEventActionsMenu();
    };

    const goToPreviousMonth = () => setCurrentMonth((previous) => addMonths(previous, -1));
    const goToNextMonth = () => setCurrentMonth((previous) => addMonths(previous, 1));

    const getDayCellStyle = (day, isSelected, isToday) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayTone = dayStylesByKey.get(key);
        return {
            ...(dayTone && !isSelected ? {
                backgroundColor: dayTone.backgroundColor,
                borderColor: dayTone.borderColor
            } : {}),
            ...(isToday && !isSelected ? {
                boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.4)}`
            } : {})
        };
    };

    const isEventNotificationEnabled = (event) => (
        preferences?.enabled !== false && !mutedEventSet.has(event.id)
    );

    return {
        canManage,
        categoryStyles,
        calendarError,
        mutationLoading,
        activeFilter,
        setActiveFilter,
        currentMonth,
        selectedDate,
        setSelectedDate,
        monthGridCells,
        selectedDayEvents,
        dayStylesByKey,
        monthLoading,
        upcomingLoading,
        upcomingEvents,
        preferences,
        dialogOpen,
        editingEvent,
        formState,
        setFormState,
        formError,
        openCreateDialog,
        closeDialog,
        submitEventForm,
        audienceAutocompleteOptions,
        selectedAudienceUsers,
        audienceUserLoading,
        setAudienceUserSearch,
        menuAnchor,
        openEventActionsMenu,
        closeEventActionsMenu,
        handleEditFromMenu,
        handleCancelFromMenu,
        handleNotificationToggle,
        goToPreviousMonth,
        goToNextMonth,
        getDayCellStyle,
        isEventNotificationEnabled
    };
};

export default useAdminSchoolCalendarController;
