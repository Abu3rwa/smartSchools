import { ToggleButton, ToggleButtonGroup } from '@mui/material';

const CoverageTypeSelector = ({ value, onChange }) => (
  <ToggleButtonGroup value={value} exclusive onChange={(_, next) => next && onChange(next)} sx={{ mb: 2 }}>
    <ToggleButton value="SINGLE_TEACHER_ALL_PERIODS">Single teacher (all periods)</ToggleButton>
    <ToggleButton value="PER_PERIOD">Per period</ToggleButton>
  </ToggleButtonGroup>
);

export default CoverageTypeSelector;