import { Box, Button, Stack, Typography } from '@mui/material';
import { HiPlus } from 'react-icons/hi';

const CalendarPageHeader = ({ canManage, mutationLoading, onAddEvent }) => {
    return (
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
                    onClick={onAddEvent}
                    disabled={mutationLoading}
                >
                    Add Event
                </Button>
            )}
        </Stack>
    );
};

export default CalendarPageHeader;
