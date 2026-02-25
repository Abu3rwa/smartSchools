import { Chip, Stack } from '@mui/material';
import { CALENDAR_FILTER_OPTIONS } from '../constants';

const CalendarFilterChips = ({ activeFilter, onChangeFilter }) => {
    return (
        <Stack direction="row" spacing={1} className="calendar-filter-chip-row">
            {CALENDAR_FILTER_OPTIONS.map((item) => (
                <Chip
                    key={item.value}
                    label={item.label}
                    color={activeFilter === item.value ? 'primary' : 'default'}
                    variant={activeFilter === item.value ? 'filled' : 'outlined'}
                    onClick={() => onChangeFilter(item.value)}
                />
            ))}
        </Stack>
    );
};

export default CalendarFilterChips;
