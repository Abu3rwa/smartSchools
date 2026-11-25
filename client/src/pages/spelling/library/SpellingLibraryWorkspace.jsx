import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import useSpellingLibrary from './useSpellingLibrary.js';
import SpellingWordTable from './SpellingWordTable.jsx';
import SpellingWordEditor from './SpellingWordEditor.jsx';
import SpellingLibraryImpactDialog from './SpellingLibraryImpactDialog.jsx';
import SpellingWeekOrderEditor from './SpellingWeekOrderEditor.jsx';
import SpellingWordHistoryPanel from './SpellingWordHistoryPanel.jsx';
import { GRADE_ORDER, rowCanEdit, rowPermissionReason, sortLibraryRows } from './libraryDeltas.js';

const BULK_LIMIT = 200;
const weeksForGrade = (grade) => (grade === 'KG' ? 40 : 36);

const permissionMessage = (t, reasonCode) => {
    if (reasonCode === 'SCOPE_FORBIDDEN') return t('library.permissionScope');
    if (reasonCode === 'ROLE_FORBIDDEN') return t('library.permissionRole');
    return t('library.readOnly');
};

const GatedButton = ({ blocked, reason, children, ...props }) => {
    if (!blocked) return <Button {...props}>{children}</Button>;
    return (
        <Tooltip title={reason}>
            <span>
                <Button {...props} disabled>{children}</Button>
            </span>
        </Tooltip>
    );
};

