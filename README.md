# @pagebase/qr-api-client

Typed TypeScript client for the [QRocodile QR Code API](https://api.qrocodile.io) —
generate styled QR codes (SVG or PNG) from content + a design config.

Built on [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) with types generated
from the API's OpenAPI spec, so every path, query param, body field, and design id
(presets, module/finder styles, logos) is fully typed and autocompleted.

## Install

```bash
npm i @pagebase/qr-api-client
```

## Get an API key

Every render needs a key. Register with an email, confirm via the link, and the key
is shown once.

**Interactive helper** — registers, then fetches the key once you paste the link:

```bash
pnpm --filter @pagebase/qr-api-client signup you@example.com
# → prints your key to stdout;  signup you@example.com > key.txt  captures just the key
# → point at another environment with QR_API_URL=http://localhost:3002
```

**Or in code:**

```ts
const qr = createQrApiClient()
await qr.registerKey('you@example.com')
// → open the confirmation link from your inbox to reveal the key,
//   or pass its token to qr.confirmKey(token) to fetch it programmatically.
```

## Render

```ts
import { createQrApiClient } from '@pagebase/qr-api-client'

// Base URL defaults to https://api.qrocodile.io — just pass your key.
const qr = createQrApiClient({ apiKey: process.env.QR_API_KEY })

// SVG (string) from simple content + a preset
const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })

// PNG (ArrayBuffer) from structured content + a full design
const png = await qr.renderPng({
  content: { type: 'wifi', ssid: 'Cafe', password: 'latte123', encryption: 'WPA' },
  design: { preset: 'classic', moduleColor: { type: 'linear', stops: ['#0d9488', '#111'] } },
})
```

There are two render methods, one per output: `renderSvg` returns a `string`, `renderPng`
returns an `ArrayBuffer` — so there's no path or `parseAs` to get right. Both take the same
input: `content` (a string or a structured object like `wifi`/`vcard`) plus an optional
`design` (the full QrDesignConfig). They call `POST /v1/qr`, which supports every option (the
cacheable `GET /v1/qr` variant has no method yet).

Each helper resolves to the data directly and throws `QrApiError` (with `status` and
`code`) on an API error response, so handle failures with `try/catch`:

```ts
import { createQrApiClient, QrApiError } from '@pagebase/qr-api-client'

try {
  const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })
} catch (err) {
  if (err instanceof QrApiError) console.error(err.status, err.code, err.message)
}
```

Genuine network failures (offline, DNS, aborted) reject with the underlying `fetch` error
instead.

Point at another environment with `createQrApiClient({ apiKey, baseUrl: 'http://localhost:3002' })`.

**Runnable example** — writes a QR image to a file:

```bash
QR_API_KEY=qk_live_… pnpm --filter @pagebase/qr-api-client generate "https://qrocodile.io" png
# → qr.png     (svg also supported; non-URL content is encoded as text)
```

## Development

The types in `src/openapi.d.ts` are generated from the running API:

```bash
# with the API running on :3002
pnpm --filter @pagebase/qr-api-client codegen
```
