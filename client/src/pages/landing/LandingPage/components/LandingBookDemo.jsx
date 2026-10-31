import { useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { HiOutlineCheckCircle, HiOutlineSparkles } from 'react-icons/hi';
import { submitDemoRequest } from '../../../../services/landingContentService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_FORM = {
    name: '',
    schoolName: '',
    email: '',
    phone: '',
    role: '',
    message: '',
};

export default function LandingBookDemo({ uiText, language }) {
    const copy = uiText?.demoForm || {};
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const highlights = [copy.highlight1, copy.highlight2, copy.highlight3].filter(Boolean);

    const setField = (field) => (event) => {
        const value = event.target.value;
        setForm((current) => ({ ...current, [field]: value }));
        setErrors((current) => ({ ...current, [field]: '' }));
    };

    const validate = () => {
        const next = {};
        if (!form.name.trim()) next.name = copy.required || 'This field is required.';
        if (!form.schoolName.trim()) next.schoolName = copy.required || 'This field is required.';
        if (!form.email.trim()) {
            next.email = copy.required || 'This field is required.';
        } else if (!EMAIL_PATTERN.test(form.email.trim())) {
            next.email = copy.emailInvalid || 'Enter a valid email address.';
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const onSubmit = async (event) => {
        event.preventDefault();
        if (busy || !validate()) return;
        setBusy(true);
        try {
            await submitDemoRequest({
                name: form.name,
                schoolName: form.schoolName,
                email: form.email,
                phone: form.phone,
                role: form.role,
                message: form.message,
                locale: language,
            });
            setSent(true);
            setForm(EMPTY_FORM);
        } catch {
            setErrors({ form: copy.error || 'The request could not be sent. Please try again.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box id="book-demo" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80, position: 'relative' }}>
            <Container maxWidth="lg">
                <Grid container spacing={{ xs: 5, md: 6 }} alignItems="center">
                    <Grid size={{ xs: 12, md: 5 }}>
                        <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                            {copy.overline || 'Book a demo'}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                            {copy.title || 'See the platform on your own school'}
                        </Typography>
                        <Typography color="text.secondary" sx={{ mb: 3, fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 460 }}>
                            {copy.subtitle || 'Tell us a little about your school and we will walk you through the portals, the AI tools and the gradebook live.'}
                        </Typography>
                        <Box sx={{ display: 'grid', gap: 1.25 }}>
                            {highlights.map((item) => (
                                <Box key={item} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', typography: 'body2' }}>
                                    <HiOutlineCheckCircle size={18} style={{ color: 'var(--primary, #0d9488)', flexShrink: 0 }} />
                                    {item}
                                </Box>
                            ))}
                        </Box>
                    </Grid>

                    <Grid size={{ xs: 12, md: 7 }}>
                        <Paper elevation={0} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, border: 1, borderColor: 'divider', boxShadow: '0 24px 60px -40px rgba(15, 23, 42, 0.45)' }}>
                            {sent ? (
                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                    <Box sx={{ display: 'inline-flex', p: 2, borderRadius: '50%', bgcolor: 'rgba(13, 148, 136, 0.1)', color: 'var(--primary, #0d9488)', mb: 2 }}>
                                        <HiOutlineSparkles size={28} />
                                    </Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                                        {copy.successTitle || 'Thanks — we will be in touch'}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ maxWidth: 380, mx: 'auto', lineHeight: 1.7 }}>
                                        {copy.successBody || 'Your request is with the team. We will email you to set up a time that works.'}
                                    </Typography>
                                </Box>
                            ) : (
                                <Box component="form" noValidate onSubmit={onSubmit}>
                                    <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <TextField
                                                fullWidth
                                                required
                                                label={copy.name || 'Your name'}
                                                placeholder={copy.namePlaceholder || 'e.g. Layla Hassan'}
                                                value={form.name}
                                                onChange={setField('name')}
                                                error={Boolean(errors.name)}
                                                helperText={errors.name || ' '}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <TextField
                                                fullWidth
                                                required
                                                label={copy.school || 'School name'}
                                                placeholder={copy.schoolPlaceholder || 'e.g. Bright Future School'}
                                                value={form.schoolName}
                                                onChange={setField('schoolName')}
                                                error={Boolean(errors.schoolName)}
                                                helperText={errors.schoolName || ' '}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <TextField
                                                fullWidth
                                                required
                                                type="email"
                                                label={copy.email || 'Work email'}
                                                placeholder={copy.emailPlaceholder || 'you@school.edu'}
                                                value={form.email}
                                                onChange={setField('email')}
                                                error={Boolean(errors.email)}
                                                helperText={errors.email || ' '}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <TextField
                                                fullWidth
                                                type="tel"
                                                label={copy.phone || 'Phone (optional)'}
                                                placeholder={copy.phonePlaceholder || '+971 50 000 0000'}
                                                value={form.phone}
                                                onChange={setField('phone')}
                                                helperText=" "
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                fullWidth
                                                label={copy.role || 'Your role (optional)'}
                                                placeholder={copy.rolePlaceholder || 'Principal, head of academics…'}
                                                value={form.role}
                                                onChange={setField('role')}
                                                helperText=" "
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12 }}>
                                            <TextField
                                                fullWidth
                                                multiline
                                                minRows={3}
                                                label={copy.message || 'What would you like to see? (optional)'}
                                                placeholder={copy.messagePlaceholder || 'Gradebook, report cards, AI tutor…'}
                                                value={form.message}
                                                onChange={setField('message')}
                                            />
                                        </Grid>
                                        {errors.form && (
                                            <Grid size={{ xs: 12 }}>
                                                <Alert severity="error" role="alert">{errors.form}</Alert>
                                            </Grid>
                                        )}
                                        <Grid size={{ xs: 12 }}>
                                            <Button
                                                type="submit"
                                                fullWidth
                                                size="large"
                                                variant="contained"
                                                disabled={busy}
                                                sx={{ py: 1.5, fontWeight: 700, borderRadius: 2 }}
                                            >
                                                {busy ? (copy.submitting || 'Sending…') : (copy.submit || 'Request my demo')}
                                            </Button>
                                        </Grid>
                                    </Grid>
                                </Box>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}
