# @qrocodile/api

Typed TypeScript client for the [QRocodile QR Code API](https://qrocodile.io/en/qr-code-api/).
It generates styled QR codes (SVG or PNG) from content plus a design config.

Every body field and design id (presets, module and finder styles, palettes, logos,
halos) is fully typed and autocompleted, with types generated from the API’s OpenAPI spec.

It ships ESM and CommonJS with bundled type declarations, and needs Node 20 or newer.

## Install

```bash
npm i @qrocodile/api
```

## Keep your API key secret

Your API key must never reach a browser. Browsers cannot call the render endpoints anyway,
because CORS withholds the `Authorization` header. If a web page needs QR codes, render them
in code you control and hand the result to the page.

## Get an API key

Every render needs a key. Register an email address, confirm the 6-digit code that arrives,
and the key is shown exactly once.

```ts
import { createQrApiClient } from '@qrocodile/api'

const qr = createQrApiClient()
await qr.registerKey('you@example.com')
// → a 6-digit code arrives by email; exchange it for the key:
const { apiKey, replaced } = await qr.confirmKey('123456', { email: 'you@example.com' })
```

To replace a lost or leaked key, register the same email address again. Confirming issues a
new key, `replaced` comes back `true`, and the old key stops working immediately.

You can also get a key from the [API page](https://qrocodile.io/en/qr-code-api/) without
writing any code.

## Render

```ts
import { createQrApiClient } from '@qrocodile/api'

// Only the key is needed; the base URL defaults to https://api.qrocodile.io.
const qr = createQrApiClient({ apiKey: process.env.QR_API_KEY })

// SVG (string) from simple content + a preset
const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })

// PNG (ArrayBuffer) with a full design. Payload formats are strings you build yourself:
// the API encodes `content` exactly as given.
const png = await qr.renderPng({
  content: 'WIFI:T:WPA;S:Cafe;P:latte123;;',
  design: { preset: 'classic', moduleColor: { type: 'linear', stops: ['#0d9488', '#111'] } },
})
```

There are two render methods, one per output: `renderSvg` returns a `string`, and `renderPng`
returns an `ArrayBuffer`. Both take the same input: `content` (the string to encode) plus
optional `design` (the full QrDesignConfig), `size`, and `fixContrast`. They call
`POST /v1/qr`, which supports every option (the `GET /v1/qr` variant has no method yet).

To build a `design`, style a QR code by hand in the [QR Designer](https://qrocodile.io/en/),
then use its “Copy JSON” button and paste the result in.

## Errors

When the API responds with an error, every method throws a `QrApiError` with `status` and
`code`. Handle failures with `try/catch`:

```ts
import { createQrApiClient, QrApiError } from '@qrocodile/api'

try {
  const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })
} catch (err) {
  if (err instanceof QrApiError) console.error(err.status, err.code, err.message)
}
```

Branch on `code`, not `message`: the message is written for people and may be reworded.
`code` is typed with every error code the API documents (`'RATE_LIMITED'`, `'UNAUTHORIZED'`,
…), so your editor completes them and TypeScript rejects a misspelled one. When an update of
this package removes a code, a `case` for it stops compiling; to be told about added codes as
well, end the `switch` with a `default` that assigns `code` to `never`.

Network failures (offline, DNS, aborted) reject with the underlying `fetch` error instead.
They never reached the API, so there is no status or code.

## Full API documentation

Endpoint reference, design-config fields, error tables, and rate limits:
[qrocodile.io/en/qr-code-api/](https://qrocodile.io/en/qr-code-api/) and the OpenAPI UI at
[api.qrocodile.io/docs](https://api.qrocodile.io/docs).

## License

MIT

## Contributing

Bug reports and questions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) if you are
working on the client itself.
