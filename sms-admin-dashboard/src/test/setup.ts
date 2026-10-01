import '@testing-library/jest-dom'

// Polyfill for MSW in Node/jsdom environment
import { afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// Reset handlers after each test to avoid cross-test contamination
afterEach(() => {
  server.resetHandlers()
  cleanup()
})

// Close the server after all tests
afterAll(() => server.close())
