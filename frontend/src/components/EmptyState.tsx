import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'

interface Props {
  icon: ReactNode
  title: string
  message: string
  action?: ReactNode
}

export function EmptyState({ icon, title, message, action }: Props) {
  return (
    <Box sx={{ py: { xs: 6, md: 8 }, px: 2, textAlign: 'center' }}>
      <Box
        sx={(theme) => ({
          display: 'inline-grid',
          placeItems: 'center',
          width: 56,
          height: 56,
          mb: 2,
          borderRadius: '50%',
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
        })}
      >
        {icon}
      </Box>
      <Typography variant="h6" component="p" gutterBottom>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 360, mx: 'auto', mb: action ? 2.5 : 0 }}>
        {message}
      </Typography>
      {action}
    </Box>
  )
}
