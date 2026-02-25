import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    addDays,
    addHours,
    addMonths,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    startOfDay,
    startOfMonth,
    startOfWeek
} from 'date-fns';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    HiBell,
    HiOutlineBell,
    HiOutlineCalendar,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineClipboardCheck,
    HiOutlineClock,
    HiOutlineDotsVertical,
    HiOutlineLocationMarker,
    HiOutlinePencil,
    HiOutlineUsers,
    HiOutlineXCircle,
    HiPlus
} from 'react-icons/hi';
import { selectUser } from '../../store/slices/authSlice';
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
} from '../../store/slices/calendarSlice';
import './AdminSchoolCalendarPage.css';

const FILTERS = [
    { label: 'All', value: 'ALL' },
    { label: 'Events', value: 'EVENT' },
    { label: 'Holidays', value: 'HOLIDAY' },
    { label: 'Meetings', value: 'MEETING' },
    { label: 'Exams', value: 'EXAM' }
];

const CATEGORY_STYLES = {
    EVENT: { label: 'Event', color: '#1d4ed8', bg: 'rgba(29, 78, 216, 0.12)' },
    HOLIDAY: { label: 'Holiday', color: '#b45309', bg: 'rgba(180, 83, 9, 0.12)' },
    MEETING: { label: 'Meeting', color: '#047857', bg: 'rgba(4, 120, 87, 0.12)' },
    EXAM: { label: 'Exam', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' }
};

const VISIBILITY_OPTIONS = [
    { label: 'School Wide', value: 'SCHOOL_WIDE' },
    { label: 'Teachers Only', value: 'TEACHERS_ONLY' },
    { label: 'Parents Only', value: 'PARENTS_ONLY' }
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateInputValue = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return format(date, "yyyy-MM-dd'T'HH:mm");
};

const createDefaultForm = (baseDate = new Date()) => {
    const start = startOfDay(baseDate);
    const end = addHours(start, 1);
    return {
        title: '',
        description: '',
        category: 'EVENT',
        startAt: toDateInputValue(start),
        endAt: toDateInputValue(end),
        allDay: true,
        location: '',
        visibility: 'SCHOOL_WIDE'
    };
};

const toCategoryIcon = (category) => {
    switch (category) {
        case 'MEETING':
            return <HiOutlineUsers size={18} />;
        case 'EXAM':
            return <HiOutlineClipboardCheck size={18} />;
        default:
            return <HiOutlineCalendar size={18} />;
    }
};

const formatEventDateRange = (event) => {
    const startAt = new Date(event.startAt);
    const endAt = new Date(event.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return '';
    }

    if (event.allDay) {
        if (isSameDay(startAt, endAt)) {
            return format(startAt, 'EEE, MMM d, yyyy');
        }
        return `${format(startAt, 'MMM d')} - ${format(endAt, 'MMM d, yyyy')}`;
    }

    if (isSameDay(startAt, endAt)) {
        return `${format(startAt, 'EEE, MMM d, yyyy h:mm a')} - ${format(endAt, 'h:mm a')}`;
    }
    return `${format(startAt, 'MMM d, yyyy h:mm a')} - ${format(endAt, 'MMM d, yyyy h:mm a')}`;
};

const buildMonthGrid = (monthDate) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const cells = [];
    let cursor = gridStart;

    while (cursor <= gridEnd) {
        cells.push(cursor);
        cursor = addDays(cursor, 1);
    }

    return cells;
};

const intersectsDay = (day, event) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    return eventStart <= dayEnd && eventEnd >= dayStart;
};

