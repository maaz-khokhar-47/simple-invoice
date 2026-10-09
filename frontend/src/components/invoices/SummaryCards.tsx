import { useId, type ReactNode } from 'react'
import { Box, Card, CardActionArea, Grid, Skeleton, Tooltip, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import EditNoteIcon from '@mui/icons-material/EditNote'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import TodayIcon from '@mui/icons-material/TodayOutlined'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import type { InvoiceStats, InvoiceStatus, StatusStats } from '../../types/invoice'
import { formatMoney } from '../../utils/format'

// Readable by screen readers, invisible on screen. Sizes are strings on
// purpose: in sx a number from 0 to 1 is a percentage (width: 1 is 100%).
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

interface CardProps {
  label: string
  icon: ReactNode
  color: string
  stats?: StatusStats
  /** Short explanation shown on hover of an info icon next to the label */
  hint?: string
  active?: boolean
  onClick?: () => void
}

function StatCard({ label, icon, color, stats, hint, active, onClick }: CardProps) {
  const { palette } = useTheme()
  const hintId = useId()
  const [main, ...others] = stats?.amounts ?? []

  const content = (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            borderRadius: 2,
            color,
            bgcolor: alpha(color, palette.mode === 'dark' ? 0.18 : 0.1),
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {/* visual cue only; screen readers get the hint as the card's description (below) */}
        {hint && (
          <Tooltip title={hint}>
            <InfoIcon aria-hidden sx={{ fontSize: 16, color: 'text.disabled', ml: -0.5 }} />
          </Tooltip>
        )}
      </Box>

      {stats ? (
        <>
          <Typography
            variant="h5"
            component="p"
            sx={{
              fontVariantNumeric: 'tabular-nums',
              // half-width cards on phones need a smaller figure to fit
              fontSize: { xs: '1.05rem', sm: '1.3rem', md: '1.5rem' },
              overflowWrap: 'anywhere',
            }}
          >
            {main ? formatMoney(main.amount, main.currency) : '—'}
          </Typography>
          <Tooltip
            // full breakdown when there are too many currencies to show inline
            title={others.length > 1 ? stats.amounts.map((a) => formatMoney(a.amount, a.currency)).join(' · ') : ''}
          >
            <Typography variant="caption" color="text.secondary" component="p" sx={{ minHeight: 20 }}>
              {stats.count} invoice{stats.count === 1 ? '' : 's'}
              {others.length === 1 && ` · +${formatMoney(others[0].amount, others[0].currency)}`}
              {others.length > 1 && ` · +${others.length} other currencies`}
            </Typography>
          </Tooltip>
        </>
      ) : (
        <>
          <Skeleton width="60%" height={32} />
          <Skeleton width="40%" />
        </>
      )}
    </Box>
  )

  return (
    <Card
      sx={{
        height: '100%',
        borderColor: active ? color : undefined,
        boxShadow: active ? `0 0 0 1px ${color}` : 'none',
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        '&:hover': onClick ? { transform: 'translateY(-2px)' } : undefined,
      }}
    >
      {hint && (
        <Box component="span" id={hintId} sx={VISUALLY_HIDDEN}>
          {hint}
        </Box>
      )}
      {onClick ? (
        <CardActionArea
          onClick={onClick}
          sx={{ height: '100%' }}
          aria-pressed={active}
          aria-describedby={hint ? hintId : undefined}
        >
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  )
}

interface Props {
  stats?: InvoiceStats
  activeStatus?: InvoiceStatus
  dueToday?: boolean
  outstanding?: boolean
  onSelect: (status: InvoiceStatus | undefined) => void
  onDueToday: () => void
  onOutstanding: () => void
}

// Five across on wide screens, 3 + 2 on tablets, pairs on phones
const CARD_SIZE = { xs: 6, sm: 4, lg: 'grow' } as const

export function SummaryCards({ stats, activeStatus, dueToday, outstanding, onSelect, onDueToday, onOutstanding }: Props) {
  const { palette } = useTheme()
  // Clicking the active card again goes back to "All"
  const toggle = (status: InvoiceStatus) => () => onSelect(activeStatus === status ? undefined : status)

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ ...CARD_SIZE, xs: 12 }}>
        <StatCard
          label="Total outstanding receivable"
          icon={<AccountBalanceWalletIcon fontSize="small" />}
          color={palette.primary.main}
          stats={stats?.outstanding}
          hint="Money customers still owe on invoices you've sent (Pending and Overdue). Drafts aren't included because they haven't been sent yet."
          active={outstanding}
          onClick={onOutstanding}
        />
      </Grid>
      <Grid size={CARD_SIZE}>
        <StatCard
          label="Due today"
          icon={<TodayIcon fontSize="small" />}
          color={palette.warning.main}
          stats={stats?.dueToday}
          active={dueToday}
          onClick={onDueToday}
        />
      </Grid>
      <Grid size={CARD_SIZE}>
        <StatCard
          label="Overdue"
          icon={<ErrorOutlineIcon fontSize="small" />}
          color={palette.error.main}
          stats={stats?.Overdue}
          active={activeStatus === 'Overdue'}
          onClick={toggle('Overdue')}
        />
      </Grid>
      <Grid size={CARD_SIZE}>
        <StatCard
          label="Drafts"
          icon={<EditNoteIcon fontSize="small" />}
          color={palette.text.secondary}
          stats={stats?.Draft}
          active={activeStatus === 'Draft'}
          onClick={toggle('Draft')}
        />
      </Grid>
      <Grid size={CARD_SIZE}>
        <StatCard
          label="Paid"
          icon={<TaskAltIcon fontSize="small" />}
          color={palette.success.main}
          stats={stats?.Paid}
          active={activeStatus === 'Paid'}
          onClick={toggle('Paid')}
        />
      </Grid>
    </Grid>
  )
}
