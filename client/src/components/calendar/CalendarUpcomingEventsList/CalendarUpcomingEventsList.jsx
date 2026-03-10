import { Box, Chip, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { HiBell, HiOutlineBell, HiOutlineClock, HiOutlineDotsVertical, HiOutlineLocationMarker } from 'react-icons/hi';
import './CalendarUpcomingEventsList.css';

const CalendarUpcomingEventsList = ({
    upcomingLoading,
    monthLoading,
    upcomingEvents,
    categoryStyles,
    preferences,
    canManage,
    isEventNotificationEnabled,
    onToggleNotification,
    onOpenEventMenu,
    formatCalendarEventDateRange,
    formatCalendarRecurrenceSummary,
    getCategoryIconComponent,
    t
}) => {
    return (
        <Paper className="calendar-upcoming-panel" elevation={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight={700}>{t('calendar:upcoming.title')}</Typography>
                {(upcomingLoading || monthLoading) && <CircularProgress size={18} />}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('calendar:upcoming.subtitle')}
            </Typography>

            <Stack spacing={1.5}>
                {!upcomingLoading && upcomingEvents.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {t('calendar:upcoming.empty')}
                    </Typography>
                )}

                {upcomingEvents.map((event) => {
                    const style = categoryStyles[event.category] || categoryStyles.EVENT;
                    const eventNotificationEnabled = isEventNotificationEnabled(event);
                    const CategoryIcon = getCategoryIconComponent(event.category);

                    return (
                        <Paper key={event.instanceId || `${event.id}-${event.startAt}`} className="upcoming-event-card" variant="outlined">
                            <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                    <Box className="event-category-icon" sx={{ color: style.color }}>
                                        <CategoryIcon size={18} />
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
                                        <Chip size="small" color="warning" label={t('calendar:status.cancelled')} />
                                    )}
                                </Stack>
                                <Stack direction="row" spacing={0.5}>
                                    <Tooltip title={eventNotificationEnabled ? t('calendar:upcoming.mute') : t('calendar:upcoming.enableNotification')}>
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => onToggleNotification(event.id, eventNotificationEnabled)}
                                                disabled={!preferences}
                                            >
                                                {eventNotificationEnabled ? <HiBell size={18} /> : <HiOutlineBell size={18} />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                    {canManage && (
                                        <IconButton
                                            size="small"
                                            onClick={(mouseEvent) => onOpenEventMenu(mouseEvent, event)}
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
                                <Typography variant="body2">{formatCalendarEventDateRange(event)}</Typography>
                            </Stack>
                            {event.recurrence?.isRecurring === true && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {formatCalendarRecurrenceSummary(event)}
                                </Typography>
                            )}
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
    );
};

export default CalendarUpcomingEventsList;
