import { Box, Tab, Tabs } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { InvoiceStats, InvoiceStatus } from '../../types/invoice'

const DUE_TODAY = 'dueToday'

// Lifecycle order; "Due today" sits just before Overdue (it becomes Overdue tomorrow)
const TABS: { value: InvoiceStatus | typeof DUE_TODAY; label: string }[] = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Pending', label: 'Pending' },
  { value: DUE_TODAY, label: 'Due today' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Paid', label: 'Paid' },
  { value: 'WrittenOff', label: 'Written off' },
]

interface Props {
  value?: InvoiceStatus
  dueToday?: boolean
  /** The "Total outstanding receivable" card is selected: it has no tab of its own */
  outstanding?: boolean
  stats?: InvoiceStats
  onChange: (status: InvoiceStatus | undefined) => void
  onDueToday: () => void
}

function Count({ value }: { value?: number }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        ml: 0.5,
        px: 0.75,
        minWidth: 22,
        borderRadius: 10,
        fontSize: '0.75rem',
        lineHeight: '20px',
        textAlign: 'center',
        bgcolor: alpha(theme.palette.text.primary, 0.08),
        // keep the tab width stable while counts load
        visibility: value === undefined ? 'hidden' : 'visible',
      })}
    >
      {value ?? 0}
    </Box>
  )
}

export function StatusTabs({ value, dueToday, outstanding, stats, onChange, onDueToday }: Props) {
  return (
    <Tabs
      value={outstanding ? false : dueToday ? DUE_TODAY : (value ?? 'all')}
      onChange={(_, next: string) => {
        if (next === DUE_TODAY) onDueToday()
        else onChange(next === 'all' ? undefined : (next as InvoiceStatus))
      }}
      variant="scrollable"
      allowScrollButtonsMobile
      aria-label="Filter by status"
      sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab
        value="all"
        label={
          <span>
            All <Count value={stats?.total} />
          </span>
        }
      />
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          label={
            <span>
              {tab.label} <Count value={tab.value === DUE_TODAY ? stats?.dueToday.count : stats?.[tab.value].count} />
            </span>
          }
        />
      ))}
    </Tabs>
  )
}
