import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'

describe('Dark mode toggle', () => {
  it('switches mode and remembers the choice', async () => {
    renderApp({ route: '/login', loggedIn: false })

    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
    expect(localStorage.getItem('simple-invoice.color-mode')).toBe('dark')
  })

  it('starts in the saved mode', async () => {
    localStorage.setItem('simple-invoice.color-mode', 'dark')
    renderApp({ route: '/login', loggedIn: false })

    expect(await screen.findByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })
})
