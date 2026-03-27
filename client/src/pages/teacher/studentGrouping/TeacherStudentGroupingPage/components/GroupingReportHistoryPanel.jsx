import {
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Pagination,
    Paper,
    Select,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';

const REPORT_TYPE_OPTIONS = [
    { value: '', label: 'All Reports' },
    { value: 'class-overview', label: 'Class Overview' },
    { value: 'per-standard', label: 'Per Standard' }
];

const REPORT_TYPE_LABELS = {
    'class-overview': 'Class Overview',
    'per-standard': 'Per Standard'
};

const formatDateTime = (value) => {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleString();
};

const formatFileSize = (bytes) => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const GroupingReportHistoryPanel = ({
    items,
    loading,
    pagination,
    page,
    reportType,
    downloadingReportId,
    onPageChange,
    onReportTypeChange,
    onDownload,
    onRefresh
}) => {
    const rows = Array.isArray(items) ? items : [];
    const hasRows = rows.length > 0;

    return (
        <Paper sx={{ mt: 2, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="h6" fontWeight={600}>Report History</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Archived grouping exports for this class.
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel id="grouping-report-type-label">Type</InputLabel>
                        <Select
                            labelId="grouping-report-type-label"
                            value={reportType}
                            label="Type"
                            onChange={(event) => onReportTypeChange(event.target.value)}
                        >
                            {REPORT_TYPE_OPTIONS.map((option) => (
                                <MenuItem key={option.value || 'all'} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button size="small" variant="outlined" onClick={onRefresh} disabled={loading}>
                        Refresh
                    </Button>
                </Box>
            </Box>

            {loading && (
                <Box sx={{ mt: 1 }}>
                    {[1, 2, 3].map((index) => (
                        <Skeleton key={index} variant="rectangular" height={42} sx={{ mb: 1, borderRadius: 1 }} />
                    ))}
                </Box>
            )}

            {!loading && !hasRows && (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        No archived grouping reports yet.
                    </Typography>
                </Box>
            )}

            {!loading && hasRows && (
                <>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600 }}>Generated</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Academic Year</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Standard</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Subject</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>By</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }} align="right">Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((report) => {
                                    const standardName = report?.standard?.code || report?.standard?.name || '-';
                                    const subjectName = report?.subject?.name || '-';
                                    const isDownloading = downloadingReportId === report.id;

                                    return (
                                        <TableRow key={report.id} hover>
                                            <TableCell>{formatDateTime(report.generatedAt)}</TableCell>
                                            <TableCell>{REPORT_TYPE_LABELS[report.reportType] || report.reportType || '-'}</TableCell>
                                            <TableCell>{report.academicYear || '-'}</TableCell>
                                            <TableCell>{standardName}</TableCell>
                                            <TableCell>{subjectName}</TableCell>
                                            <TableCell>{report?.generatedBy?.name || '-'}</TableCell>
                                            <TableCell>{formatFileSize(report.fileSize)}</TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => onDownload(report.id)}
                                                    disabled={isDownloading}
                                                >
                                                    {isDownloading ? 'Downloading...' : 'Download'}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {(pagination?.pages || 0) > 1 && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
                            <Pagination
                                size="small"
                                page={page}
                                count={pagination.pages}
                                onChange={(_, nextPage) => onPageChange(nextPage)}
                            />
                        </Box>
                    )}
                </>
            )}
        </Paper>
    );
};

export default GroupingReportHistoryPanel;
