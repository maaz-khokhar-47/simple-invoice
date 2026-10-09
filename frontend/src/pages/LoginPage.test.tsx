import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API, server } from '../test/server'
import { renderApp } from '../test/render'

describe('Login', () => {
  it('redirects to the login page when not logged in', async () => {
    renderApp({ route: '/invoices', loggedIn: false })

    expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('shows validation errors without calling the API', async () => {
    let called = false
    server.use(
      http.post(`${API}/auth/login`, () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    renderApp({ route: '/login', loggedIn: false })

    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('logs in and lands on the invoice list', async () => {
    renderApp({ route: '/login', loggedIn: false })

    await userEvent.type(screen.getByLabelText(/email/i), 'reviewer@simpleinvoice.dev')
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices')
  })

  it('shows the server message for bad credentials', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Invalid email or password', error: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    )
    renderApp({ route: '/login', loggedIn: false })

    await userEvent.type(screen.getByLabelText(/email/i), 'reviewer@simpleinvoice.dev')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('logs out when the API says the token is no longer valid', async () => {
    server.use(
      http.get(`${API}/invoices`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 }),
      ),
    )
    renderApp({ route: '/invoices' })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })
})
