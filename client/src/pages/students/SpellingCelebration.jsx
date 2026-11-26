import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getCelebrationTier, getLanternStats } from './spellingSessionPresentation';
import './SpellingCelebration.css';

const TIER_LABEL_KEYS = {
    sprout: 'celebrationSprout',
    bunch: 'celebrationBunch',
    garden: 'celebrationGarden',
    bouquet: 'celebrationBouquet'
};

const LanternIcon = () => (
    <svg viewBox="0 0 24 36" aria-hidden="true" focusable="false">
        <path className="spellc-lantern__handle" d="M9 4.2C9 2.4 10.3 1 12 1s3 1.4 3 3.2" fill="none" strokeWidth="1.5" />
        <rect className="spellc-lantern__metal" x="8" y="3.4" width="8" height="2" rx="1" />
        <path className="spellc-lantern__body" d="M12 5.4c3.3 0 6.8 2.2 7.9 6.1.9 3.2.3 6.6-1.5 9.3-1.6 2.4-3.9 3.8-6.4 3.8s-4.8-1.4-6.4-3.8c-1.8-2.7-2.4-6.1-1.5-9.3C5.2 7.6 8.7 5.4 12 5.4Z" />
        <ellipse className="spellc-lantern__core" cx="12" cy="15.3" rx="3.1" ry="4.3" />
        <rect className="spellc-lantern__metal" x="10.6" y="25.2" width="2.8" height="1.8" rx=".9" />
        <path className="spellc-lantern__metal" d="M12 27v4.2" fill="none" strokeWidth="1.5" />
    </svg>
);

/**
 * Sparks that burst once from the feedback banner. The parent renders it with
 * `key={attemptSequence}` so React remounts the DOM and the animation replays.
 */
export const SpellingWordBurst = () => (
    <span className="spellc-burst" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
            <span key={index} className="spellc-burst__spark" style={{ '--spark-index': index }} />
        ))}
    </span>
);

/**
 * End-of-session celebration. One lantern per answered word (capped), lit for
 * correct answers, with a tiered message and rising petals. Purely decorative
 * beyond the aria-label, and static under prefers-reduced-motion.
 */
const SpellingCelebration = ({ attempts = [], correctCount }) => {
    const { t } = useTranslation('spelling');
    const stats = getLanternStats({ attempts });
    const tier = getCelebrationTier(stats.answered);
    const correct = Number.isFinite(Number(correctCount)) ? Number(correctCount) : stats.correct;
    const lit = Math.max(0, Math.min(correct, stats.answered));
    const litLanterns = Math.min(lit, stats.lanterns);

    return (
        <Box
            className={`spellc-celebration spellc-celebration--${tier}`}
            sx={{ position: 'relative', width: '100%', maxWidth: 560, mx: 'auto', px: 2, py: 2.5, textAlign: 'center' }}
        >
            <Box className="spellc-celebration__glow" aria-hidden="true" />
            <Stack
                role="img"
                aria-label={t('celebrationLightsAria', { lit, total: stats.answered })}
                direction="row"
                spacing={0.5}
                justifyContent="center"
                alignItems="flex-end"
                flexWrap="wrap"
                useFlexGap
                sx={{ position: 'relative' }}
            >
                {Array.from({ length: stats.lanterns }, (_, index) => (
                    <span
                        key={index}
                        className={`spellc-lantern${index < litLanterns ? ' is-lit' : ''}`}
                        style={{ '--lantern-index': index }}
                        aria-hidden="true"
                    >
                        <LanternIcon />
                    </span>
                ))}
                {stats.hidden > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', fontWeight: 700 }}>
                        {`\u200E+${stats.hidden}`}
                    </Typography>
                )}
            </Stack>
            <Typography variant="h6" sx={{ position: 'relative', fontWeight: 800, mt: 1.5 }}>
                {t(TIER_LABEL_KEYS[tier] || 'celebrationSprout')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ position: 'relative', mt: 0.25 }}>
                {t('celebrationSubtitle', { value: stats.answered })}
            </Typography>
            <Box className="spellc-celebration__petals" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => (
                    <span
                        key={index}
                        className="spellc-petal"
                        style={{ '--petal-index': index, '--petal-x': `${8 + index * 9.2}%` }}
                    />
                ))}
            </Box>
        </Box>
    );
};

export default SpellingCelebration;
