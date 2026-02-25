import { Box, Divider, IconButton, Paper, Stack, Typography } from '@mui/material';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { CALENDAR_WEEKDAY_LABELS } from '../constants';

const CalendarMonthPanel = ({
    currentMonth,
    selectedDate,
    monthGridCells,
    selectedDayEvents,
    categoryStyles,
    dayStylesByKey,
    onPreviousMonth,
    onNextMonth,
    onSelectDate,
    getDayCellStyle
}) => {
    return (
        <Paper className="calendar-month-panel" elevation={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight={700}>
                    {format(currentMonth, 'MMMM yyyy')}
                </Typography>
                <Stack direction="row" spacing={1}>
                    <IconButton
                        size="small"
                        onClick={onPreviousMonth}
                        aria-label="Previous month"
                    >
                        <HiOutlineChevronLeft size={18} />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={onNextMonth}
                        aria-label="Next month"
                    >
                        <HiOutlineChevronRight size={18} />
                    </IconButton>
                </Stack>
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <div className="calendar-weekday-row">
                {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="calendar-weekday-cell">{label}</div>
                ))}
            </div>

            <div className="calendar-days-grid">
                {monthGridCells.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const isCurrentMonthCell = isSameMonth(day, currentMonth);
                    const isToday = isSameDay(day, new Date());
                    const isSelected = isSameDay(day, selectedDate);
                    const cellStyle = getDayCellStyle(day, isSelected, isToday);
                    const dayTone = dayStylesByKey.get(key);

                    return (
                        <button
                            key={key}
                            type="button"
                            className={`calendar-day-cell${isCurrentMonthCell ? '' : ' outside'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dayTone ? ' has-events' : ''}`}
                            onClick={() => onSelectDate(day)}
                            style={cellStyle}
                        >
                            <span className="day-label">{format(day, 'd')}</span>
                            {dayTone && (
                                <span
                                    className="day-event-dot"
                                    style={{ backgroundColor: dayTone.color }}
                                />
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
                    const style = categoryStyles[event.category] || categoryStyles.EVENT;
                    return (
                        <Box key={event.instanceId || event.id} className="selected-day-event-row">
                            <Box className="selected-day-event-dot" sx={{ backgroundColor: style.color }} />
                            <Typography variant="body2" fontWeight={600} noWrap>{event.title}</Typography>
                        </Box>
                    );
                })}
            </Stack>
        </Paper>
    );
};

export default CalendarMonthPanel;
