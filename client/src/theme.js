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
      main: '#5aaeee',
      light: '#78bdf1',
      dark: '#2f7fd2',
    },
    secondary: {
      main: '#8b5cf6',
      light: '#a78bfa',
      dark: '#6d28d9',
    },
    background: {
      default: '#161628',
      paper: '#272744',
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
  background: {
    default: '#f5f7fa',
    paper: '#ffffff',
  },
  text: {
    primary: '#1a202c',
    secondary: '#4a5568',
    disabled: '#718096',
  },
};

/** Create MUI theme with optional mode ('light' | 'dark') for use with Redux theme. */
export const getTheme = (mode = 'dark') => {
  const isLight = mode === 'light';
  return createTheme({
    ...baseThemeOptions,
    palette: {
      ...baseThemeOptions.palette,
      mode,
      ...(isLight ? lightPaletteOverrides : {}),
    },
  });
};

export const theme = getTheme('dark');