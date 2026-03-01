import {
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack
} from '@mui/material';
import { PERIOD_OPTIONS } from '../constants';

const BehaviorTrackingFilters = ({
    period,
    onPeriodChange,
    liveMode,
    onToggleLiveMode,
    onRefresh
}) => {
    return (
        <Stack direction="row" spacing={1}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="behavior-period-label">Period</InputLabel>
                <Select
                    labelId="behavior-period-label"
                    value={period}
                    label="Period"
                    onChange={(event) => onPeriodChange(event.target.value)}
                >
                    {PERIOD_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                            {option.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <Button variant={liveMode ? 'contained' : 'outlined'} onClick={onToggleLiveMode}>
                {liveMode ? 'Live: ON' : 'Live: OFF'}
            </Button>
            <Button variant="outlined" onClick={onRefresh}>
                Refresh
            </Button>
        </Stack>
    );
};

export default BehaviorTrackingFilters;
