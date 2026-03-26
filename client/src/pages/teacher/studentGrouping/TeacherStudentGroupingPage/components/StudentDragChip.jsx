import { Box, Chip, Typography } from '@mui/material';
import { getTrendIcon, getTrendColor } from '../utils/groupingHelpers';
import {
    HiOutlineArrowTrendingUp,
    HiOutlineArrowTrendingDown,
    HiOutlineMinus
} from 'react-icons/hi2';

const TREND_ICON_MAP = {
    improving: HiOutlineArrowTrendingUp,
    stable: HiOutlineMinus,
    declining: HiOutlineArrowTrendingDown
};

const StudentDragChip = ({ student, onDragStart }) => {
    const TrendIcon = TREND_ICON_MAP[student.trend] || HiOutlineMinus;

    return (
        <Box
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({
                    studentId: student.studentId,
                    name: student.name
                }));
                if (onDragStart) onDragStart(student);
            }}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                mb: 0.5,
                borderRadius: 1,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: student.isOverridden ? 'warning.light' : 'divider',
                cursor: 'grab',
                '&:hover': { bgcolor: 'action.hover' },
                '&:active': { cursor: 'grabbing' },
                position: 'relative'
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500} noWrap>
                    {student.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        {student.masteryPercentage}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        · {student.totalAttempts} attempts
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendIcon style={{ fontSize: 16, color: getTrendColor(student.trend) }} />
                {student.isOverridden && (
                    <Chip
                        label={student.overrideStale ? 'Stale' : 'Moved'}
                        size="small"
                        color={student.overrideStale ? 'warning' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                )}
            </Box>
        </Box>
    );
};

export default StudentDragChip;
