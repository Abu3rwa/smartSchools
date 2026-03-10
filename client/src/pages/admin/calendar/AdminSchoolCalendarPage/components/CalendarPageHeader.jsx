import { Box, Button, Stack, Typography } from '@mui/material';
import { HiPlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const CalendarPageHeader = ({ canManage, mutationLoading, onAddEvent }) => {
    const { t } = useTranslation(['calendar']);

    return (
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Box>
                <Typography variant="h4" fontWeight={800}>{t('calendar:header.title')}</Typography>
                <Typography color="text.secondary">
                    {t('calendar:header.subtitle')}
                </Typography>
            </Box>
            {canManage && (
                <Button
                    startIcon={<HiPlus />}
                    variant="contained"
                    onClick={onAddEvent}
                    disabled={mutationLoading}
                >
                    {t('calendar:header.addEvent')}
                </Button>
            )}
        </Stack>
    );
};

export default CalendarPageHeader;
