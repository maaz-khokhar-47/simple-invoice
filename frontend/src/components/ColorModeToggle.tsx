import { IconButton, Tooltip } from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import { useColorMode } from '../theme/useColorMode'

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode()
  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <Tooltip title={label}>
      <IconButton onClick={toggle} aria-label={label} color="inherit">
        {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  )
}
