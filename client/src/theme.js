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
    primary: {
      main: '#14b8a6',
      light: '#2dd4bf',
      dark: '#0d9488',
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
    warning: { main: '#f59e0b' },
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
  primary: {
    main: '#0d9488',
    light: '#14b8a6',
    dark: '#0f766e',
  },
  background: {
    default: '#f8fafc',
    paper: '#ffffff',
  },
  text: {
    primary: '#0f172a',
    secondary: '#334155',
    disabled: '#94a3b8',
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
