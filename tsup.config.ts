import { defineConfig } from 'tsup'

// Build of the published `@qrocodile/api` bundle.
//
// Dual ESM + CJS, because this is a server-side client and plenty of Node codebases still
// `require()`. `openapi-fetch` ships both formats itself, so it stays external — bundling it
// would duplicate a dependency that resolves cleanly on its own and would drag its license
// into our tarball for no gain.
//
// The declarations are rolled up rather than emitted per-file: `src/openapi.d.ts` is an
// internal artifact (see src/index.ts) and must be inlined into `dist/index.d.ts`, not left
// behind as an import of a file we do not ship. `scripts/check-dts.mjs` enforces that.

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm', 'cjs'],
  platform: 'node',
  // Matches the `engines.node` floor (>=20). The package needs little more than global
  // `fetch`, which is unflagged from 20 on.
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  // Not minified: the consumer is a bundler or Node, neither of which cares, and a readable
  // stack trace through an HTTP client is worth more than a few kilobytes.
  minify: false,
  treeshake: true,
})
