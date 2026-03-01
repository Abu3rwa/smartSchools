import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { HiOutlineAcademicCap } from 'react-icons/hi';

/**
 * Full-page loading state. Uses existing CSS: landing-loading-shell, landing-loading-logo.
 */
export default function LandingLoadingState({ content }) {
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
            <Paper className="landing-loading-shell" variant="outlined">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box className="landing-loading-logo">
                        <HiOutlineAcademicCap size={20} />
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
