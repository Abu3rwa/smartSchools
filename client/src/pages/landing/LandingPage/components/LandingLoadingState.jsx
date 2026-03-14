import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Full-page loading state with brand logo.
 */
export default function LandingLoadingState({ content }) {
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
            <Paper className="landing-loading-shell" variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box className="landing-loading-logo" sx={{ overflow: 'hidden', p: 0.5 }}>
                        <img src="/logo.svg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{content.brand.name}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Loading school experience...
                </Typography>
                <CircularProgress size={24} />
            </Paper>
        </Box>
    );
}
