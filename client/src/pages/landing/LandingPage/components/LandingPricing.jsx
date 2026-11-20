import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
    CAPACITY_LIMITS,
    formatPlanLimit,
    formatPlanPrice,
} from '../utils/landingPagePresentation.js';

const PLAN_GRID_COLUMNS = {
    xs: '1fr',
    sm: 'repeat(2, minmax(0, 1fr))',
    lg: 'repeat(3, minmax(0, 1fr))',
};

/**
 * Public pricing. Prices come from the active plans; a plan whose billing
 * tuple cannot be trusted shows the contact-pricing line instead of a number.
 */
export default function LandingPricing({ copy, plansState, language, demoStatus, onRetry, onSelectPlan }) {
    const { t } = useTranslation(['landing.page']);

    const plans = plansState.plans || [];
    const selectionBlocked = demoStatus === 'submitting' || demoStatus === 'success';

    const helperText =
        demoStatus === 'submitting'
            ? copy.pricing?.demoSending
            : demoStatus === 'success'
                ? copy.pricing?.demoReceived
                : '';

    const renderCard = (plan) => {
        const price = formatPlanPrice(plan.pricing, language);
        const capacityRows = CAPACITY_LIMITS.map((limit) => ({
            ...limit,
            formatted: formatPlanLimit(plan.limits?.[limit.key], language),
        })).filter((row) => Boolean(row.formatted));

        return (
            <Box
                key={plan.key}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: { xs: '16px', md: '18px' },
                    bgcolor: 'background.paper',
                    p: { xs: 2, md: 3 },
                    minWidth: 0,
                }}
            >
                <Typography variant="h3" sx={{ fontWeight: 700, fontSize: '1.125rem', mb: 1.5, overflowWrap: 'anywhere' }}>
                    {plan.name}
                </Typography>

                {price ? (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            sx={{ fontWeight: 800, fontSize: { xs: 32, md: 36 }, lineHeight: 1.2, overflowWrap: 'anywhere' }}
                        >
                            {price.amountText}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t(price.intervalKey)}
                        </Typography>
                    </Box>
                ) : (
                    <Typography sx={{ mb: 2, fontSize: 16, color: 'text.secondary' }}>
                        {copy.pricing?.contactPrice}
                    </Typography>
                )}

                <Divider sx={{ mb: 2 }} />

                {capacityRows.length > 0 ? (
                    <Box sx={{ display: 'grid', gap: 1, mb: 2 }}>
                        {capacityRows.map((row) => (
                            <Box
                                key={row.key}
                                sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: 16 }}
                            >
                                <Typography component="span" color="text.secondary">
                                    {t(`publicPage.${row.labelKey}`)}
                                </Typography>
                                <Typography component="span" sx={{ fontWeight: 600, textAlign: 'end' }}>
                                    {row.formatted.valueKey === 'publicPage.pricing.capped'
                                        ? t(row.formatted.valueKey, { value: row.formatted.value })
                                        : t(row.formatted.valueKey)}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                ) : null}

                {plan.publicFeatureKeys.length > 0 ? (
                    <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75, mb: 2 }}>
                        {plan.publicFeatureKeys.map((featureKey) => (
                            <Box component="li" key={featureKey} sx={{ fontSize: 16 }}>
                                {t(`publicPage.pricing.features.${featureKey}`)}
                            </Box>
                        ))}
                    </Box>
                ) : null}

                <Box sx={{ mt: 'auto' }}>
                    <Button
                        fullWidth
                        variant="contained"
                        disabled={selectionBlocked}
                        aria-label={t('publicPage.pricing.askPlanLabel', { name: plan.name })}
                        onClick={() => onSelectPlan(plan.key)}
                        sx={{ minHeight: 48, fontWeight: 600 }}
                    >
                        {copy.pricing?.askPlan}
                    </Button>
                    {helperText ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {helperText}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    };

    const renderNotice = (message, action) => (
        <Box
            sx={{
                border: 1,
                borderColor: 'divider',
                borderStyle: 'dashed',
                borderRadius: { xs: '16px', md: '18px' },
                p: { xs: 2.5, md: 3 },
                textAlign: 'center',
            }}
        >
            <Typography sx={{ fontSize: 16, lineHeight: 1.65, color: 'text.secondary', mb: 2 }}>{message}</Typography>
            <Stack gap={1.5} direction={{ xs: 'column', sm: 'row' }} justifyContent="center">
                {action}
            </Stack>
        </Box>
    );

    return (
        <Box component="section" id="pricing" className="landing-public-section">
            <Box className="landing-public-container">
                <Typography
                    component="h2"
                    id="pricing-heading"
                    tabIndex={-1}
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                        lineHeight: { xs: 1.3, lg: 1.2 },
                        mb: 1,
                        outline: 'none',
                    }}
                >
                    {copy.pricing?.title}
                </Typography>

                <Typography sx={{ fontSize: { xs: 16, md: 17 }, lineHeight: 1.65, color: 'text.secondary', mb: { xs: 2.5, md: 3 } }}>
                    {copy.pricing?.subtitle}
                </Typography>

                {plansState.status === 'loading' ? (
                    <Box>
                        <Typography role="status" aria-live="polite" sx={{ mb: 2, color: 'text.secondary' }}>
                            {copy.pricing?.loading}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: PLAN_GRID_COLUMNS, gap: { xs: 2, md: 3 } }}>
                            {[0, 1, 2].map((index) => (
                                <Skeleton
                                    key={index}
                                    variant="rounded"
                                    height={220}
                                    sx={{ display: { xs: index === 0 ? 'block' : 'none', sm: 'block' } }}
                                />
                            ))}
                        </Box>
                    </Box>
                ) : null}

                {plansState.status === 'empty' ? (
                    renderNotice(copy.pricing?.empty, (
                        <Button
                            variant="contained"
                            onClick={() => onSelectPlan('')}
                            sx={{ minHeight: 48, fontWeight: 600 }}
                        >
                            {copy.actions?.demo}
                        </Button>
                    ))
                ) : null}

                {plansState.status === 'error' ? (
                    renderNotice(copy.pricing?.error, [
                        <Button
                            key="retry"
                            variant="outlined"
                            onClick={onRetry}
                            sx={{ minHeight: 48 }}
                        >
                            {copy.actions?.retry}
                        </Button>,
                        <Button
                            key="demo"
                            variant="contained"
                            onClick={() => onSelectPlan('')}
                            sx={{ minHeight: 48, fontWeight: 600 }}
                        >
                            {copy.actions?.demo}
                        </Button>,
                    ])
                ) : null}

                {plansState.status === 'success' && plans.length > 0 ? (
                    plans.length === 1 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Box sx={{ width: '100%', maxWidth: 440 }}>{plans.map(renderCard)}</Box>
                        </Box>
                    ) : (
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns:
                                    plans.length === 2
                                        ? { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }
                                        : PLAN_GRID_COLUMNS,
                                gap: { xs: 2, md: 3 },
                                justifyContent: 'center',
                            }}
                        >
                            {plans.map(renderCard)}
                        </Box>
                    )
                ) : null}

                <Typography variant="body2" color="text.secondary" sx={{ mt: { xs: 2, md: 2.5 } }}>
                    {copy.pricing?.availability}
                </Typography>
            </Box>
        </Box>
    );
}
