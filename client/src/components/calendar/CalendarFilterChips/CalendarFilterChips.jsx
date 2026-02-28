import { Chip, Stack } from '@mui/material';
import './CalendarFilterChips.css';

const CalendarFilterChips = ({ activeFilter, onChangeFilter, options = [] }) => {
    return (
        <Stack direction="row" spacing={1} className="calendar-filter-chip-row">
            {options.map((item) => (
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
