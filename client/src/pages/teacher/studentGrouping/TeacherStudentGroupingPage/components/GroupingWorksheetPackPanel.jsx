import {
    Box,
    Button,
    Chip,
    Paper,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';

const STATUS_COLOR_MAP = {
    draft: 'default',
    ended: 'warning',
    published: 'success'
};

const formatDateTime = (value) => {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString();
};

const getStatusColor = (status) => STATUS_COLOR_MAP[status] || 'default';

const GroupingWorksheetPackPanel = ({
    packs,
    loading,
    creatingDraft,
    endingPackId,
    publishingPackId,
    downloadingPackId,
    printingPackId,
    onCreateDraft,
    onEndAuthoring,
    onPublish,
    onDownload,
    onPrint,
    onRefresh
}) => {
    const rows = Array.isArray(packs) ? packs : [];

    return (
        <Paper sx={{ mt: 2, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Box>
                    <Typography variant="h6" fontWeight={600}>Grouping Activity Worksheet Packs</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Draft from regrouping activities, then end authoring before publish, download, or print.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Answer spaces are shown in the exported worksheet PDF, not in this table preview.
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        size="small"
                        variant="contained"
                        onClick={onCreateDraft}
                        disabled={creatingDraft}
                    >
                        {creatingDraft ? 'Creating...' : 'Create Draft Pack'}
                    </Button>
                </Box>
            </Box>

            {loading && (
                <Box>
                    {[1, 2, 3].map((index) => (
                        <Skeleton key={index} variant="rectangular" height={40} sx={{ mb: 1, borderRadius: 1 }} />
                    ))}
                </Box>
            )}

            {!loading && rows.length === 0 && (
                <Box sx={{ py: 2, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        No worksheet packs for this standard yet.
                    </Typography>
                </Box>
            )}

            {!loading && rows.length > 0 && (
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Activities</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Answer Space</TableCell>
                                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((pack) => {
                                const isDraft = pack.status === 'draft';
                                const canDistribute = pack.status === 'ended' || pack.status === 'published';
                                const lineCount = Number(pack?.worksheetLayout?.responseLineCount || 6);
                                const hasWorkBox = pack?.worksheetLayout?.includeWorkBox !== false;
                                const answerSpaceSummary = `${lineCount} lines${hasWorkBox ? ' + work box' : ''}`;

                                return (
                                    <TableRow key={pack.id} hover>
                                        <TableCell>{formatDateTime(pack.generatedAt)}</TableCell>
                                        <TableCell>{pack.title || '-'}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={pack.status || 'draft'}
                                                size="small"
                                                color={getStatusColor(pack.status)}
                                            />
                                        </TableCell>
                                        <TableCell>{pack.version || 1}</TableCell>
                                        <TableCell>{pack?.metadata?.totalActivities || 0}</TableCell>
                                        <TableCell>{answerSpaceSummary}</TableCell>
                                        <TableCell align="right">
                                            <Box sx={{ display: 'inline-flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => onEndAuthoring(pack.id)}
                                                    disabled={!isDraft || endingPackId === pack.id}
                                                >
                                                    {endingPackId === pack.id ? 'Ending...' : 'End Authoring'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => onPublish(pack.id)}
                                                    disabled={pack.status !== 'ended' || publishingPackId === pack.id}
                                                >
                                                    {publishingPackId === pack.id ? 'Publishing...' : 'Publish'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => onDownload(pack.id)}
                                                    disabled={!canDistribute || downloadingPackId === pack.id}
                                                >
                                                    {downloadingPackId === pack.id ? 'Downloading...' : 'Download'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => onPrint(pack.id)}
                                                    disabled={!canDistribute || printingPackId === pack.id}
                                                >
                                                    {printingPackId === pack.id ? 'Printing...' : 'Print'}
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Paper>
    );
};

export default GroupingWorksheetPackPanel;
