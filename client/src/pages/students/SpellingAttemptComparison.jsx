import { Box } from '@mui/material';

/**
 * A wrong answer has to show both words without ambiguity. "stationery ×
 * stationary" was unreadable, so the student's attempt is struck through and
 * the correct spelling follows an arrow.
 */
const SpellingAttemptComparison = ({ typed, correct }) => (
    <Box
        component="span"
        dir="ltr"
        sx={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}
    >
        <Box component="del" sx={{ opacity: 0.75 }}>{typed}</Box>
        <Box component="span" aria-hidden="true" sx={{ opacity: 0.6 }}>→</Box>
        <Box component="strong">{correct}</Box>
    </Box>
);

export default SpellingAttemptComparison;
