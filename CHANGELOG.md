# Changelog

Notable changes to `@qrocodile/api`. Versions follow [SemVer](https://semver.org/), with the
usual pre-1.0 caveat: while the major is `0`, a **minor** bump may carry breaking changes.

## Unreleased

## 0.1.0

First public release.

### Added

- `createQrApiClient({ apiKey, baseUrl })` — a typed client for the QRocodile QR Code API.
- `renderSvg(input)` returns an SVG `string`; `renderPng(input)` returns PNG bytes as an
  `ArrayBuffer`. Both take `content` plus optional `design`, `size` and `fixContrast`, and
  call `POST /v1/qr`, which supports every option the API offers.
- `registerKey(email, lang?)` and `confirmKey(code, { email } | { rid })` for programmatic
  API-key signup.
- `QrApiError`, carrying `status` and a `code` drawn from the API's documented union, so a
  `switch` over it is exhaustive and an added or removed code becomes a compile error rather
  than a branch that quietly stops matching. Network failures that never reached the API
  reject with the underlying `fetch` error instead, untouched.
- Dual ESM and CommonJS builds with bundled type declarations. Node 20 or newer.

### Notes

- **Server-side only.** The API key is a secret, and the API's CORS deliberately withholds
  the `Authorization` header, so browser calls to the render endpoints fail by design.
- The design surface (presets, module and finder styles, palettes, logos, halos) is fully
  typed from the API's OpenAPI document, so editor autocomplete matches what the deployed API
  actually accepts.
