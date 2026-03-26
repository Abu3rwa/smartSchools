import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Chip,
    Skeleton
} from '@mui/material';
import { LEVELS_ORDERED, getLevelColor, getLevelLabel } from '../utils/groupingHelpers';

const StudentGroupOverview = ({ overview, overviewLoading, onStandardClick }) => {
    if (overviewLoading) {
        return (
            <Box sx={{ mt: 2 }}>
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} variant="rectangular" height={48} sx={{ mb: 1, borderRadius: 1 }} />
                ))}
            </Box>
        );
    }

    if (!overview || overview.length === 0) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
                <Typography color="text.secondary">
                    No standards data available for this class. Assign standards and have students practice to see grouping data.
                </Typography>
            </Paper>
        );
    }

    return (
        <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>Standard</TableCell>
                        {LEVELS_ORDERED.map((level) => (
                            <TableCell key={level} align="center" sx={{ fontWeight: 600 }}>
                                <Chip
                                    label={getLevelLabel(level)}
                                    color={getLevelColor(level)}
                                    size="small"
                                    variant="outlined"
                                />
                            </TableCell>
                        ))}
                        <TableCell align="center" sx={{ fontWeight: 600 }}>Not Started</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600 }}>Total</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {overview.map((row) => (
                        <TableRow
                            key={row.standardId}
                            hover
                            sx={{ cursor: 'pointer' }}
                            onClick={() => onStandardClick(row.standardId)}
                        >
                            <TableCell>
                                <Typography variant="body2" fontWeight={500}>
                                    {row.identifier}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 300, display: 'block' }}>
                                    {row.description}
                                </Typography>
                            </TableCell>
                            {LEVELS_ORDERED.map((level) => (
                                <TableCell key={level} align="center">
                                    <Chip
                                        label={row.counts?.[level] || 0}
                                        color={row.counts?.[level] > 0 ? getLevelColor(level) : 'default'}
                                        size="small"
                                        variant={row.counts?.[level] > 0 ? 'filled' : 'outlined'}
                                    />
                                </TableCell>
                            ))}
                            <TableCell align="center">
                                <Chip
                                    label={row.counts?.notStarted || 0}
                                    size="small"
                                    variant="outlined"
                                />
                            </TableCell>
                            <TableCell align="center">
                                <Typography variant="body2">{row.totalStudents}</Typography>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default StudentGroupOverview;
