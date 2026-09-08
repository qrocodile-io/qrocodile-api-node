import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The consumption suite packs a real tarball, which runs the build first — far past
    // the 5s default. It is the slowest thing here by an order of magnitude.
    testTimeout: 120_000,
  },
})
