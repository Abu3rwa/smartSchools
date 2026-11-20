import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Link as RouterLink } from 'react-router-dom';
import { HiOutlineX } from 'react-icons/hi';

/**
 * Bounded school finder. The page hook owns the request state; this dialog
 * only renders it and returns focus to whatever opened the dialog.
 */
export default function LandingFindSchool({ copy, open, query, state, onQueryChange, onRetry, onClose }) {
    const { t } = useTranslation(['landing.page']);
    const isSmall = useMediaQuery('(max-width:599px)');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        // The dialog must own focus as soon as it opens, so the search input is
        // focused instead of the dialog shell.
        const frame = window.requestAnimationFrame(() => {
            if (inputRef.current) inputRef.current.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [open]);

    const status = state.status;
    const showMinimumHint = status === 'idle' && query.trim().length > 0 && query.trim().length < 2;
    const showMinimumIdleHint = status === 'idle' && query.trim().length === 0;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen={isSmall}
            maxWidth="xs"
            ModalProps={{ disableRestoreFocus: true, disableAutoFocus: true }}
            PaperProps={{
                className: 'landing-public-overlay',
                sx: { maxWidth: 560, height: { xs: '100%', sm: 'auto' } },
            }}
            aria-labelledby="finder-title"
        >
            <DialogTitle
                id="finder-title"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    position: { xs: 'sticky', sm: 'static' },
                    top: 0,
                    bgcolor: 'background.paper',
                    zIndex: 1,
                }}
            >
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
                    {copy.finder?.title}
                </Typography>
                <IconButton onClick={onClose} aria-label={copy.actions?.close} sx={{ width: 44, height: 44 }}>
                    <HiOutlineX size={22} />
                </IconButton>
            </DialogTitle>

            <DialogContent
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    overflowY: 'auto',
                    flex: 1,
                    pb: 3,
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    {copy.finder?.description}
                </Typography>

                <TextField
                    id="school-search"
                    label={copy.finder?.label}
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.preventDefault();
                    }}
                    inputRef={inputRef}
                    fullWidth
                    autoComplete="off"
                    slotProps={{ htmlInput: { maxLength: 80 } }}
                    helperText={
                        state.status === 'invalid'
                            ? copy.finder?.tooLong
                            : showMinimumHint || showMinimumIdleHint
                                ? copy.finder?.minimum
                                : ' '
                    }
                    error={state.status === 'invalid'}
                />

                {status === 'debouncing' || status === 'loading' ? (
                    <Typography role="status" aria-live="polite" color="text.secondary">
                        {copy.finder?.loading}
                    </Typography>
                ) : null}

                {status === 'error' ? (
                    <Box
                        sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderStyle: 'dashed',
                            borderRadius: '16px',
                            p: 2.5,
                            textAlign: 'center',
                        }}
                    >
                        <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>{copy.finder?.error}</Typography>
                        <Button variant="outlined" onClick={onRetry} sx={{ minHeight: 44 }}>
                            {copy.actions?.retry}
                        </Button>
                    </Box>
                ) : null}

                {status === 'empty' ? (
                    <Typography sx={{ color: 'text.secondary' }}>{copy.finder?.empty}</Typography>
                ) : null}

                {status === 'success' ? (
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {t('publicPage.finder.resultsStatus', { count: state.schools.length })}
                        </Typography>

                        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                            {state.schools.map((school) => (
                                <Box component="li" key={school.slug}>
                                    <Link
                                        component={RouterLink}
                                        to={`/login/${encodeURIComponent(school.slug)}`}
                                        underline="none"
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            gap: 0.25,
                                            minHeight: 64,
                                            p: 1.5,
                                            border: 1,
                                            borderColor: 'divider',
                                            borderRadius: '12px',
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                                        }}
                                    >
                                        <Typography sx={{ fontWeight: 600 }}>{school.name}</Typography>
                                        <Typography component="span" variant="caption" color="text.secondary">
                                            <bdi>{school.slug}</bdi>
                                        </Typography>
                                    </Link>
                                </Box>
                            ))}
                        </Box>

                        {state.hasMore ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                                {copy.finder?.more}
                            </Typography>
                        ) : null}
                    </Box>
                ) : null}

                <Box sx={{ mt: 'auto', pt: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {copy.finder?.genericHelp}
                    </Typography>
                    <Link component={RouterLink} to="/login" underline="hover" sx={{ fontWeight: 600 }}>
                        {copy.actions?.signIn}
                    </Link>
                </Box>
            </DialogContent>
        </Dialog>
    );
}
