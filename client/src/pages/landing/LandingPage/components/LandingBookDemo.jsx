import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { submitDemoRequest } from '../../../../services/landingContentService.js';
import { composeDemoMessage, validateDemoForm } from '../utils/landingPagePresentation.js';

const EMPTY_VALUES = { name: '', schoolName: '', email: '', phone: '', role: '', message: '' };

const FIELD_IDS = {
    name: 'demo-name',
    schoolName: 'demo-schoolName',
    email: 'demo-email',
    phone: 'demo-phone',
    role: 'demo-role',
    plan: 'demo-plan',
    message: 'demo-message',
};

const FIELD_ORDER = ['name', 'schoolName', 'email', 'phone', 'role', 'message'];

const KNOWN_SERVER_FIELDS = ['name', 'schoolName', 'email', 'phone', 'role', 'message'];

/**
 * Demo enquiry form. The component owns the field values, the inline errors
 * and the submission state; the page only learns the submission status so it
 * can coordinate the pricing call to action.
 */
export default function LandingBookDemo({
    copy,
    language,
    planOptions,
    selectedPlanKey,
    planNotice,
    onPlanChange,
    onClearPlan,
    onStatusChange,
    onOpenFinder,
}) {
    const { t } = useTranslation(['landing.page']);

    const [values, setValues] = useState(EMPTY_VALUES);
    const [errors, setErrors] = useState({});
    const [submissionState, setSubmissionState] = useState({
        status: 'idle',
        formError: '',
        retryAfterSeconds: null,
    });
    const [rateLimitActive, setRateLimitActive] = useState(false);

    const valuesRef = useRef(values);
    const errorsRef = useRef(errors);
    const lockRef = useRef(false);
    const successHeadingRef = useRef(null);
    const rateLimitTimerRef = useRef(null);

    const selectedPlan = useMemo(
        () => planOptions.find((option) => option.key === selectedPlanKey) || null,
        [planOptions, selectedPlanKey]
    );

    const composed = useMemo(
        () => composeDemoMessage(values.message, selectedPlan, language, t),
        [values.message, selectedPlan, language, t]
    );

    const planChoices = planOptions.length > 0 ? planOptions : selectedPlan ? [selectedPlan] : [];

    const buildComposed = (nextValues) =>
        composeDemoMessage(nextValues.message, selectedPlan, language, t);

    useEffect(() => {
        if (submissionState.status === 'success' && successHeadingRef.current) {
            successHeadingRef.current.focus({ preventScroll: true });
        }
    }, [submissionState.status]);

    useEffect(
        () => () => {
            if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
        },
        []
    );

    const applyValues = (nextValues) => {
        valuesRef.current = nextValues;
        setValues(nextValues);
    };

    const applyErrors = (nextErrors) => {
        errorsRef.current = nextErrors;
        setErrors(nextErrors);
    };

    const handleFieldChange = (field) => (event) => {
        const nextValues = { ...valuesRef.current, [field]: event.target.value };
        applyValues(nextValues);

        if (errorsRef.current[field]) {
            const validated = validateDemoForm(nextValues, buildComposed(nextValues).message);
            const merged = { ...errorsRef.current };
            if (validated[field]) merged[field] = validated[field];
            else delete merged[field];
            applyErrors(merged);
        }
    };

    const focusFirstInvalid = (fieldErrors) => {
        const field = FIELD_ORDER.find((name) => fieldErrors[name]);
        if (!field) return;
        const element = document.getElementById(FIELD_IDS[field]);
        if (element) element.focus();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (lockRef.current) return;

        const plan = planOptions.find((option) => option.key === selectedPlanKey) || null;
        const submissionMessage = composeDemoMessage(valuesRef.current.message, plan, language, t);
        const validationErrors = validateDemoForm(valuesRef.current, submissionMessage.message);

        if (Object.keys(validationErrors).length > 0) {
            applyErrors(validationErrors);
            focusFirstInvalid(validationErrors);
            return;
        }

        lockRef.current = true;
        setSubmissionState({ status: 'submitting', formError: '', retryAfterSeconds: null });
        onStatusChange('submitting');

        try {
            await submitDemoRequest({
                name: valuesRef.current.name.trim(),
                schoolName: valuesRef.current.schoolName.trim(),
                email: valuesRef.current.email.trim(),
                phone: valuesRef.current.phone.trim(),
                role: valuesRef.current.role.trim(),
                message: submissionMessage.message,
                locale: language,
            });

            applyValues(EMPTY_VALUES);
            applyErrors({});
            onClearPlan();
            setSubmissionState({ status: 'success', formError: '', retryAfterSeconds: null });
            onStatusChange('success');
        } catch (error) {
            const status = error?.status;
            const serverErrors = Array.isArray(error?.serverErrors) ? error.serverErrors : [];

            if (status === 400) {
                const fieldErrors = {};
                let matched = false;
                serverErrors.forEach((fieldName) => {
                    if (KNOWN_SERVER_FIELDS.includes(fieldName)) {
                        matched = true;
                        fieldErrors[fieldName] = { key: 'publicPage.validation.serverField' };
                    }
                });
                if (matched) {
                    applyErrors(fieldErrors);
                    setSubmissionState({ status: 'error', formError: '', retryAfterSeconds: null });
                    onStatusChange('error');
                    focusFirstInvalid(fieldErrors);
                    return;
                }
                setSubmissionState({ status: 'error', formError: 'error', retryAfterSeconds: null });
                onStatusChange('error');
                return;
            }

            if (status === 429) {
                const retryAfterSeconds = Number.isFinite(error?.retryAfter) ? error.retryAfter : null;
                setSubmissionState({ status: 'error', formError: 'rateLimit', retryAfterSeconds });
                onStatusChange('error');
                if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
                    setRateLimitActive(true);
                    if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
                    rateLimitTimerRef.current = setTimeout(() => {
                        setRateLimitActive(false);
                    }, retryAfterSeconds * 1000);
                }
                return;
            }

            const isClearRejection = typeof status === 'number' && status >= 400 && status < 500;
            if (isClearRejection) {
                setSubmissionState({ status: 'error', formError: 'error', retryAfterSeconds: null });
                onStatusChange('error');
                return;
            }

            setSubmissionState({ status: 'uncertain', formError: 'uncertain', retryAfterSeconds: null });
            onStatusChange('uncertain');
        } finally {
            lockRef.current = false;
        }
    };

    const isSubmitting = submissionState.status === 'submitting';
    const formErrorMessage =
        submissionState.formError === 'rateLimit'
            ? submissionState.retryAfterSeconds !== null
                ? t('publicPage.demo.retryAfter', { seconds: submissionState.retryAfterSeconds })
                : copy.demo?.rateLimit
            : submissionState.formError === 'uncertain'
                ? copy.demo?.uncertain
                : copy.demo?.error;

    const submitLabel = isSubmitting
        ? copy.demo?.sending
        : submissionState.status === 'uncertain'
            ? copy.demo?.sendAgain
            : copy.demo?.submit;

    const renderField = ({ field, label, type = 'text', required = false, multiline = false, maxLength, autoComplete, htmlInput }) => (
        <TextField
            id={FIELD_IDS[field]}
            name={field}
            label={label}
            type={type}
            required={required}
            fullWidth
            value={values[field]}
            onChange={handleFieldChange(field)}
            error={Boolean(errors[field])}
            helperText={errors[field] ? t(errors[field].key, errors[field].params) : ' '}
            multiline={multiline}
            minRows={multiline ? 3 : undefined}
            disabled={isSubmitting}
            slotProps={{
                htmlInput: {
                    maxLength,
                    autoComplete,
                    ...htmlInput,
                },
            }}
        />
    );

    return (
        <Box component="section" id="book-demo" className="landing-public-section">
            <Box className="landing-public-container">
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
                        gap: { xs: 3, md: 5 },
                        alignItems: 'start',
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            component="h2"
                            id="book-demo-heading"
                            tabIndex={-1}
                            sx={{
                                fontWeight: 800,
                                fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                                lineHeight: { xs: 1.3, lg: 1.2 },
                                mb: 1.5,
                                outline: 'none',
                            }}
                        >
                            {copy.demo?.title}
                        </Typography>
                        <Typography sx={{ fontSize: { xs: 16, md: 17 }, lineHeight: 1.65, color: 'text.secondary', mb: 2 }}>
                            {copy.demo?.body}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {copy.demo?.requiredNote}
                        </Typography>
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {copy.demo?.existingUser}
                            </Typography>
                            <Button variant="outlined" onClick={onOpenFinder} sx={{ minHeight: 44 }}>
                                {copy.actions?.findSchool}
                            </Button>
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: { xs: '18px', md: '18px' },
                            bgcolor: 'background.paper',
                            p: { xs: 2, sm: 2.5, md: 3.5 },
                            minWidth: 0,
                            '@media (max-width: 359px)': { p: 2 },
                        }}
                    >
                        {submissionState.status === 'success' ? (
                            <Box>
                                <Typography
                                    ref={successHeadingRef}
                                    tabIndex={-1}
                                    variant="h3"
                                    sx={{ fontWeight: 700, fontSize: '1.25rem', mb: 1.5, outline: 'none' }}
                                >
                                    {copy.demo?.successTitle}
                                </Typography>
                                <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: 'text.secondary' }}>
                                    {copy.demo?.successBody}
                                </Typography>
                            </Box>
                        ) : (
                            <Box component="form" noValidate onSubmit={handleSubmit}>
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                                        gap: 2,
                                    }}
                                >
                                    {renderField({
                                        field: 'name',
                                        label: copy.demo?.name,
                                        required: true,
                                        maxLength: 120,
                                        autoComplete: 'name',
                                    })}
                                    {renderField({
                                        field: 'schoolName',
                                        label: copy.demo?.schoolName,
                                        required: true,
                                        maxLength: 160,
                                        autoComplete: 'organization',
                                    })}
                                    {renderField({
                                        field: 'email',
                                        label: copy.demo?.email,
                                        type: 'email',
                                        required: true,
                                        maxLength: 254,
                                        autoComplete: 'email',
                                        htmlInput: { inputMode: 'email', dir: 'ltr' },
                                    })}
                                    {renderField({
                                        field: 'phone',
                                        label: copy.demo?.phone,
                                        type: 'tel',
                                        maxLength: 40,
                                        autoComplete: 'tel',
                                        htmlInput: { inputMode: 'tel', dir: 'ltr' },
                                    })}
                                    {renderField({
                                        field: 'role',
                                        label: copy.demo?.role,
                                        maxLength: 80,
                                        autoComplete: 'organization-title',
                                    })}

                                    {planChoices.length > 0 ? (
                                        <TextField
                                            id={FIELD_IDS.plan}
                                            name="plan"
                                            select
                                            fullWidth
                                            label={copy.demo?.plan}
                                            value={selectedPlanKey}
                                            onChange={(event) => onPlanChange(event.target.value)}
                                            disabled={isSubmitting}
                                            helperText={planNotice ? copy.demo?.planCleared : ' '}
                                        >
                                            <MenuItem value="">
                                                <em>{copy.demo?.noPlan}</em>
                                            </MenuItem>
                                            {planChoices.map((option) => (
                                                <MenuItem key={option.key} value={option.key}>
                                                    {option.name}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    ) : null}

                                    <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                                        <TextField
                                            id={FIELD_IDS.message}
                                            name="message"
                                            label={copy.demo?.message}
                                            multiline
                                            minRows={3}
                                            fullWidth
                                            value={values.message}
                                            onChange={handleFieldChange('message')}
                                            error={Boolean(errors.message)}
                                            helperText={
                                                errors.message
                                                    ? t(errors.message.key, errors.message.params)
                                                    : copy.demo?.messageHint
                                            }
                                            disabled={isSubmitting}
                                            slotProps={{ htmlInput: { maxLength: 2000 } }}
                                        />
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                            {t('publicPage.demo.counter', { used: composed.used, max: composed.max })}
                                        </Typography>
                                    </Box>

                                    {submissionState.formError ? (
                                        <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                                            <Alert severity="error" role="alert">
                                                {formErrorMessage}
                                            </Alert>
                                        </Box>
                                    ) : null}

                                    <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                                        <Button
                                            type="submit"
                                            variant="contained"
                                            fullWidth
                                            disabled={isSubmitting || rateLimitActive}
                                            sx={{ minHeight: 48, fontWeight: 600 }}
                                        >
                                            {submitLabel}
                                        </Button>
                                    </Box>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
