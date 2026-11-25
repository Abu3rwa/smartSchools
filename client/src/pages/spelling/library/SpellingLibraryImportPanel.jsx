import { useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    LinearProgress,
    Radio,
    RadioGroup,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import { HiOutlineTrash } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { IMPACT_LABELS, impactEntries, newOperationId } from './libraryDeltas.js';
import {
    RETRY_PREVIEW_CODES,
    RETRY_SAVE_CODE,
    ambiguitiesResolved,
    importPreviewReady,
    mappingsFromSelections,
    messageKey,
    plannedEntries,
    plannedIsEmpty
} from './spellingImportState.js';

const reasonIsValid = (reason) => reason.trim().length >= 5 && reason.trim().length <= 500;

const SpellingLibraryImportPanel = ({
    open,
    onClose,
    onPreview,
    onCommit,
    onImported,
    onNotify
}) => {
    const { t } = useTranslation('spelling');
    const [file, setFile] = useState(null);
    const [mode, setMode] = useState('merge');
    const [reason, setReason] = useState('');
    const [preview, setPreview] = useState(null);
    const [usedMappings, setUsedMappings] = useState([]);
    const [selections, setSelections] = useState({});
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const operationIdRef = useRef(null);
    const fileInputRef = useRef(null);

    const reasonOk = reasonIsValid(reason);
    const ambiguities = preview?.ambiguities || [];
    const ready = importPreviewReady(preview);
    const planned = preview?.planned || null;
    const impact = impactEntries(preview?.impact);

    const resetPreview = () => {
        setPreview(null);
        setUsedMappings([]);
        setSelections({});
        setError(null);
        operationIdRef.current = null;
    };

    const resetAll = () => {
        resetPreview();
        setFile(null);
        setReason('');
        setMode('merge');
        setConfirmOpen(false);
    };

    const updateFile = (nextFile) => {
        setFile(nextFile);
        resetPreview();
    };

    const updateMode = (nextMode) => {
        setMode(nextMode);
        resetPreview();
    };

    const runPreview = async (identityMappings) => {
        if (!file) return;
        setBusy('preview');
        setError(null);
        try {
            const data = await onPreview({ file, mode, identityMappings });
            setPreview(data);
            setUsedMappings(data?.identityMappings || []);
            setSelections({});
            operationIdRef.current = data?.committable ? newOperationId() : null;
        } catch (failure) {
            setError({
                code: failure?.code,
                message: failure?.message,
                retry: RETRY_PREVIEW_CODES.has(failure?.code)
            });
        } finally {
            setBusy(null);
        }
    };

    const previewSelection = () => {
        if (ambiguities.length === 0) {
            runPreview([]);
            return;
        }
        const mappings = mappingsFromSelections(ambiguities, selections);
        if (mappings) runPreview(mappings);
    };

    const commit = async () => {
        if (!ready || !reasonOk) return;
        setBusy('commit');
        setConfirmOpen(false);
        setError(null);
        try {
            const result = await onCommit({
                preview,
                reason: reason.trim(),
                operationId: operationIdRef.current
            });
            let text = t('importNoChanges');
            if (result?.idempotent) {
                text = t('importAlreadyApplied');
            } else if (!result?.noop) {
                const counts = result?.counts || {};
                text = t('importCounts', {
                    added: counts.added || 0,
                    changed: counts.changed || 0,
                    removed: counts.removed || 0
                });
            }
            resetAll();
            onImported?.();
            onNotify?.(text, 'success');
            onClose?.();
        } catch (failure) {
            const retryPreview = RETRY_PREVIEW_CODES.has(failure?.code);
            setError({
                code: failure?.code,
                message: failure?.message,
                retry: retryPreview,
                retrySave: failure?.code === RETRY_SAVE_CODE
            });
            if (retryPreview) {
                // The token and versions are stale; a fresh preview is required.
                setPreview(null);
                operationIdRef.current = null;
            }
        } finally {
            setBusy(null);
        }
    };

    const closeDialog = () => {
        if (busy) return;
        setError(null);
        onClose?.();
    };

    const conflictRows = preview?.errors || [];

    const ambiguityPanel = preview && ambiguities.length > 0 ? (
        <Alert severity="warning">
            <Typography variant="subtitle2">{t('identityTitle')}</Typography>
            <Typography variant="body2">{t('identityHelp')}</Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
                {ambiguities.map((ambiguity) => (
                    <Box key={ambiguity.row}>
                        <Typography variant="subtitle2">{t('identityRow', { row: ambiguity.row })}</Typography>
                        <RadioGroup
                            value={selections[ambiguity.row] || ''}
                            onChange={(event) => setSelections((current) => ({
                                ...current,
                                [ambiguity.row]: event.target.value
                            }))}
                        >
                            {(ambiguity.candidates || []).map((candidate) => (
                                <FormControlLabel
                                    key={candidate.wordId}
                                    value={candidate.wordId}
                                    control={<Radio />}
                                    label={(
                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                            <span>{t('identityCandidate', { word: candidate.word, week: candidate.week })}</span>
                                            {candidate.archived && <Chip size="small" variant="outlined" label={t('identityArchived')} />}
                                        </Stack>
                                    )}
                                />
                            ))}
                        </RadioGroup>
                    </Box>
                ))}
            </Stack>
        </Alert>
    ) : null;

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : closeDialog}
            fullWidth
            maxWidth="md"
            sx={{
                '& .MuiButton-root': { minHeight: { xs: 44 } },
                '& .MuiRadio-root': { minWidth: { xs: 44 }, minHeight: { xs: 44 } }
            }}
        >
            <DialogTitle>{t('importTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">{t('csvColumns')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('csvEncodedColumns')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('csvFileLimit')}</Typography>
                    <Button
                        component="a"
                        href="/spelling_words_sample.csv"
                        download
                        variant="outlined"
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        {t('downloadTemplate')}
                    </Button>

                    <Box
                        component="label"
                        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragLeave={(event) => {
                            event.preventDefault();
                            if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            setDragActive(false);
                            updateFile(event.dataTransfer.files?.[0] || null);
                        }}
                        sx={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 1,
                            p: { xs: 2, sm: 3 },
                            textAlign: 'center',
                            border: '2px dashed',
                            borderColor: dragActive ? 'primary.main' : 'divider',
                            borderRadius: 1,
                            bgcolor: dragActive ? 'action.hover' : 'transparent',
                            cursor: 'pointer',
                            '&:focus-within': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 }
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            aria-label={t('chooseCsvFile')}
                            onChange={(event) => {
                                updateFile(event.target.files?.[0] || null);
                                event.target.value = '';
                            }}
                            style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
                        />
                        <Typography sx={{ overflowWrap: 'anywhere' }}>{file ? file.name : t('dropCsvHere')}</Typography>
                        {!file && <Typography variant="body2" color="text.secondary">{t('chooseCsvFile')}</Typography>}
                    </Box>
                    {file && (
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{file.name}</Typography>
                            <IconButton
                                aria-label={t('removeSelectedFile')}
                                title={t('removeSelectedFile')}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    updateFile(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                            >
                                <HiOutlineTrash />
                            </IconButton>
                        </Stack>
                    )}

                    <RadioGroup
                        value={mode}
                        onChange={(event) => updateMode(event.target.value)}
                        aria-label={t('importModeLabel')}
                    >
                        <FormControlLabel value="merge" control={<Radio />} label={t('importModeMerge')} />
                        <Typography variant="body2" color="text.secondary" sx={{ ps: { xs: 1, sm: 6 }, pb: 1 }}>
                            {t('importModeMergeHelp')}
                        </Typography>
                        <FormControlLabel value="replace" control={<Radio />} label={t('importModeReplace')} />
                        <Typography variant="body2" color="text.secondary" sx={{ ps: { xs: 1, sm: 6 } }}>
                            {t('importModeReplaceHelp')}
                        </Typography>
                    </RadioGroup>
                    {mode === 'replace' && <Alert severity="warning">{t('replaceExistingWarning')}</Alert>}
                    {ambiguityPanel}

                    <Button
                        variant="outlined"
                        onClick={previewSelection}
                        disabled={!file || Boolean(busy) || (ambiguities.length > 0 && !ambiguitiesResolved(ambiguities, selections))}
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        {ambiguities.length > 0 ? t('previewWithMatches') : t('preview')}
                    </Button>
                    {busy && <LinearProgress aria-label={t('importing')} />}

                    {error && (
                        <Alert severity="error" role="alert">
                            <Typography component="div" dir="auto">{error.message}</Typography>
                            {error.retry && (
                                <Box sx={{ mt: 1 }}>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        sx={{ mt: 1 }}
                                        onClick={() => runPreview(usedMappings)}
                                    >
                                        {t('previewAgain')}
                                    </Button>
                                </Box>
                            )}
                            {error.retrySave && (
                                <Box sx={{ mt: 1 }}>
                                    <Button size="small" variant="contained" onClick={commit}>
                                        {t('retrySave')}
                                    </Button>
                                </Box>
                            )}
                        </Alert>
                    )}

                    {preview && (
                        <>
                            <Divider />
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                <Chip size="small" label={t('previewRowCount', { total: preview.summary?.totalRows || 0 })} />
                                <Chip size="small" color="success" label={t('previewValidCount', { total: preview.summary?.validRows || 0 })} />
                                {(conflictRows.length > 0) && (
                                    <Chip size="small" color="error" label={t('previewErrorCount', { total: conflictRows.length })} />
                                )}
                                {(preview.affectedGrades || []).map((grade) => (
                                    <Chip key={grade} size="small" variant="outlined" label={grade} />
                                ))}
                            </Stack>

                            {(preview.affectedGrades || []).length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('currentVersionsTitle')}</Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                        {Object.entries(preview.libraryVersions || {}).map(([grade, version]) => (
                                            <Chip
                                                key={grade}
                                                size="small"
                                                variant="outlined"
                                                label={t('libraryVersionChip', { grade, version })}
                                            />
                                        ))}
                                    </Stack>
                                </Box>
                            )}

                            {conflictRows.length > 0 && (
                                <Alert severity="error">
                                    <Typography variant="subtitle2">{t('validationErrors')}</Typography>
                                    <Box component="ul" sx={{ m: 0, ps: 2 }}>
                                        {conflictRows.map((rowError, index) => {
                                            const key = messageKey(rowError.message);
                                            return (
                                                <li key={`${rowError.row}-${index}`}>
                                                    {t('validationErrorRow', {
                                                        row: rowError.row,
                                                        message: key ? t(key) : rowError.message
                                                    })}
                                                </li>
                                            );
                                        })}
                                    </Box>
                                </Alert>
                            )}

                            {ready && preview.previewRows?.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('firstValidRows')}</Typography>
                                    <Stack spacing={1} sx={{ display: { xs: 'flex', sm: 'none' } }}>
                                        {preview.previewRows.map((row, index) => (
                                            <Box
                                                key={`${row.grade}-${row.week}-${row.order}-${index}`}
                                                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1, minWidth: 0 }}
                                            >
                                                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.word}</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                                                    {row.grade} · {t('week')} {row.week} · {row.category}
                                                </Typography>
                                                {row.definition && (
                                                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.definition}</Typography>
                                                )}
                                            </Box>
                                        ))}
                                    </Stack>
                                    <Box sx={{ display: { xs: 'none', sm: 'block' }, overflowX: 'auto' }}>
                                        <Table size="small" aria-label={t('firstValidRows')}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>{t('grade')}</TableCell>
                                                    <TableCell>{t('week')}</TableCell>
                                                    <TableCell>{t('category')}</TableCell>
                                                    <TableCell>{t('word')}</TableCell>
                                                    <TableCell>{t('library.definition')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {preview.previewRows.map((row, index) => (
                                                    <TableRow key={`${row.grade}-${row.week}-${row.order}-${index}`}>
                                                        <TableCell>{row.grade}</TableCell>
                                                        <TableCell>{row.week}</TableCell>
                                                        <TableCell sx={{ minWidth: 120 }}>{row.category}</TableCell>
                                                        <TableCell sx={{ minWidth: 100 }}>{row.word}</TableCell>
                                                        <TableCell sx={{ minWidth: 180 }}>{row.definition || ''}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                </Box>
                            )}

                            {ready && planned && (
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('plannedTitle')}</Typography>
                                    {plannedIsEmpty(planned) ? (
                                        <Typography variant="body2" color="text.secondary">{t('noChangesPlanned')}</Typography>
                                    ) : (
                                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                            {plannedEntries(planned)
                                                .filter((entry) => entry.key !== 'reusedArchived' || entry.value > 0)
                                                .map((entry) => (
                                                    <Chip
                                                        key={entry.key}
                                                        size="small"
                                                        label={t(`planned.${entry.key}`, { total: entry.value })}
                                                    />
                                                ))}
                                        </Stack>
                                    )}
                                </Box>
                            )}

                            {ready && preview.replaceScope?.length > 0 && (
                                <Alert severity="warning">
                                    <Typography variant="subtitle2">{t('replaceScopeTitle')}</Typography>
                                    <Box component="ul" sx={{ m: 0, ps: 2 }}>
                                        {preview.replaceScope.map((scope) => (
                                            <li key={scope.grade}>
                                                {t('replaceScopeLine', {
                                                    grade: scope.grade,
                                                    current: scope.currentWords,
                                                    removed: scope.removed,
                                                    added: scope.added,
                                                    kept: scope.kept
                                                })}
                                            </li>
                                        ))}
                                    </Box>
                                </Alert>
                            )}

                            {ready && preview.impact && (
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('library.impactTitle')}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        {t('library.impactIntro')}
                                    </Typography>
                                    <Box sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
                                        gap: 1
                                    }}>
                                        {impact.map((entry) => (
                                            <Box
                                                key={entry.key}
                                                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1, minWidth: 0 }}
                                            >
                                                <Typography variant="caption" color="text.secondary" component="div">
                                                    {t(IMPACT_LABELS[entry.key])}
                                                </Typography>
                                                <Typography variant="body1" component="div">{entry.value}</Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {ready && (
                                <>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label={t('library.importReasonLabel')}
                                        value={reason}
                                        onChange={(event) => setReason(event.target.value)}
                                        error={reason.trim().length > 0 && !reasonOk}
                                        helperText={reason.trim().length > 0 && !reasonOk
                                            ? t('library.reasonRequired')
                                            : t('library.importReasonHelp')}
                                        slotProps={{ htmlInput: { maxLength: 500 } }}
                                    />
                                    <Button
                                        variant="contained"
                                        color={preview.mode === 'replace' ? 'warning' : 'primary'}
                                        onClick={() => setConfirmOpen(true)}
                                        disabled={Boolean(busy) || !reasonOk}
                                        sx={{ alignSelf: 'flex-start' }}
                                    >
                                        {preview.mode === 'replace' ? t('replaceList') : t('commitImport')}
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={closeDialog} disabled={Boolean(busy)}>{t('cancel')}</Button>
            </DialogActions>

            <Dialog
                open={confirmOpen}
                onClose={busy ? undefined : () => setConfirmOpen(false)}
                fullWidth
                maxWidth="sm"
                sx={{ '& .MuiButton-root': { minHeight: { xs: 44 } } }}
            >
                <DialogTitle>{t('confirmImportTitle')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography>
                            {plannedIsEmpty(planned) ? t('confirmImportBodyNoChanges') : t('confirmImportBody', {
                                rows: preview?.summary?.validRows || 0,
                                grades: (preview?.affectedGrades || []).join(', ')
                            })}
                        </Typography>
                        {planned && !plannedIsEmpty(planned) && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('plannedTitle')}</Typography>
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    {plannedEntries(planned)
                                        .filter((entry) => entry.key !== 'reusedArchived' || entry.value > 0)
                                        .map((entry) => (
                                            <Chip
                                                key={entry.key}
                                                size="small"
                                                label={t(`planned.${entry.key}`, { total: entry.value })}
                                            />
                                        ))}
                                </Stack>
                            </Box>
                        )}
                        {preview?.mode === 'replace' && <Alert severity="warning">{t('replaceExistingWarning')}</Alert>}
                        {preview?.impact && (impact.some((entry) => entry.value > 0)) && (
                            <Typography variant="body2" color="text.secondary">
                                {t('confirmImpactSummary', {
                                    students: preview.impact.affectedStudents || 0,
                                    positions: preview.impact.changedPositions || 0
                                })}
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmOpen(false)} disabled={Boolean(busy)}>{t('cancel')}</Button>
                    <Button
                        variant="contained"
                        color={preview?.mode === 'replace' ? 'warning' : 'primary'}
                        onClick={commit}
                        disabled={Boolean(busy)}
                        startIcon={busy === 'commit' ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                        {busy === 'commit' ? t('importing') : t('confirmApply')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};

export default SpellingLibraryImportPanel;
