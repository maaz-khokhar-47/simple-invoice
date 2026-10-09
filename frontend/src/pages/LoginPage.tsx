import { useState } from 'react'
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from '../api/client'
import { ColorModeToggle } from '../components/ColorModeToggle'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Two fields, so react-hook-form's own rules are enough. Keeping zod (used by
// the invoice forms) out of this page keeps the only public page light.
interface LoginForm {
  email: string
  password: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  useDocumentTitle('Log in')
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)

  const redirectTo = (location.state as { from?: Location } | null)?.from?.pathname ?? '/invoices'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    defaultValues: { email: '', password: '' },
  })

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    try {
      await login(values.email, values.password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to log in'))
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Box sx={{ position: 'fixed', top: 12, right: 12 }}>
        <ColorModeToggle />
      </Box>
      <Paper sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3} component="form" noValidate onSubmit={handleSubmit(onSubmit)}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ReceiptLongIcon color="primary" fontSize="large" />
            <Typography variant="h5" component="h1">
              SimpleInvoice
            </Typography>
          </Stack>
          <Typography color="text.secondary">Log in to manage your invoices.</Typography>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            {...register('email', {
              setValueAs: (value: string) => value.trim(),
              required: 'Email is required',
              pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address' },
            })}
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register('password', { required: 'Password is required' })}
            error={!!errors.password}
            helperText={errors.password?.message}
          />

          <Button type="submit" variant="contained" size="large" loading={isSubmitting}>
            Log in
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
