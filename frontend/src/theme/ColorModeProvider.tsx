import { useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import type { PaletteMode } from '@mui/material/styles'
import { ColorModeContext } from './color-mode-context'
import { createAppTheme } from './theme'

const STORAGE_KEY = 'simple-invoice.color-mode'

function readStoredMode(): PaletteMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/**
 * Follows the OS light/dark setting until the user picks one with the toggle,
 * then remembers that choice.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [chosen, setChosen] = useState<PaletteMode | null>(readStoredMode)
  const mode: PaletteMode = chosen ?? (prefersDark ? 'dark' : 'light')

  const value = useMemo(
    () => ({
      mode,
      toggle: () => {
        const next = mode === 'dark' ? 'light' : 'dark'
        setChosen(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // private browsing etc. - the toggle still works for this session
        }
      },
    }),
    [mode],
  )

  const theme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        {/* enableColorScheme makes native widgets (date pickers, scrollbars) match */}
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}
