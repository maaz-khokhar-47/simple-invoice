import { Box, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import dayjs from 'dayjs'
import type { InvoiceDetail } from '../../types/invoice'
import { buildActivity, type Tone } from './invoice-activity'

export function ActivityTimeline({ invoice }: { invoice: InvoiceDetail }) {
  const { palette } = useTheme()
  const events = buildActivity(invoice)
  const toneColor: Record<Tone, string> = {
    neutral: palette.text.secondary,
    primary: palette.primary.main,
    success: palette.success.main,
    error: palette.error.main,
  }

  return (
    <Box component="section" aria-label="Activity" sx={{ mt: 4 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Activity
      </Typography>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {events.map((event, i) => {
          const color = toneColor[event.tone]
          const isLast = i === events.length - 1
          return (
            <Box component="li" key={event.key} sx={{ display: 'flex', gap: 1.5 }}>
              {/* icon with a connecting line down to the next event */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    color,
                    bgcolor: alpha(color, palette.mode === 'dark' ? 0.18 : 0.1),
                  }}
                >
                  {event.icon}
                </Box>
                {!isLast && <Box sx={{ flex: 1, width: '2px', minHeight: 16, bgcolor: 'divider', my: 0.5 }} />}
              </Box>
              <Box sx={{ pb: isLast ? 0 : 2, pt: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {event.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {dayjs(event.date).format(event.hasTime ? 'D MMM YYYY, h:mm a' : 'D MMM YYYY')}
                  {event.detail && ` · ${event.detail}`}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
