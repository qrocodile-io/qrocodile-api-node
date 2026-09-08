# Contributing to `@qrocodile/api`

Notes for working on the client itself. None of this reaches consumers — `files: ["dist"]`
keeps this file, `examples/` and `src/` out of the published tarball.

The package is built on [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/), with the
request and response types generated from the QR Render API's OpenAPI document. The
hand-written surface in `src/index.ts` is deliberately sealed: it derives its types from the
generated ones but never re-exports them, so consumers depend only on
`createQrApiClient`, `RenderInput`, `QrApiError` and friends.

## Layout

| Path                       | What it is                                                      |
| -------------------------- | --------------------------------------------------------------- |
| `src/index.ts`             | The entire public surface. Hand-written.                        |
| `src/openapi.d.ts`         | Generated. Never edit by hand — see Codegen below.              |
| `src/*.test.ts`            | Unit and type tests, mocked `fetch`, no network.                |
| `test/integration.test.ts` | Hits the real API. Needs `QR_API_KEY`.                          |
| `test/consumption.test.ts` | Packs a tarball and imports it as an outside consumer would.    |
| `examples/`                | Runnable scripts. Plain `node`, since Node 24 strips the types. |
| `scripts/`                 | Codegen and the build's declaration guard.                      |

## Codegen

`src/openapi.d.ts` is generated from the QR Render API's OpenAPI document. The document is
dumped straight out of `apps/qr-api` in memory — no server, no database, no port — with
`SITE_URLS` and `BASE_URL` pinned to the production values, so the published types never
carry a developer's `localhost` links.

```bash
pnpm --filter @qrocodile/api codegen        # rewrite src/openapi.d.ts
pnpm --filter @qrocodile/api codegen:check  # fail if it drifted from the API (runs in CI)
```

Because the API and the client live in the same repository, the drift check runs whenever
either one changes. Regenerate and commit as part of the change that alters the API.

## Build

```bash
pnpm --filter @qrocodile/api build
```

tsup emits `dist/` (ESM + CJS + rolled-up `.d.ts`), then `scripts/check-dts.mjs` fails the
build if the declarations reference anything outside the package or re-export the generated
types.

## Tests

```bash
pnpm --filter @qrocodile/api test
```

Three layers, and they catch different things:

- **Unit** (`src/*.test.ts`) — mocked `fetch`. Error mapping, the Bearer header, and the
  SVG-as-text vs PNG-as-`ArrayBuffer` split.
- **Types** (`src/surface.test-d.ts`) — asserts the public surface has exactly the expected
  shape, so a breaking change to it has to be deliberate rather than incidental.
- **Consumption** (`test/consumption.test.ts`) — packs a real tarball and loads it through
  both `import` and `require()`. This is the one that catches dual-package and `exports`-map
  mistakes; nothing in-repo does, because in-repo consumers resolve `src/`.

The integration test (`test/integration.test.ts`) hits the live API and self-skips unless
`QR_API_KEY` is set, so a local `pnpm test` stays offline by default:

```bash
QR_API_KEY=qk_live_… pnpm --filter @qrocodile/api test
```

CI provides the key, so the pipeline does exercise the real API. Keep these tests to a
couple of renders — the account's budget is 60 renders per minute, shared with everything
else using that key.

## Examples

The examples run directly under Node — no build step, because Node 24 strips the types.

```bash
# Interactive signup — prints the key once you paste the emailed code
node examples/signup.ts you@example.com
# → prints your key to stdout;  … > key.txt  captures just the key
# → point at another environment with QR_API_URL=http://localhost:3002

# Write a QR image to a file (svg also supported)
QR_API_KEY=qk_live_… node examples/generate.ts "https://qrocodile.io" png

# Same, with a centered logo — a local image file or a built-in logo id
QR_API_KEY=qk_live_… node examples/logo.ts "https://qrocodile.io" website svg
```

## Releasing

See [`docs/qr-api-client-release.md`](../../docs/qr-api-client-release.md).
