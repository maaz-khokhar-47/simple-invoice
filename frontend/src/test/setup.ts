import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// The default 1s is too tight when several MUI-heavy test files render in parallel.
// Pages are lazy-loaded, so the first find* in a file also waits for the page,
// form and zod modules to be transformed - over 5s on a busy machine (e.g. while
// Docker builds). Tests still fail fast on real bugs: the test timeout is 30s.
configure({ asyncUtilTimeout: 10_000 })

// jsdom doesn't implement scrolling
window.scrollTo = () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
})
afterAll(() => server.close())