const canManageCalendar = (user) => {
    if (!user) return false;
    if (['admin', 'super_admin', 'department_principal'].includes(user.role)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes('manage_events');
};

const AdminSchoolCalendarPage = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const canManage = canManageCalendar(user);

    const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [formState, setFormState] = useState(createDefaultForm(new Date()));
    const [formError, setFormError] = useState('');
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [menuEvent, setMenuEvent] = useState(null);

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
    const monthGridCells = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

    const eventCountByDay = useMemo(() => {
        const counts = new Map();
        monthGridCells.forEach((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const count = monthEvents.filter((event) => intersectsDay(day, event)).length;
            if (count > 0) counts.set(key, count);
        });
        return counts;
    }, [monthGridCells, monthEvents]);

    const selectedDayEvents = useMemo(() => {
        return monthEvents
            .filter((event) => intersectsDay(selectedDate, event))
            .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
    }, [monthEvents, selectedDate]);

    useEffect(() => {
        dispatch(fetchCalendarMonthEvents({
            from: monthRange.from,
            to: monthRange.to,
            category: activeFilter,
            limit: 300
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

    const openCreateDialog = () => {
        setEditingEvent(null);
        setFormState(createDefaultForm(selectedDate));
        setFormError('');
        setDialogOpen(true);
    };

    const openEditDialog = (event) => {
        setEditingEvent(event);
        setFormState({
            title: event.title || '',
            description: event.description || '',
            category: event.category || 'EVENT',
            startAt: toDateInputValue(event.startAt),
            endAt: toDateInputValue(event.endAt),
            allDay: event.allDay !== false,
            location: event.location || '',
            visibility: event.audience?.visibility || 'SCHOOL_WIDE'
        });
        setFormError('');
        setDialogOpen(true);
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setEditingEvent(null);
        setFormError('');
    };

    const refreshCalendarData = () => {
        dispatch(fetchCalendarMonthEvents({
            from: monthRange.from,
            to: monthRange.to,
            category: activeFilter,
            limit: 300,
            force: true
        }));
        dispatch(fetchUpcomingCalendarEvents({
            category: activeFilter,
            limit: 15,
            force: true
        }));
    };

    const submitEventForm = async () => {
        const title = formState.title.trim();
        const startAt = new Date(formState.startAt);
        const endAt = new Date(formState.endAt);

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

        const payload = {
            title,
            description: formState.description.trim(),
            category: formState.category,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            allDay: formState.allDay,
            location: formState.location.trim(),
            audience: {
                visibility: formState.visibility
            }
        };

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

    const mutedEventSet = useMemo(() => new Set(preferences?.mutedEventIds || []), [preferences]);

    return (
        <div className="admin-school-calendar-page">
            <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                    <Box>
                        <Typography variant="h4" fontWeight={800}>School Calendar</Typography>
                        <Typography color="text.secondary">
                            Plan monthly activities and manage upcoming events
                        </Typography>
                    </Box>
                    {canManage && (
                        <Button
                            startIcon={<HiPlus />}
                            variant="contained"
                            onClick={openCreateDialog}
                            disabled={mutationLoading}
                        >
                            Add Event
                        </Button>
                    )}
                </Stack>

                {calendarError && (
                    <Alert severity="error">{calendarError}</Alert>
                )}

                <Stack direction="row" spacing={1} className="calendar-filter-chip-row">
                    {FILTERS.map((item) => (
                        <Chip
                            key={item.value}
                            label={item.label}
                            color={activeFilter === item.value ? 'primary' : 'default'}
                            variant={activeFilter === item.value ? 'filled' : 'outlined'}
                            onClick={() => setActiveFilter(item.value)}
                        />
                    ))}
                </Stack>

                <div className="calendar-layout-grid">
                    <Paper className="calendar-month-panel" elevation={0}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" fontWeight={700}>
                                {format(currentMonth, 'MMMM yyyy')}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <IconButton
                                    size="small"
                                    onClick={() => setCurrentMonth((previous) => addMonths(previous, -1))}
                                    aria-label="Previous month"
                                >
                                    <HiOutlineChevronLeft size={18} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    onClick={() => setCurrentMonth((previous) => addMonths(previous, 1))}
                                    aria-label="Next month"
                                >
                                    <HiOutlineChevronRight size={18} />
                                </IconButton>
                            </Stack>
                        </Stack>

                        <Divider sx={{ my: 1.5 }} />

                        <div className="calendar-weekday-row">
                            {WEEKDAY_LABELS.map((label) => (
                                <div key={label} className="calendar-weekday-cell">{label}</div>
                            ))}
                        </div>

                        <div className="calendar-days-grid">
                            {monthGridCells.map((day) => {
                                const key = format(day, 'yyyy-MM-dd');
                                const count = eventCountByDay.get(key) || 0;
                                const isCurrentMonthCell = isSameMonth(day, currentMonth);
                                const isToday = isSameDay(day, new Date());
                                const isSelected = isSameDay(day, selectedDate);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`calendar-day-cell${isCurrentMonthCell ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                                        onClick={() => setSelectedDate(day)}
                                    >
                                        <span className="day-label">{format(day, 'd')}</span>
                                        {count > 0 && (
                                            <span className="day-event-count">{count}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <Divider sx={{ my: 1.5 }} />

                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                            {selectedDayEvents.length} event{selectedDayEvents.length === 1 ? '' : 's'} on {format(selectedDate, 'EEE, MMM d')}
                        </Typography>
                        <Stack spacing={1}>
                            {selectedDayEvents.length === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    No events on this date.
                                </Typography>
                            )}
                            {selectedDayEvents.slice(0, 3).map((event) => {
                                const style = CATEGORY_STYLES[event.category] || CATEGORY_STYLES.EVENT;
                                return (
                                    <Box key={event.id} className="selected-day-event-row">
                                        <Box className="selected-day-event-dot" sx={{ backgroundColor: style.color }} />
                                        <Typography variant="body2" fontWeight={600} noWrap>{event.title}</Typography>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Paper>

                    <Paper className="calendar-upcoming-panel" elevation={0}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" fontWeight={700}>Upcoming Events</Typography>
                            {(upcomingLoading || monthLoading) && <CircularProgress size={18} />}
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Showing next events for the selected filter
                        </Typography>

                        <Stack spacing={1.5}>
                            {!upcomingLoading && upcomingEvents.length === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    No upcoming events found.
                                </Typography>
                            )}

                            {upcomingEvents.map((event) => {
                                const style = CATEGORY_STYLES[event.category] || CATEGORY_STYLES.EVENT;
                                const eventNotificationEnabled = preferences?.enabled !== false && !mutedEventSet.has(event.id);
                                return (
                                    <Paper key={event.id} className="upcoming-event-card" variant="outlined">
                                        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                                            <Stack direction="row" spacing={1.25} alignItems="center">
                                                <Box className="event-category-icon" sx={{ color: style.color }}>
                                                    {toCategoryIcon(event.category)}
                                                </Box>
                                                <Chip
                                                    size="small"
                                                    label={style.label}
                                                    sx={{
                                                        backgroundColor: style.bg,
                                                        color: style.color,
                                                        fontWeight: 700
                                                    }}
                                                />
                                                {event.status === 'CANCELLED' && (
                                                    <Chip size="small" color="warning" label="Cancelled" />
                                                )}
                                            </Stack>
                                            <Stack direction="row" spacing={0.5}>
                                                <Tooltip title={eventNotificationEnabled ? 'Mute notifications for this event' : 'Enable notifications for this event'}>
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleNotificationToggle(event.id, eventNotificationEnabled)}
                                                            disabled={!preferences}
                                                        >
                                                            {eventNotificationEnabled ? <HiBell size={18} /> : <HiOutlineBell size={18} />}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                {canManage && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={(eventTarget) => {
                                                            setMenuAnchor(eventTarget.currentTarget);
                                                            setMenuEvent(event);
                                                        }}
                                                    >
                                                        <HiOutlineDotsVertical size={16} />
                                                    </IconButton>
                                                )}
                                            </Stack>
                                        </Stack>

                                        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.8 }}>
                                            {event.title}
                                        </Typography>
                                        {event.description && (
                                            <Typography variant="body2" color="text.secondary" className="upcoming-event-description">
                                                {event.description}
                                            </Typography>
                                        )}

                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                            <HiOutlineClock size={15} />
                                            <Typography variant="body2">{formatEventDateRange(event)}</Typography>
                                        </Stack>
                                        {event.location && (
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.6 }}>
                                                <HiOutlineLocationMarker size={15} />
                                                <Typography variant="body2">{event.location}</Typography>
                                            </Stack>
                                        )}
                                    </Paper>
                                );
                            })}
                        </Stack>
                    </Paper>
                </div>
            </Stack>

            <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                        {formError && <Alert severity="error">{formError}</Alert>}
                        <TextField
                            label="Title"
                            value={formState.title}
                            onChange={(event) => setFormState((previous) => ({ ...previous, title: event.target.value }))}
                            required
                        />
                        <TextField
                            label="Description"
                            value={formState.description}
                            onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                            multiline
                            minRows={2}
                        />
                        <TextField
                            select
                            label="Category"
                            value={formState.category}
                            onChange={(event) => setFormState((previous) => ({ ...previous, category: event.target.value }))}
                        >
                            {FILTERS.filter((item) => item.value !== 'ALL').map((item) => (
                                <MenuItem key={item.value} value={item.value}>
                                    {item.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                            <TextField
                                label="Start"
                                type="datetime-local"
                                value={formState.startAt}
                                onChange={(event) => setFormState((previous) => ({ ...previous, startAt: event.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                required
                            />
                            <TextField
                                label="End"
                                type="datetime-local"
                                value={formState.endAt}
                                onChange={(event) => setFormState((previous) => ({ ...previous, endAt: event.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                required
                            />
                        </Stack>
                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={formState.allDay}
                                    onChange={(event) => setFormState((previous) => ({ ...previous, allDay: event.target.checked }))}
                                />
                            )}
                            label="All Day"
                        />
                        <TextField
                            label="Location (optional)"
                            value={formState.location}
                            onChange={(event) => setFormState((previous) => ({ ...previous, location: event.target.value }))}
                        />
                        <TextField
                            select
                            label="Audience"
                            value={formState.visibility}
                            onChange={(event) => setFormState((previous) => ({ ...previous, visibility: event.target.value }))}
                        >
                            {VISIBILITY_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog}>Close</Button>
                    <Button variant="contained" onClick={submitEventForm} disabled={mutationLoading}>
                        {mutationLoading ? 'Saving...' : (editingEvent ? 'Save Changes' : 'Create Event')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => {
                    setMenuAnchor(null);
                    setMenuEvent(null);
                }}
            >
                <MenuItem
                    onClick={() => {
                        if (menuEvent) openEditDialog(menuEvent);
                        setMenuAnchor(null);
                    }}
                >
                    <HiOutlinePencil size={15} style={{ marginRight: 8 }} />
                    Edit
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        if (menuEvent) handleCancelEvent(menuEvent.id);
                        setMenuAnchor(null);
                    }}
                >
                    <HiOutlineXCircle size={15} style={{ marginRight: 8 }} />
                    Cancel Event
                </MenuItem>
            </Menu>
        </div>
    );
};

export default AdminSchoolCalendarPage;
