import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const ACTION_KEYS = {
    add: 'library.historyAdd',
    archive: 'library.historyArchive',
    typo: 'library.historyRename',
    reorder: 'library.historyReorder',
    patch: 'library.historyPatch'
};

const FIELD_LABELS = {
    word: 'word',
    category: 'category',
    definition: 'library.definition',
    week: 'week',
    order: 'order'
};

const DIFF_FIELDS = ['word', 'category', 'definition', 'week', 'order'];

const changeLabel = (entry) => {
    const changed = (entry.changes || [])[0];
    return ACTION_KEYS[changed?.changeType] || 'library.historyPatch';
};

const SpellingWordHistoryPanel = ({ open, word, loadHistory, onClose }) => {
    const { t, i18n } = useTranslation('spelling');
    const [entries, setEntries] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestRef = useRef(0);

    useEffect(() => {
        if (!open || !word?._id) return undefined;
        const token = requestRef.current + 1;
        requestRef.current = token;
        setEntries([]);
        setNextCursor(null);
        setError(null);
        setLoading(true);
        loadHistory(word._id)
            .then((data) => {
                if (requestRef.current !== token) return;
                setEntries(data.entries || []);
                setNextCursor(data.nextCursor || null);
            })
            .catch(() => {
                if (requestRef.current !== token) return;
                setError(t('library.historyFailed'));
            })
            .finally(() => {
                if (requestRef.current === token) setLoading(false);
            });
        return () => {
            requestRef.current += 1;
        };
    }, [open, word?._id, loadHistory, t]);

    const loadMore = async () => {
        if (!word?._id || !nextCursor) return;
        setLoading(true);
        setError(null);
        try {
            const data = await loadHistory(word._id, nextCursor);
            setEntries((current) => [...current, ...(data.entries || [])]);
            setNextCursor(data.nextCursor || null);
        } catch (loadError) {
            void loadError;
            setError(t('library.historyFailed'));
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (value) => {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(i18n.language || undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>
                {t('library.historyTitle')}
                <Typography variant="body2" color="text.secondary" component="div">
                    {word?.word || ''}
                </Typography>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {!loading && !error && entries.length === 0 && (
                        <Typography variant="body2" color="text.secondary">{t('library.historyEmpty')}</Typography>
                    )}
                    {entries.map((entry, index) => {
                        const actor = entry.actorName || entry.actorRole || '';
                        return (
                            <Box key={`${entry.operationId || 'entry'}-${index}`}>
                                <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="baseline">
                                    <Typography variant="subtitle2">{t(changeLabel(entry))}</Typography>
                                    <Typography variant="caption" color="text.secondary">{formatDate(entry.at)}</Typography>
                                </Stack>
                                {actor && (
                                    <Typography variant="caption" color="text.secondary" component="div">
                                        {t('library.historyBy', { actor })}
                                    </Typography>
                                )}
                                {entry.reason && (
                                    <Typography variant="body2" sx={{ mt: 0.5 }}>{entry.reason}</Typography>
                                )}
                                {(entry.changes || []).map((change, changeIndex) => {
                                    const fields = DIFF_FIELDS.filter((field) => (
                                        String(change.before?.[field] ?? '') !== String(change.after?.[field] ?? '')
                                    ));
                                    if (fields.length === 0) return null;
                                    return (
                                        <Box key={changeIndex} sx={{ mt: 0.5 }}>
                                            {fields.map((field) => (
                                                <Typography
                                                    key={field}
                                                    variant="body2"
                                                    color="text.secondary"
                                                    sx={{ overflowWrap: 'anywhere' }}
                                                >
                                                    <Box component="span" sx={{ fontWeight: 600 }}>
                                                        {t(FIELD_LABELS[field] || field)}:
                                                    </Box>{' '}
                                                    {String(change.before?.[field] ?? '—')} → {String(change.after?.[field] ?? '—')}
                                                </Typography>
                                            ))}
                                        </Box>
                                    );
                                })}
                                {index < entries.length - 1 && <Divider sx={{ mt: 2 }} />}
                            </Box>
                        );
                    })}
                    {loading && <Stack alignItems="center"><CircularProgress size={20} aria-label={t('library.historyLoading')} /></Stack>}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, '& .MuiButton-root': { minHeight: { xs: 44 } } }}>
                {nextCursor && (
                    <Button onClick={loadMore} disabled={loading}>{t('library.historyLoadMore')}</Button>
                )}
                <Button onClick={onClose}>{t('close')}</Button>
            </DialogActions>
        </Dialog>
    );
};

export default SpellingWordHistoryPanel;
