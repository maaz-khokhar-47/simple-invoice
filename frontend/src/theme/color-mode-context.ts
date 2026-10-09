import { createContext } from 'react'
import type { PaletteMode } from '@mui/material/styles'

export interface ColorModeState {
  mode: PaletteMode
  toggle: () => void
}

export const ColorModeContext = createContext<ColorModeState>({ mode: 'light', toggle: () => {} })
