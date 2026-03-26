import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Select
} from '@mui/material';

const GroupingFilters = ({
    classes,
    subjectOptions,
    selectedClassId,
    selectedSubjectId,
    onClassChange,
    onSubjectChange
}) => {
    return (
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControl sx={{ minWidth: 250 }} size="small">
                <InputLabel>Select Class</InputLabel>
                <Select
                    value={selectedClassId}
                    label="Select Class"
                    onChange={(e) => onClassChange(e.target.value)}
                >
                    {classes.map((cls) => (
                        <MenuItem key={cls._id} value={cls._id}>
                            {cls.name || cls.className}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 250 }} size="small" disabled={!selectedClassId}>
                <InputLabel>Subject (Optional)</InputLabel>
                <Select
                    value={selectedSubjectId}
                    label="Subject (Optional)"
                    onChange={(e) => onSubjectChange(e.target.value)}
                >
                    <MenuItem value="">All Subjects</MenuItem>
                    {subjectOptions.map((subject) => (
                        <MenuItem key={subject._id} value={subject._id}>
                            {subject.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Box>
    );
};

export default GroupingFilters;
