// Vitest setup — runs before every test file.
// Adds @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
// and resets localStorage between tests so state doesn't leak across cases.
import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()           // unmount React trees rendered during the test
  localStorage.clear() // jsdom provides a localStorage; clear it each test
})