const BulkEditorDialog = ({ open, dialog, shown, categories, busy, error, onClose, onPreview }) => {
    const { t } = useTranslation('spelling');
    const [category, setCategory] = useState('');
    const [reason, setReason] = useState('');
    const tooLarge = (dialog?.ids?.length || 0) > BULK_LIMIT;
    const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;
    const canPreview = Boolean(category.trim()) && reasonOk && !busy && !tooLarge;

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            sx={{ '& .MuiAutocomplete-clearIndicator': { minWidth: { xs: 44 }, minHeight: { xs: 44 } } }}
        >
            <DialogTitle>{t('library.bulkTitle')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('library.selectedSummary', { selected: dialog?.ids?.length || 0, shown })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{t('library.bulkHelp')}</Typography>
                    {tooLarge && <Alert severity="warning">{t('library.bulkTooLarge')}</Alert>}
                    {error && <Alert severity="error" role="alert">{error.message}</Alert>}
                    <Autocomplete
                        freeSolo
                        options={categories}
                        value={category}
                        inputValue={category}
                        onInputChange={(_, value) => setCategory(value)}
                        onChange={(_, value) => setCategory(value || '')}
                        renderInput={(params) => <TextField {...params} label={t('library.bulkCategory')} />}
                    />
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
                    disabled={!canPreview}
                    onClick={() => onPreview(category.trim(), reason.trim())}
                >
                    {t('library.bulkApply')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const SpellingLibraryWorkspace = ({ refreshKey = 0 }) => {
    const { t } = useTranslation('spelling');
    const {
        filters,
        updateFilters,
        clearFilters,
        rows,
        categories,
        libraryVersions,
        capabilities,
        total,
        page,
        pageSize,
        loading,
        loadError,
        busy,
        reload,
        prepare,
        commit,
        loadHistory,
        loadWeek
    } = useSpellingLibrary();

    const [dialog, setDialog] = useState(null);
    const [impact, setImpact] = useState(null);
    const [flowError, setFlowError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [historyRow, setHistoryRow] = useState(null);
    const dialogTokenRef = useRef(0);
    const previousRefreshRef = useRef(refreshKey);

    // A new page, filter or import invalidates any earlier selection without an
    // effect: the stored key simply stops matching the current view.
    const selectionKey = [
        filters.grade,
        filters.week,
        filters.category,
        filters.search,
        filters.page,
        refreshKey
    ].join('|');
    const [selection, setSelection] = useState({ key: selectionKey, ids: [] });
    const selectedIds = selection.key === selectionKey ? selection.ids : [];
    const setSelectedIds = (updater) => {
        setSelection((current) => {
            const base = current.key === selectionKey ? current.ids : [];
            return {
                key: selectionKey,
                ids: typeof updater === 'function' ? updater(base) : updater
            };
        });
    };

    const nextDialogToken = () => {
        dialogTokenRef.current += 1;
        return dialogTokenRef.current;
    };

    useEffect(() => {
        if (refreshKey === previousRefreshRef.current) return;
        previousRefreshRef.current = refreshKey;
        reload();
    }, [refreshKey, reload]);

    const allowedGrades = capabilities?.canEditAllGrades
        ? GRADE_ORDER
        : (capabilities?.grades || []);
    const canAdd = Boolean(capabilities?.canEdit) && allowedGrades.length > 0;
    const addReason = capabilities?.canEdit
        ? permissionMessage(t, capabilities.reasonCode)
        : permissionMessage(t, capabilities?.reasonCode || 'ROLE_FORBIDDEN');

    const weekLimit = filters.grade ? weeksForGrade(filters.grade) : 40;
    const shownCount = rows.length;
    const hasNext = total ? page * pageSize < total : rows.length === pageSize;
    const selectedRows = rows.filter((row) => selectedIds.includes(String(row._id)));
    const selectedEditable = selectedRows.length > 0 && selectedRows.every((row) => rowCanEdit(row, capabilities));
    const bulkBlockedReason = selectedRows.length === 0
        ? t('library.bulkNeedsOne')
        : !selectedEditable
            ? permissionMessage(t, rowPermissionReason(selectedRows.find((row) => !rowCanEdit(row, capabilities)), capabilities))
            : selectedRows.length > BULK_LIMIT
                ? t('library.bulkTooLarge')
                : '';

    const startPreview = useCallback(async (operation, reason, meta = {}) => {
        setFlowError(null);
        const result = await prepare(operation);
        if (!result.ok) {
            setFlowError(result.error);
            return false;
        }
        setImpact({
            prepared: result.data,
            reason,
            operation,
            note: meta.note || '',
            warning: meta.warning || ''
        });
        return true;
    }, [prepare]);

    const closeImpact = () => {
        setImpact(null);
        setFlowError(null);
    };

    const finishSuccess = (kind, result) => {
        const saved = result?.changedRows?.length || 0;
        const added = result?.addedRows?.length || 0;
        if (kind === 'remove') setNotice({ severity: 'success', text: t('library.archivedNotice') });
        else if (kind === 'move') setNotice({ severity: 'success', text: t('library.movedNotice') });
        else if (kind === 'reorder') setNotice({ severity: 'success', text: t('library.reorderedNotice') });
        else if (kind === 'bulk') setNotice({ severity: 'success', text: t('library.bulkSavedNotice', { changed: saved + added }) });
        else setNotice({ severity: 'success', text: t('library.savedNotice') });
        const movedOutsideWeek = kind === 'move'
            && filters.week
            && String(impact?.operation?.toWeek) !== String(filters.week);
        const insertedOnFullPage = kind === 'add' && total >= pageSize;
        const scatteredByFilter = kind === 'bulk' && Boolean(filters.category);
        setDialog(null);
        setImpact(null);
        setFlowError(null);
        setSelectedIds([]);
        if (movedOutsideWeek || insertedOnFullPage || scatteredByFilter) reload();
    };

    const confirmImpact = async () => {
        if (!impact) return;
        const result = await commit(impact.prepared, impact.reason);
        if (!result.ok) {
            setFlowError(result.error);
            return;
        }
        finishSuccess(impact.operation.kind, result.data);
    };

    const startEditor = (kind, row = null) => {
        setFlowError(null);
        setNotice(null);
        setDialog({ kind, row, token: nextDialogToken() });
    };

    const openHistory = (row) => {
        setHistoryRow(row);
    };

    const openReorder = async (row) => {
        setFlowError(null);
        try {
            const data = await loadWeek(row.grade, row.week);
            if (!data || (data.total !== null && data.rows.length !== data.total)) {
                setNotice({ severity: 'error', text: t('library.loadFailed') });
                return;
            }
            setDialog({
                kind: 'reorder',
                grade: row.grade,
                week: row.week,
                weekRows: sortLibraryRows(data.rows),
                token: nextDialogToken()
            });
        } catch (loadError) {
            void loadError;
            setNotice({ severity: 'error', text: t('library.loadFailed') });
        }
    };

    const copyPage = async () => {
        const header = [t('word'), t('category'), t('library.definition'), t('order')].join('\t');
        const lines = rows.map((row) => [row.word, row.category, row.definition || '', row.order].join('\t'));
        try {
            await navigator.clipboard.writeText([header, ...lines].join('\n'));
            setNotice({ severity: 'success', text: t('library.copiedRows') });
        } catch (copyError) {
            void copyError;
            setNotice({ severity: 'error', text: t('library.copyFailed') });
        }
    };

    const editorPreview = (operation, reason) => {
        startPreview(operation, reason, {
            note: operation.kind === 'remove' ? t('library.archiveNote') : ''
        });
    };

    const bulkPreview = (category, reason) => {
        const changes = selectedRows.map((row) => ({
            wordId: row._id,
            patch: { category },
            expectedRevision: row.revision
        }));
        const grades = [...new Set(selectedRows.map((row) => row.grade))];
        const expectedLibraryVersions = Object.fromEntries(
            grades.filter((grade) => libraryVersions[grade]).map((grade) => [grade, libraryVersions[grade]])
        );
        startPreview({
            kind: 'bulk',
            changes,
            ...(Object.keys(expectedLibraryVersions).length ? { expectedLibraryVersions } : {})
        }, reason, {});
    };

    const reorderPreview = (orderedWordIds, reason) => {
        const expectedRevisions = Object.fromEntries(
            (dialog?.weekRows || []).map((row) => [String(row._id), row.revision])
        );
        startPreview({
            kind: 'reorder',
            grade: dialog.grade,
            week: dialog.week,
            orderedWordIds,
            expectedRevisions
        }, reason, {});
    };

    const toggleRow = (id, checked) => {
        const key = String(id);
        setSelectedIds((current) => (
            checked ? [...new Set([...current, key])] : current.filter((value) => value !== key)
        ));
    };

    const togglePage = (checked) => {
        setSelectedIds(checked ? rows.map((row) => String(row._id)) : []);
    };

    const showEmpty = !loading && !loadError && rows.length === 0;
    const hasFilters = Boolean(filters.grade || filters.week || filters.category || filters.search);

    return (
        <Stack
            spacing={2}
            sx={{
                '& .MuiButton-root': { minHeight: { xs: 44 } },
                '& .MuiCheckbox-root': { minWidth: { xs: 44 }, minHeight: { xs: 44 } }
            }}
        >
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 1.5, sm: 2 } }}>
                <Stack spacing={1.5}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{t('grade')}</InputLabel>
                            <Select
                                value={filters.grade}
                                label={t('grade')}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    updateFilters({
                                        grade: next,
                                        week: next && next !== 'KG' && Number(filters.week) > 36 ? '' : filters.week
                                    });
                                }}
                            >
                                <MenuItem value="">{t('allGrades')}</MenuItem>
                                {GRADE_ORDER.map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>{t('week')}</InputLabel>
                            <Select
                                value={filters.week}
                                label={t('week')}
                                onChange={(event) => updateFilters({ week: event.target.value })}
                            >
                                <MenuItem value="">{t('allWeeks')}</MenuItem>
                                {Array.from({ length: weekLimit }, (_, index) => index + 1).map((week) => (
                                    <MenuItem key={week} value={String(week)}>{t('weekWithNumber', { week })}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>{t('category')}</InputLabel>
                            <Select
                                value={filters.category}
                                label={t('category')}
                                onChange={(event) => updateFilters({ category: event.target.value })}
                            >
                                <MenuItem value="">{t('allCategories')}</MenuItem>
                                {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            size="small"
                            label={t('searchWords')}
                            value={filters.search}
                            onChange={(event) => updateFilters({ search: event.target.value })}
                        />
                    </Stack>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ sm: 'center' }}
                        justifyContent="space-between"
                    >
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                            <GatedButton
                                variant="contained"
                                size="small"
                                blocked={!canAdd}
                                reason={addReason}
                                onClick={() => startEditor('add')}
                            >
                                {t('library.addWord')}
                            </GatedButton>
                            <GatedButton
                                variant="outlined"
                                size="small"
                                blocked={Boolean(bulkBlockedReason)}
                                reason={bulkBlockedReason}
                                onClick={() => setDialog({ kind: 'bulk', ids: selectedIds, token: nextDialogToken() })}
                            >
                                {t('library.bulkEdit')}
                            </GatedButton>
                            <Button size="small" onClick={reload} disabled={loading}>{t('library.refresh')}</Button>
                            <Button size="small" onClick={copyPage} disabled={rows.length === 0}>
                                {t('library.copyRows')}
                            </Button>
                            {capabilities && !capabilities.canEdit && (
                                <Chip size="small" label={t('library.readOnly')} variant="outlined" />
                            )}
                        </Stack>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                            <Typography variant="body2" color="text.secondary" aria-live="polite">
                                {loading && rows.length === 0
                                    ? t('loadingWords')
                                    : total
                                        ? t('library.pageState', { page, shown: shownCount, total })
                                        : t('wordCount', { count: shownCount })}
                            </Typography>
                            <Button size="small" onClick={() => updateFilters({ page: page - 1 })} disabled={page <= 1 || loading}>
                                {t('library.previousPage')}
                            </Button>
                            <Button size="small" onClick={() => updateFilters({ page: page + 1 })} disabled={!hasNext || loading}>
                                {t('library.nextPage')}
                            </Button>
                        </Stack>
                    </Stack>
                </Stack>
            </Box>

            {notice && (
                <Alert severity={notice.severity} role="status" onClose={() => setNotice(null)}>
                    {notice.text}
                </Alert>
            )}
            {loadError && (
                <Alert
                    severity="error"
                    action={<Button size="small" onClick={reload}>{t('library.retry')}</Button>}
                >
                    {loadError.message || t('library.loadFailed')}
                </Alert>
            )}
            {loading && rows.length > 0 && <LinearProgress aria-label={t('loadingWords')} />}

            {showEmpty && (
                <Stack spacing={1} alignItems="flex-start" sx={{ py: 3 }}>
                    <Typography color="text.secondary">
                        {hasFilters ? t('noWords') : t('library.emptyLibrary')}
                    </Typography>
                    {!hasFilters && (
                        <GatedButton
                            variant="outlined"
                            size="small"
                            blocked={!canAdd}
                            reason={addReason}
                            onClick={() => startEditor('add')}
                        >
                            {t('library.addFirst')}
                        </GatedButton>
                    )}
                    {hasFilters && <Button size="small" onClick={clearFilters}>{t('clearFilters')}</Button>}
                </Stack>
            )}

            {!loadError && rows.length > 0 && (
                <SpellingWordTable
                    rows={rows}
                    capabilities={capabilities}
                    loading={loading}
                    busy={busy}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onTogglePage={togglePage}
                    onEdit={(row) => startEditor('edit', row)}
                    onMove={(row) => startEditor('move', row)}
                    onArchive={(row) => startEditor('archive', row)}
                    onHistory={openHistory}
                    onReorderWeek={openReorder}
                />
            )}

            {dialog?.kind === 'bulk' ? (
                <BulkEditorDialog
                    key={dialog.token}
                    open={!impact}
                    dialog={dialog}
                    shown={shownCount}
                    categories={categories}
                    busy={busy}
                    error={impact ? null : flowError}
                    onClose={() => { setDialog(null); setFlowError(null); }}
                    onPreview={bulkPreview}
                />
            ) : dialog ? (
                dialog.kind === 'reorder' ? (
                    <SpellingWeekOrderEditor
                        open={!impact}
                        resetKey={dialog.token}
                        weekRows={dialog.weekRows}
                        busy={busy}
                        error={impact ? null : flowError}
                        onClose={() => { setDialog(null); setFlowError(null); }}
                        onApply={reorderPreview}
                    />
                ) : (
                    <SpellingWordEditor
                        open={!impact}
                        resetKey={dialog.token}
                        mode={dialog.kind}
                        row={dialog.row}
                        grades={allowedGrades}
                        defaults={{
                            grade: filters.grade && allowedGrades.includes(filters.grade) ? filters.grade : allowedGrades[0],
                            week: filters.week || ''
                        }}
                        categories={categories}
                        busy={busy}
                        error={impact ? null : flowError}
                        onClose={() => { setDialog(null); setFlowError(null); }}
                        onPreview={editorPreview}
                    />
                )
            ) : null}

            <SpellingLibraryImpactDialog
                open={Boolean(impact)}
                impact={impact?.prepared?.impact || {}}
                note={impact?.note || ''}
                warning={impact?.warning || ''}
                busy={busy}
                error={flowError}
                onClose={closeImpact}
                onConfirm={confirmImpact}
            />

            <SpellingWordHistoryPanel
                open={Boolean(historyRow)}
                word={historyRow}
                loadHistory={loadHistory}
                onClose={() => setHistoryRow(null)}
            />
        </Stack>
    );
};

export default SpellingLibraryWorkspace;
