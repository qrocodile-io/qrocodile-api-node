# Contributing to `@qrocodile/api`

Notes for working on the client itself. None of this reaches consumers — `files: ["dist"]`
keeps this file, `examples/` and `src/` out of the published tarball.

```bash
pnpm install
pnpm test
```

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

`src/openapi.d.ts` is generated from the QR Render API's OpenAPI document, fetched from the
live API at `https://api.qrocodile.io/docs/json`. Point `QR_API_SPEC_URL` somewhere else to
generate against another deployment.

```bash
pnpm codegen        # rewrite src/openapi.d.ts
pnpm codegen:check  # fail if it drifted from the API (runs in CI)
```

`codegen:check` compares the committed types against the API **as deployed**, so it can
begin failing without anything here changing — which is why CI runs it nightly as well as on
push. When it fails, the API has shipped something these types do not describe: regenerate
and commit.

Note what this does _not_ catch. While the client lived in the monorepo alongside
`apps/qr-api`, the check ran against that app's source and failed in the API's own merge
request, before the change shipped. Generating from a deployment moves that signal after
release. A versioned spec artifact would restore it.

## Build

```bash
pnpm build
```

tsup emits `dist/` (ESM + CJS + rolled-up `.d.ts`), then `scripts/check-dts.mjs` fails the
build if the declarations reference anything outside the package or re-export the generated
types.

## Dependencies

### `@types/node` tracks `engines.node`, not the newest release

`engines.node` is `>=20`, so the typings are pinned to the Node 20 line. Developing against
`@types/node@24` — which is what a plain `^` range drifts to — type-checks APIs a supported
consumer's runtime does not have, and the mismatch then surfaces at _their_ runtime instead
of in this build. `pnpm outdated` reports this several majors behind; that is the correct
state here, not a bump waiting to be applied.

The pin is `~20.19.0` and not `~20.0.0`, which is what "match the floor" would suggest.
`@types/node@20.0.0` predates the global `fetch`, `Response` and `Request` declarations and
does not type-check this package at all — the typings lagged what Node 20.0.0 itself
shipped. `~20.19.0` is the tightest bound that actually works. It covers everything added
_across_ the 20 line, so an API introduced in, say, 20.12 still type-checks even though the
declared floor is 20.0.0. The types cannot close that gap; the `node-floor` CI job does (see
below).

Check the pin rather than trusting it, by reaching for an API with a known arrival:

```bash
printf "import { glob } from 'node:fs/promises'\nvoid glob\n" > /tmp/probe.ts
pnpm exec tsc --noEmit --types node --module node16 --moduleResolution node16 /tmp/probe.ts
```

`fs/promises`' `glob` arrived in Node 22, so that must fail. Under the previous `^24` range
it type-checked cleanly, which was the bug — as did `node:sqlite`, added in Node 22.5.

Raise this only when `engines.node` is raised, which is breaking for consumers and belongs in
its own release.

### The floor itself is tested at runtime

Development and the `validate` CI job run on `.node-version`, because the toolchain cannot
run on Node 20.0.0: pnpm 11 needs Node >= 22.13, and vite (under vitest) >= 20.19. None of
that ships, though. Consumers run only the packed tarball, so the `node-floor` CI job packs it,
installs it with plain npm into an empty project on exactly the version `engines.node` admits
(read from package.json, so it follows the floor), and runs `scripts/floor-smoke.mjs` there
against both the ESM and the CJS entry point. That is what guarantees the floor; the
`@types/node` pin only catches a newer API at compile time, before it gets that far.

If the floor is ever raised, the `@types/node` pin must move with it. For `>=22` that means
`~22.20.0`, not `~22.0.0`: early 22.x typings have a `Buffer`/`ArrayBufferLike` variance bug
that breaks `examples/`.

### Everything else

Ordinary ranges, bumped as usual. `pnpm peers check` after any major upgrade — a caret range
that exceeds a peer's declared support is a breakage scheduled for whenever the lockfile is
next refreshed.

## Tests

```bash
pnpm test
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
QR_API_KEY=qk_live_… pnpm test
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

```bash
pnpm version minor   # bumps package.json, commits, tags, and pushes (postversion)
```

The tag is what publishes. `.github/workflows/publish.yml` fires on `v*`, checks that the tag
and `package.json` agree, runs the full gate, and publishes.

There is no npm token anywhere. npm is configured to trust this repository, this workflow
filename and the `npm` environment, so the runner authenticates with a short-lived OIDC
credential instead. **Do not rename `publish.yml` or change the job's `environment:`** —
npm's trusted publisher entry names both literally, and the entry cannot be edited, only
deleted and recreated.

The `npm` environment carries two further guards: a publish waits for approval from a
required reviewer, and only `v*` tags may deploy to it, so nothing running on a branch can
reach the publishing credential even if it asked for that environment by name.

Provenance — proof of which commit and which workflow run produced the tarball, shown on the
npm page — comes automatically with that, which is why no `--provenance` flag appears. It
cannot be produced from a laptop, and cannot be added to a version afterwards.

**Add the entry to `CHANGELOG.md` before bumping.** The workflow reads the section under
`## <version>` and uses it as the GitHub release notes, and it checks for that section
_before_ publishing — a version with nothing written about it fails the release while
re-tagging is still possible, rather than landing on npm with an empty release page. The
error tells you how to move the tag.

The release is created automatically once the publish succeeds, so the changelog is the only
place release notes are written.

A pre-release (`pnpm version prerelease --preid=beta`) publishes under its own dist-tag, so
`npm install @qrocodile/api` never resolves to it.

Publishing the same version twice is a no-op rather than a failure, so a retried job is safe.

`prepublishOnly` runs the same checks locally, so a manual `npm publish` cannot ship stale
types or a stale bundle either — it just gets no provenance.

The package is published to public npm as `@qrocodile/api`. `publishConfig` rewrites the
manifest at pack time so the published entry points target `dist/` while local development
keeps resolving `src/`.
