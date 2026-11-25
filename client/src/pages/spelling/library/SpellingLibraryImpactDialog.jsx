import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { IMPACT_LABELS, impactEntries } from './libraryDeltas.js';

const CONFLICT_CODES = new Set([
    'STALE_REVISION',
    'STALE_LIBRARY',
    'IMPACT_CHANGED',
    'IMPACT_EXPIRED',
    'OPERATION_REUSED',
    'ACTIVE_TEST',
    'SCHEDULED_TEST'
]);

const SpellingLibraryImpactDialog = ({
    open,
    impact = {},
    note = '',
    warning = '',
    busy = false,
    error = null,
    onClose,
    onConfirm
}) => {
    const { t } = useTranslation('spelling');
    const entries = impactEntries(impact);
    const untouched = entries.every((entry) => entry.value === 0);
    const conflict = error && CONFLICT_CODES.has(error.code);

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('library.impactTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">{t('library.impactIntro')}</Typography>
                    {note && <Typography variant="body2">{note}</Typography>}
                    {warning && <Alert severity="warning">{warning}</Alert>}
                    {untouched ? (
                        <Typography variant="body2" color="text.secondary">{t('library.impactNone')}</Typography>
                    ) : (
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
                            gap: 1.5
                        }}>
                            {entries.map((entry) => (
                                <Box
                                    key={entry.key}
                                    sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1, minWidth: 0 }}
                                >
                                    <Typography variant="caption" color="text.secondary" component="div">
                                        {t(IMPACT_LABELS[entry.key])}
                                    </Typography>
                                    <Typography variant="h6" component="div">{entry.value}</Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                    {error && (
                        <Alert severity="error" role="alert">
                            {error.message}
                            {conflict && (
                                <Typography variant="body2" sx={{ mt: 0.5 }}>{t('library.conflictKeptDraft')}</Typography>
                            )}
                        </Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, '& .MuiButton-root': { minHeight: { xs: 44 } } }}>
                <Button onClick={onClose} disabled={busy}>{t('cancel')}</Button>
                <Button
                    variant="contained"
                    onClick={onConfirm}
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                >
                    {busy ? t('library.working') : t('library.confirmSave')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SpellingLibraryImpactDialog;
