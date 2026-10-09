import { Suspense, useEffect } from 'react'
import { AppBar, Box, Button, Container, LinearProgress, Toolbar, Typography } from '@mui/material'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import LogoutIcon from '@mui/icons-material/Logout'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ColorModeToggle } from './ColorModeToggle'

export function AppLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()

  // Start each page at the top (e.g. after saving a long form). Filter changes
  // only touch the query string, so the list keeps its scroll position.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <ReceiptLongIcon color="primary" />
          <Typography
            component={RouterLink}
            to="/invoices"
            variant="h6"
            sx={{ color: 'text.primary', textDecoration: 'none', flexGrow: 1 }}
          >
            SimpleInvoice
          </Typography>
          {user && (
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user.fullname}
            </Typography>
          )}
          <ColorModeToggle />
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {/* Full width: the invoice table has six columns and benefits from the space */}
      <Container maxWidth={false} sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3, xl: 4 } }}>
        {/* the header stays put while a page's code loads */}
        <Suspense fallback={<LinearProgress aria-label="Loading page" sx={{ borderRadius: 1 }} />}>
          <Outlet />
        </Suspense>
      </Container>
    </Box>
  )
}
