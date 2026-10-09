import { alpha, createTheme, type PaletteMode } from '@mui/material/styles'

const palettes = {
  light: {
    primary: '#3b5bdb',
    background: '#f5f6fa',
    paper: '#ffffff',
    text: '#1a1d29',
    textSecondary: '#5f6577',
    divider: '#e4e7ee',
    success: '#15803d',
    warning: '#b45309',
    error: '#dc2626',
  },
  dark: {
    primary: '#8b9ff8',
    background: '#0e1117',
    paper: '#161a23',
    text: '#e7e9f0',
    textSecondary: '#9aa1b2',
    divider: '#262b37',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
  },
} as const

export function createAppTheme(mode: PaletteMode) {
  const c = palettes[mode]

  return createTheme({
    palette: {
      mode,
      primary: { main: c.primary },
      success: { main: c.success },
      warning: { main: c.warning },
      error: { main: c.error },
      background: { default: c.background, paper: c.paper },
      text: { primary: c.text, secondary: c.textSecondary },
      divider: c.divider,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter Variable", "Inter", system-ui, "Segoe UI", Roboto, sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: 'antialiased' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          // flat surfaces with a hairline border; no grey overlay in dark mode
          root: { backgroundImage: 'none', border: `1px solid ${c.divider}` },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(c.paper, 0.85),
            backdropFilter: 'blur(8px)',
            border: 'none',
            borderBottom: `1px solid ${c.divider}`,
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.divider, fontVariantNumeric: 'tabular-nums' },
          head: {
            color: c.textSecondary,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            backgroundColor: alpha(c.background, 0.6),
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 120ms ease',
            '&:last-child td': { borderBottom: 0 },
          },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 48 } },
      },
      MuiDialog: {
        styleOverrides: { paper: { border: 'none' } },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
      },
    },
  })
}
