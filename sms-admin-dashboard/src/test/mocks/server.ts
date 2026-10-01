import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// Node-side MSW server used in Vitest
export const server = setupServer(...handlers)
