import { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { HiArrowDown, HiArrowUp } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';

const moveItem = (ids, index, direction) => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return ids;
    const next = [...ids];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
};

const SpellingWeekOrderEditor = ({
    open,
    resetKey,
    weekRows = [],
    busy = false,
    error = null,
    onClose,
    onApply
}) => {
    const { t } = useTranslation('spelling');
    const [order, setOrder] = useState([]);
    const [reason, setReason] = useState('');
    const [announcement, setAnnouncement] = useState('');

    const initialOrder = weekRows.map((row) => String(row._id));
    const grade = weekRows[0]?.grade;
    const week = weekRows[0]?.week;

    useEffect(() => {
        setOrder(initialOrder);
        setReason('');
        setAnnouncement('');
        // Reset per dialog session; the arranged order survives a preview.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const rowsById = new Map(weekRows.map((row) => [String(row._id), row]));
    const unchanged = order.join('|') === initialOrder.join('|');
    const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;

    const shift = (index, direction) => {
        if (busy) return;
        const next = moveItem(order, index, direction);
        if (next === order) return;
        const movedId = order[index];
        const nextIndex = next.indexOf(movedId);
        setOrder(next);
        setAnnouncement(`${rowsById.get(movedId)?.word || ''} — ${t('library.position', { order: nextIndex + 1 })}`);
    };

    const handleKeyDown = (event, index) => {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            shift(index, 'up');
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            shift(index, 'down');
        }
    };

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            sx={{ '& .MuiIconButton-root': { minWidth: { xs: 44 }, minHeight: { xs: 44 } } }}
        >
            <DialogTitle>
                {t('library.reorderTitle', { week: week || '' })}
                {grade && (
                    <Typography variant="body2" color="text.secondary" component="div">
                        {grade} · {t('weekWithNumber', { week })}
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">{t('library.reorderHelp')}</Typography>
                    {error && <Alert severity="error" role="alert">{error.message}</Alert>}
                    <Box role="list" aria-label={t('library.reorderTitle', { week: week || '' })}>
                        {order.map((id, index) => {
                            const row = rowsById.get(id);
                            if (!row) return null;
                            return (
                                <Stack
                                    key={id}
                                    role="listitem"
                                    tabIndex={0}
                                    onKeyDown={(event) => handleKeyDown(event, index)}
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        px: 1,
                                        py: 0.5,
                                        mb: 0.75,
                                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 }
                                    }}
                                >
                                    <Typography variant="body2" sx={{ minWidth: 28, color: 'text.secondary' }}>{index + 1}</Typography>
                                    <Typography variant="body2" dir="auto" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                                        {row.word}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                        {row.category}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        aria-label={`${t('library.moveUp')}: ${row.word}`}
                                        disabled={index === 0 || busy}
                                        onClick={() => shift(index, 'up')}
                                    >
                                        <HiArrowUp />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        aria-label={`${t('library.moveDown')}: ${row.word}`}
                                        disabled={index === order.length - 1 || busy}
                                        onClick={() => shift(index, 'down')}
                                    >
                                        <HiArrowDown />
                                    </IconButton>
                                </Stack>
                            );
                        })}
                    </Box>
                    <Box aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
                        {announcement}
                    </Box>
                    <TextField
                        fullWidth
                        label={t('library.reasonLabel')}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        helperText={reason.trim().length > 0 && !reasonOk ? t('library.reasonRequired') : t('library.reasonHelp')}
                        error={reason.trim().length > 0 && !reasonOk}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, '& .MuiButton-root': { minHeight: { xs: 44 } } }}>
                <Button onClick={onClose} disabled={busy}>{t('cancel')}</Button>
                <Button
                    variant="contained"
                    disabled={busy || unchanged || !reasonOk}
                    onClick={() => onApply(order, reason.trim())}
                >
                    {t('library.applyOrder')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SpellingWeekOrderEditor;
