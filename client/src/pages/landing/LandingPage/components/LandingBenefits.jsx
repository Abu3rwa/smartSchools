import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { HiOutlineClock, HiOutlineUserGroup, HiOutlineViewGrid } from 'react-icons/hi';

const benefits = [
    {
        icon: HiOutlineClock,
        title: 'Save Teacher Time',
        description: 'Automate grade calculations, attendance tracking, and report generation. Teachers spend less time on paperwork and more time teaching.',
        stat: '70%',
        statLabel: 'less admin work',
    },
    {
        icon: HiOutlineUserGroup,
        title: 'Engage Parents',
        description: 'Keep families connected with real-time grade updates, attendance alerts, and a dedicated parent mobile app for instant access.',
        stat: '3×',
        statLabel: 'more parent engagement',
    },
    {
        icon: HiOutlineViewGrid,
        title: 'Centralize Operations',
        description: 'Replace scattered spreadsheets with one unified platform. Manage schedules, substitutions, behavior tracking, and communications in one place.',
        stat: '1',
        statLabel: 'platform for everything',
    },
];

/**
 * Benefits section — uses .landing-card-grid for equal width cards.
 */
export default function LandingBenefits() {
    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    WHY CHOOSE US
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    Built for Modern Schools
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 600, mx: 'auto', mb: 5, fontSize: '1.05rem', lineHeight: 1.7 }}>
                    Everything your school needs to run efficiently, communicate effectively, and make data-driven decisions.
                </Typography>

                <div className="landing-card-grid">
                    {benefits.map(({ icon: Icon, title, description, stat, statLabel }) => (
                        <Paper
                            key={title}
                            className="landing-lift-card"
                            variant="outlined"
                            sx={{
                                p: 3.5,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                height: '100%',
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            <Box
                                sx={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 2.5,
                                    background: 'var(--brand-gradient)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    mb: 2,
                                    color: '#fff',
                                    flexShrink: 0,
                                }}
                            >
                                <Icon size={26} />
                            </Box>
                            <Typography
                                sx={{
                                    fontWeight: 800,
                                    fontSize: '2rem',
                                    background: 'var(--brand-gradient)',
                                    backgroundClip: 'text',
                                    color: 'transparent',
                                    lineHeight: 1.2,
                                    mb: 0.25,
                                }}
                            >
                                {stat}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                                {statLabel}
                            </Typography>
                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, flex: 1 }}>
                                {description}
                            </Typography>
                        </Paper>
                    ))}
                </div>
            </Container>
        </Box>
    );
}
