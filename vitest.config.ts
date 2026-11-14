import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The consumption suite packs a real tarball, which runs the build first and takes far
    // longer than the 5s default.
    testTimeout: 120_000,
  },
})
