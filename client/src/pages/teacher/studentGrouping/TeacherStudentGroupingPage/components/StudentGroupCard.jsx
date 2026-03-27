import { useState, useCallback } from 'react';
import {
    Box,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Skeleton,
    TextField,
    Button,
    Typography,
    Pagination
} from '@mui/material';
import { getLevelColor, getLevelLabel, LEVELS_ORDERED } from '../utils/groupingHelpers';
import StudentDragChip from './StudentDragChip';
import ActivitySuggestionList from './ActivitySuggestionList';

const STUDENTS_PER_PAGE = 12;
const NOT_STARTED_PER_PAGE = 24;

const buildInitialPages = () => LEVELS_ORDERED.reduce((acc, level) => {
    acc[level] = 1;
    return acc;
}, {});

const StudentGroupCard = ({
    groups,
    notStarted,
    loading,
    overrideSaving,
    activitiesRefreshing,
    onOverride,
    onRefreshActivities
}) => {
    const [overrideDialog, setOverrideDialog] = useState(null);
    const [reason, setReason] = useState('');
    const [pageByLevel, setPageByLevel] = useState(buildInitialPages);
    const [notStartedPage, setNotStartedPage] = useState(1);

    const getDisplayLevelLabel = useCallback((level) => {
        const group = groups.find((item) => item.level === level);
        return group?.label || getLevelLabel(level);
    }, [groups]);

    const handleDrop = useCallback((level) => (e) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            setOverrideDialog({ ...data, newLevel: level });
            setReason('');
        } catch {
            // ignore invalid drops
        }
    }, []);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleConfirmOverride = useCallback(async () => {
        if (!overrideDialog) return;
        await onOverride({
            studentId: overrideDialog.studentId,
            newLevel: overrideDialog.newLevel,
            reason
        });
        setOverrideDialog(null);
        setReason('');
    }, [overrideDialog, reason, onOverride]);

    const handleLevelPageChange = useCallback((level, page) => {
        setPageByLevel((prev) => ({
            ...prev,
            [level]: page
        }));
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2 }}>
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
                ))}
            </Box>
        );
    }

    return (
        <>
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 2,
                mt: 2
            }}>
                {LEVELS_ORDERED.map((level) => {
                    const group = groups.find((g) => g.level === level);
                    const students = group?.students || [];
                    const activities = group?.suggestedActivities || [];
                    const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
                    const activePage = Math.min(pageByLevel[level] || 1, totalPages);
                    const offset = (activePage - 1) * STUDENTS_PER_PAGE;
                    const visibleStudents = students.slice(offset, offset + STUDENTS_PER_PAGE);

                    return (
                        <Paper
                            key={level}
                            elevation={1}
                            onDrop={handleDrop(level)}
                            onDragOver={handleDragOver}
                            sx={{
                                p: 1.5,
                                borderTop: 3,
                                borderColor: `${getLevelColor(level)}.main`,
                                minHeight: 200,
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Chip
                                    label={getDisplayLevelLabel(level)}
                                    color={getLevelColor(level)}
                                    size="small"
                                />
                                <Typography variant="caption" color="text.secondary">
                                    {students.length} student{students.length !== 1 ? 's' : ''}
                                </Typography>
                            </Box>

                            <Box sx={{ flex: 1, overflowY: 'auto', maxHeight: 350 }}>
                                {students.length === 0 ? (
                                    <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block', textAlign: 'center' }}>
                                        No students at this level
                                    </Typography>
                                ) : (
                                    visibleStudents.map((student) => (
                                        <StudentDragChip
                                            key={student.studentId}
                                            student={student}
                                        />
                                    ))
                                )}
                            </Box>

                            {students.length > STUDENTS_PER_PAGE && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                                    <Pagination
                                        size="small"
                                        count={totalPages}
                                        page={activePage}
                                        onChange={(_, page) => handleLevelPageChange(level, page)}
                                    />
                                </Box>
                            )}

                            <ActivitySuggestionList
                                activities={activities}
                                level={level}
                                onRefresh={onRefreshActivities}
                                refreshing={activitiesRefreshing}
                            />
                        </Paper>
                    );
                })}
            </Box>

            {/* Not Started section */}
            {notStarted && notStarted.length > 0 && (
                <Paper sx={{ mt: 2, p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Not Started ({notStarted.length})
                    </Typography>
                    {(() => {
                        const totalNotStartedPages = Math.max(1, Math.ceil(notStarted.length / NOT_STARTED_PER_PAGE));
                        const activeNotStartedPage = Math.min(notStartedPage, totalNotStartedPages);
                        const offset = (activeNotStartedPage - 1) * NOT_STARTED_PER_PAGE;
                        const visibleNotStarted = notStarted.slice(offset, offset + NOT_STARTED_PER_PAGE);

                        return (
                            <>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {visibleNotStarted.map((student) => (
                            <Chip
                                key={student.studentId}
                                label={student.name}
                                size="small"
                                variant="outlined"
                            />
                        ))}
                    </Box>

                                {notStarted.length > NOT_STARTED_PER_PAGE && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2 }}>
                                        <Pagination
                                            size="small"
                                            count={totalNotStartedPages}
                                            page={activeNotStartedPage}
                                            onChange={(_, page) => setNotStartedPage(page)}
                                        />
                                    </Box>
                                )}
                            </>
                        );
                    })()}
                </Paper>
            )}

            {/* Override confirmation dialog */}
            <Dialog
                open={Boolean(overrideDialog)}
                onClose={() => setOverrideDialog(null)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Move Student</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Move <strong>{overrideDialog?.name}</strong> to{' '}
                        <Chip
                            label={getDisplayLevelLabel(overrideDialog?.newLevel || '')}
                            color={getLevelColor(overrideDialog?.newLevel || '')}
                            size="small"
                        />
                        ?
                    </Typography>
                    <TextField
                        label="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                        size="small"
                        inputProps={{ maxLength: 500 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOverrideDialog(null)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmOverride}
                        disabled={overrideSaving}
                    >
                        {overrideSaving ? 'Saving...' : 'Confirm'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default StudentGroupCard;
