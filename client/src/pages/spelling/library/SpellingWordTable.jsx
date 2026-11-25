import {
    Box,
    Card,
    Checkbox,
    IconButton,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography
} from '@mui/material';
import {
    HiOutlineArrowsRightLeft,
    HiOutlineBarsArrowUp,
    HiOutlineClock,
    HiOutlinePencilSquare,
    HiOutlineTrash
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { rowCanEdit, rowPermissionReason } from './libraryDeltas.js';

const permissionMessage = (t, reasonCode) => {
    if (reasonCode === 'SCOPE_FORBIDDEN') return t('library.permissionScope');
    if (reasonCode === 'ROLE_FORBIDDEN') return t('library.permissionRole');
    return t('library.readOnly');
};

const ActionIcon = ({ label, disabled, reason, onClick, mobile = false, children }) => {
    const button = (
        <span>
            <IconButton
                size="small"
                aria-label={label}
                disabled={disabled}
                onClick={onClick}
                sx={mobile ? { minWidth: 44, minHeight: 44 } : undefined}
            >
                {children}
            </IconButton>
        </span>
    );
    if (!disabled || !reason) return button;
    return (
        <Tooltip title={reason}>
            {button}
        </Tooltip>
    );
};

const RowActions = ({ row, capabilities, busy, mobile, onEdit, onMove, onArchive, onHistory, onReorderWeek }) => {
    const { t } = useTranslation('spelling');
    const editable = rowCanEdit(row, capabilities) && !busy;
    const reason = editable ? '' : permissionMessage(t, rowPermissionReason(row, capabilities));
    return (
        <Stack direction="row" spacing={mobile ? 0.25 : 0} alignItems="center">
            <ActionIcon mobile={mobile} label={`${t('editWord')}: ${row.word}`} disabled={!editable} reason={reason} onClick={() => onEdit(row)}>
                <HiOutlinePencilSquare />
            </ActionIcon>
            <ActionIcon mobile={mobile} label={`${t('library.reorderWeek')}: ${row.word}`} disabled={!editable} reason={reason} onClick={() => onReorderWeek(row)}>
                <HiOutlineBarsArrowUp />
            </ActionIcon>
            <ActionIcon mobile={mobile} label={`${t('library.moveWord')}: ${row.word}`} disabled={!editable} reason={reason} onClick={() => onMove(row)}>
                <HiOutlineArrowsRightLeft />
            </ActionIcon>
            <ActionIcon mobile={mobile} label={`${t('library.historyTitle')}: ${row.word}`} disabled={busy} reason={busy ? t('library.working') : ''} onClick={() => onHistory(row)}>
                <HiOutlineClock />
            </ActionIcon>
            <ActionIcon mobile={mobile} label={`${t('library.archiveTitle')}: ${row.word}`} disabled={!editable} reason={reason} onClick={() => onArchive(row)}>
                <HiOutlineTrash />
            </ActionIcon>
        </Stack>
    );
};

const SpellingWordTable = ({
    rows = [],
    capabilities = null,
    loading = false,
    busy = false,
    selectedIds = [],
    onToggleRow,
    onTogglePage,
    onEdit,
    onMove,
    onArchive,
    onHistory,
    onReorderWeek
}) => {
    const { t } = useTranslation('spelling');
    const selected = new Set(selectedIds.map(String));
    const pageSelected = rows.length > 0 && rows.every((row) => selected.has(String(row._id)));
    const pageIndeterminate = !pageSelected && rows.some((row) => selected.has(String(row._id)));
    const showSkeleton = loading && rows.length === 0;

    return (
        <Box>
            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
                <Table size="small" stickyHeader aria-label={t('library.title')}>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    size="small"
                                    checked={pageSelected}
                                    indeterminate={pageIndeterminate}
                                    onChange={(event) => onTogglePage(event.target.checked)}
                                    inputProps={{ 'aria-label': t('library.selectAll') }}
                                />
                            </TableCell>
                            <TableCell>{t('word')}</TableCell>
                            <TableCell>{t('category')}</TableCell>
                            <TableCell>{t('library.definition')}</TableCell>
                            <TableCell align="center">{t('order')}</TableCell>
                            <TableCell align="right">{t('library.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {showSkeleton && Array.from({ length: 6 }, (_, index) => (
                            <TableRow key={`skeleton-${index}`}>
                                <TableCell padding="checkbox"><Skeleton variant="circular" width={18} height={18} /></TableCell>
                                {Array.from({ length: 5 }, (_, cell) => (
                                    <TableCell key={cell}><Skeleton /></TableCell>
                                ))}
                            </TableRow>
                        ))}
                        {rows.map((row) => (
                            <TableRow key={row._id} hover>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        size="small"
                                        checked={selected.has(String(row._id))}
                                        onChange={(event) => onToggleRow(row._id, event.target.checked)}
                                        inputProps={{ 'aria-label': t('library.selectRow', { word: row.word }) }}
                                    />
                                </TableCell>
                                <TableCell sx={{ maxWidth: 220 }}>
                                    <Typography variant="body2" dir="auto" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                                        {row.word}
                                    </Typography>
                                </TableCell>
                                <TableCell sx={{ maxWidth: 160 }}>
                                    <Typography variant="body2" dir="auto" sx={{ overflowWrap: 'anywhere' }}>{row.category}</Typography>
                                </TableCell>
                                <TableCell sx={{ maxWidth: 360 }}>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        dir="auto"
                                        title={row.definition || ''}
                                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {row.definition || '—'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="center">{row.order}</TableCell>
                                <TableCell align="right">
                                    <RowActions
                                        row={row}
                                        capabilities={capabilities}
                                        busy={busy}
                                        mobile={false}
                                        onEdit={onEdit}
                                        onMove={onMove}
                                        onArchive={onArchive}
                                        onHistory={onHistory}
                                        onReorderWeek={onReorderWeek}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                {showSkeleton && Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={`skeleton-${index}`} variant="rounded" height={96} />
                ))}
                {rows.map((row) => (
                    <Card key={row._id} variant="outlined" sx={{ p: { xs: 1, sm: 1.5 } }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Checkbox
                                size="small"
                                checked={selected.has(String(row._id))}
                                onChange={(event) => onToggleRow(row._id, event.target.checked)}
                                inputProps={{ 'aria-label': t('library.selectRow', { word: row.word }) }}
                                sx={{ mt: -0.5, ml: -0.5 }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
                                    <Typography variant="subtitle2" dir="auto" sx={{ overflowWrap: 'anywhere' }}>{row.word}</Typography>
                                    <Typography variant="caption" color="text.secondary">{t('library.position', { order: row.order })}</Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary" dir="auto" component="div">
                                    {row.category}
                                </Typography>
                                {row.definition && (
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        dir="auto"
                                        sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                    >
                                        {row.definition}
                                    </Typography>
                                )}
                                <Box sx={{ mt: 0.5, mx: -1 }}>
                                    <RowActions
                                        row={row}
                                        capabilities={capabilities}
                                        busy={busy}
                                        mobile
                                        onEdit={onEdit}
                                        onMove={onMove}
                                        onArchive={onArchive}
                                        onHistory={onHistory}
                                        onReorderWeek={onReorderWeek}
                                    />
                                </Box>
                            </Box>
                        </Stack>
                    </Card>
                ))}
            </Stack>
        </Box>
    );
};

export default SpellingWordTable;
