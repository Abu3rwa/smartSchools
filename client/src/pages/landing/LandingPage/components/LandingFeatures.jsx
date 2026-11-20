import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const LEARNING_CARDS = ['reading', 'spelling', 'writing'];

/**
 * The learning tools that exist today. Each card states what the school can
 * actually do; nothing here is inferred from a visitor's plan.
 */
export default function LandingFeatures({ copy }) {
    return (
        <Box component="section" id="learning-tools" className="landing-public-section">
            <Box className="landing-public-container">
                <Typography
                    component="h2"
                    id="learning-tools-heading"
                    tabIndex={-1}
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                        lineHeight: { xs: 1.3, lg: 1.2 },
                        mb: { xs: 2, md: 2.5 },
                        outline: 'none',
                    }}
                >
                    {copy.learning?.title}
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
                        gap: { xs: 2, md: 3 },
                    }}
                >
                    {LEARNING_CARDS.map((cardId) => {
                        const card = copy.learning?.[cardId] || {};
                        return (
                            <Box
                                key={cardId}
                                sx={{
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: { xs: '16px', md: '18px' },
                                    bgcolor: 'background.paper',
                                    p: { xs: 2, md: 3 },
                                    minWidth: 0,
                                }}
                            >
                                <Typography variant="h3" sx={{ fontWeight: 700, fontSize: '1.125rem', mb: 1.5 }}>
                                    {card.title}
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, lineHeight: 1.6 }}>
                                    {[card.bullet1, card.bullet2].map((bullet) => (
                                        <Box component="li" key={bullet} sx={{ fontSize: 16 }}>
                                            {bullet}
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mt: { xs: 2, md: 2.5 } }}>
                    {copy.learning?.availability}
                </Typography>

                <Box
                    sx={{
                        mt: { xs: 2, md: 2.5 },
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: { xs: '16px', md: '18px' },
                        p: { xs: 2, md: 3 },
                        bgcolor: 'background.paper',
                    }}
                >
                    <Typography sx={{ fontWeight: 700, mb: 0.75 }}>{copy.learning?.aiTitle}</Typography>
                    <Typography sx={{ fontSize: 16, lineHeight: 1.65, color: 'text.secondary' }}>
                        {copy.learning?.aiBody}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
