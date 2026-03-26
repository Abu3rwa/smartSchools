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
    Typography
} from '@mui/material';
import { getLevelColor, getLevelLabel, LEVELS_ORDERED } from '../utils/groupingHelpers';
import StudentDragChip from './StudentDragChip';
import ActivitySuggestionList from './ActivitySuggestionList';

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
                                    label={getLevelLabel(level)}
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
                                    students.map((student) => (
                                        <StudentDragChip
                                            key={student.studentId}
                                            student={student}
                                        />
                                    ))
                                )}
                            </Box>

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
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {notStarted.map((student) => (
                            <Chip
                                key={student.studentId}
                                label={student.name}
                                size="small"
                                variant="outlined"
                            />
                        ))}
                    </Box>
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
                            label={getLevelLabel(overrideDialog?.newLevel || '')}
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
