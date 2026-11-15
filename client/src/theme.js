import { createTheme } from '@mui/material/styles';

const baseThemeOptions = {
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  palette: {
    mode: 'dark',
    // One brand for both modes: the amber lantern accent.
    // Old teal primary, kept for reference:
    // primary: { main: '#14b8a6', light: '#2dd4bf', dark: '#0d9488' },
    primary: {
      main: '#b45309',
      light: '#f59e0b',
      dark: '#92400e',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#1e293b',
      light: '#334155',
      dark: '#0f172a',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
    text: {
      primary: '#ffffff',
      secondary: '#a0aec0',
      disabled: '#718096',
    },
    success: { main: '#10b981' },
    error: { main: '#ef4444' },
    // Warnings are orange so they never read as the amber brand.
    warning: { main: '#c2410c', light: '#ea580c', dark: '#9a3412' },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
        contained: {
          background: 'var(--brand-gradient)',
          // Ink on the amber brand; white would fail contrast on it.
          color: 'var(--on-accent, #101828)',
          '&:hover': {
            background: 'var(--brand-gradient-hover)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundImage: 'none',
          border: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
  },
};

const lightPaletteOverrides = {
  // The brand primary is shared by both modes now, so there is no light-only
  // primary to override. Old block, kept for reference:
  // primary: { main: '#b45309', light: '#f59e0b', dark: '#92400e' },
  background: {
    default: '#f7f8fa',
    paper: '#ffffff',
  },
  text: {
    primary: '#101828',
    secondary: '#344054',
    disabled: '#667085',
  },
};

/** Create MUI theme with optional mode ('light' | 'dark') for use with Redux theme. */
export const getTheme = (mode = 'dark', direction = 'ltr') => {
    const isLight = mode === 'light';
    const isRtl = direction === 'rtl';
    return createTheme({
        ...baseThemeOptions,
        direction,
        palette: {
            ...baseThemeOptions.palette,
            mode,
            ...(isLight ? lightPaletteOverrides : {}),
        },
        typography: {
            ...baseThemeOptions.typography,
            fontFamily: isRtl
                ? '"Noto Sans Arabic", "Cairo", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
                : baseThemeOptions.typography.fontFamily
        }
    });
};

export const theme = getTheme('light');
