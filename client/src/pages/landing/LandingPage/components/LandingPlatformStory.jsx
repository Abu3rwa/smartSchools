import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import {
    HiOutlineOfficeBuilding,
    HiOutlineAcademicCap,
    HiOutlineUserGroup,
    HiOutlineSparkles,
    HiOutlineCheckCircle
} from 'react-icons/hi';

const PORTAL_ICONS = [HiOutlineOfficeBuilding, HiOutlineAcademicCap, HiOutlineUserGroup];
const PORTAL_KEYS = ['admin', 'teacher', 'student'];

export default function LandingPlatformStory({ uiText }) {
    const copy = uiText?.platformStory || {};

    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    {copy.overline || 'Built for every role'}
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    {copy.title || 'One platform, three focused portals'}
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 620, mx: 'auto', mb: 5, fontSize: '1.05rem', lineHeight: 1.7 }}>
                    {copy.subtitle || 'Everyone sees the work that matters to them — and nothing else.'}
                </Typography>

                <div className="landing-card-grid">
                    {PORTAL_KEYS.map((key, index) => {
                        const Icon = PORTAL_ICONS[index];
                        const points = [copy[`${key}Point1`], copy[`${key}Point2`], copy[`${key}Point3`]].filter(Boolean);
                        return (
                            <Paper key={key} className="landing-lift-card" variant="outlined" sx={{ p: 3.5, borderRadius: 3, height: '100%' }}>
                                <Box sx={{ display: 'inline-flex', p: 1.5, mb: 2, borderRadius: 2, bgcolor: 'rgba(13, 148, 136, 0.1)', color: 'var(--primary, #0d9488)' }}>
                                    <Icon size={26} />
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                                    {copy[`${key}Title`] || key}
                                </Typography>
                                <Typography color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.7 }}>
                                    {copy[`${key}Body`] || ''}
                                </Typography>
                                <Box sx={{ display: 'grid', gap: 1 }}>
                                    {points.map((point) => (
                                        <Box key={point} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, color: 'text.secondary', typography: 'body2' }}>
                                            <HiOutlineCheckCircle size={17} style={{ color: 'var(--primary, #0d9488)', flexShrink: 0, marginTop: 2 }} />
                                            <span>{point}</span>
                                        </Box>
                                    ))}
                                </Box>
                            </Paper>
                        );
                    })}
                </div>

                <Paper
                    elevation={0}
                    sx={{
                        mt: 3,
                        p: { xs: 3, md: 4 },
                        borderRadius: 3,
                        border: 1,
                        borderColor: 'divider',
                        background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(13, 148, 136, 0.02))',
                        display: 'flex',
                        gap: 2.5,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                    }}
                >
                    <Box sx={{ display: 'inline-flex', p: 1.5, borderRadius: 2, bgcolor: 'background.paper', color: 'var(--primary, #0d9488)' }}>
                        <HiOutlineSparkles size={26} />
                    </Box>
                    <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.75 }}>
                            {copy.aiTitle || 'AI that stays on the curriculum'}
                        </Typography>
                        <Typography color="text.secondary" sx={{ lineHeight: 1.7, maxWidth: 760 }}>
                            {copy.aiBody || 'The AI tutor and voice tutor answer only from imported lessons. Writing and reading feedback follow your rubric. Spelling analysis reports and class insights are built from the data already in your gradebook, and lesson plans, newsletters and parent messages get AI drafts. Every AI call is metered against a school credit pool.'}
                        </Typography>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
}
