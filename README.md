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
const qr = createQrApiClient('https://api.qrocodile.io')
await qr.POST('/v1/keys', { body: { email: 'you@example.com' } })
// → open the confirmation link from your inbox to reveal the key.
```

## Render

```ts
import { createQrApiClient } from '@pagebase/qr-api-client'

const qr = createQrApiClient('https://api.qrocodile.io', process.env.QR_API_KEY)

// SVG (string) — pass parseAs: 'text'
const { data: svg } = await qr.GET('/v1/qr', {
  params: { query: { content: 'https://qrocodile.io', preset: 'ocean' } },
  parseAs: 'text',
})

// PNG (Blob) with a full design — pass parseAs: 'blob'
const { data: png, error } = await qr.POST('/v1/qr', {
  body: {
    content: { type: 'wifi', ssid: 'Cafe', password: 'latte123', encryption: 'WPA' },
    design: { preset: 'classic', moduleColor: { type: 'linear', stops: ['#0d9488', '#111'] } },
    format: 'png',
  },
  parseAs: 'blob',
})
```

Render responses are raw image bytes, so **always pass `parseAs`** (`'text'` for SVG,
`'blob'` / `'arrayBuffer'` for PNG). Errors come back as `{ error }` with the
`{ error: { code, message } }` envelope.

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
