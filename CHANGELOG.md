# Changelog

Notable changes to `@qrocodile/api`. Versions follow [SemVer](https://semver.org/), with the
usual pre-1.0 caveat: while the major is `0`, a **minor** bump may carry breaking changes.

## Unreleased

### Added

- The `retroConsole` preset and the `knit` module style, which the API now offers.
- `QrApiResponseError`, thrown when the API answers with an error status whose body is not
  the documented `{ error: { code, message } }` envelope: a gateway or CDN error page, an
  empty body from a load balancer, or a JSON body of another shape. It carries `status` but
  no `code`, because there is none to report, and an invented one would put a value in
  `code` that `QrApiErrorCode` says cannot occur.
- `QrApiError` now extends `QrApiResponseError`. Existing `instanceof QrApiError` and
  `instanceof Error` checks are unaffected, and code that only needs the status can catch
  the base class to cover both. When you branch on both, check `QrApiError` first, because
  the base class matches a documented API error too.

### Changed

- **Breaking:** the `christmas` preset is now called `christmasSweater`, as in the API. Code
  passing `preset: 'christmas'` no longer type-checks; rename it to `christmasSweater`.

- The type documentation now matches the deployed API. Colors (`moduleColor`, `background`)
  are `#rgb` or `#rrggbb`; the API no longer accepts `#rrggbbaa`. The link in the
  verification email carries its reference as `#r=…` rather than `?r=…`. Module and finder
  style parameters outside a style’s declared range are refused. `finderUseModuleStyle` and
  `finderColorInherit` default to `false`. The types themselves are unchanged.

### Fixed

- An error response that was not the documented envelope no longer produces a `TypeError`
  from inside the client. Every such response (an HTML error page, a plain-text body, a
  body that will not parse as JSON, an envelope with `code` or `message` missing) now
  rejects with a `QrApiResponseError` naming the status and quoting what arrived. Each of
  those previously failed on whichever property access it happened to reach first.
- A failed request with an empty or `null` body no longer **resolves**. openapi-fetch reports
  those as `''` and `null`, both falsy, so the client’s error branch was skipped and
  `renderSvg` resolved with `undefined` against a declared `Promise<string>` (and `renderPng`
  against `Promise<ArrayBuffer>`). The check is now on `response.ok`.

## 0.1.1-beta.0

No functional changes — `dist/` is byte-identical to 0.1.0.

Published to exercise the release pipeline end to end: trusted publishing over OIDC, the
provenance attestation, and automatic creation of the GitHub release from this changelog.
Cut as a pre-release so it takes the `beta` dist-tag and `npm install @qrocodile/api`
continues to resolve to 0.1.0.

## 0.1.0

First public release.

### Added

- `createQrApiClient({ apiKey, baseUrl })` — a typed client for the QRocodile QR Code API.
- `renderSvg(input)` returns an SVG `string`; `renderPng(input)` returns PNG bytes as an
  `ArrayBuffer`. Both take `content` plus optional `design`, `size` and `fixContrast`, and
  call `POST /v1/qr`, which supports every option the API offers.
- `registerKey(email, lang?)` and `confirmKey(code, { email } | { rid })` for programmatic
  API-key signup.
- `QrApiError`, carrying `status` and a `code` typed with the API’s documented error codes,
  so a `case` for a code that does not exist fails to compile. Network failures that never
  reached the API reject with the underlying `fetch` error instead, untouched.
- Dual ESM and CommonJS builds with bundled type declarations. Node 20 or newer.

### Notes

- **Server-side only.** The API key is a secret, and the API’s CORS deliberately withholds
  the `Authorization` header, so browser calls to the render endpoints fail by design.
- The design surface (presets, module and finder styles, palettes, logos, halos) is fully
  typed from the API’s OpenAPI document, so editor autocomplete matches what the deployed API
  actually accepts.
