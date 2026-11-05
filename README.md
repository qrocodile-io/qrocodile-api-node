# @qrocodile/api

Typed TypeScript client for the [QRocodile QR Code API](https://qrocodile.io/en/qr-code-api/) —
generate styled QR codes (SVG or PNG) from content plus a design config.

Every body field and design id — presets, module and finder styles, palettes, logos,
halos — is fully typed and autocompleted, and stays in step with the API.

Ships ESM and CommonJS, with bundled type declarations. Node 20 or newer.

## Install

```bash
npm i @qrocodile/api
```

## Use it server-side only

Your API key is a secret. The API does not permit browser calls to the render endpoints —
CORS deliberately withholds the `Authorization` header — so a key in front-end code would
not work anyway, but the important part is that it must never be shipped to a browser at
all. Keep this client in your server, and proxy from your front end if you need to.

`confirmKey` returns the key in plaintext, which is a second reason to keep the signup flow
off the client.

## Get an API key

Every render needs a key. Register an email address, confirm the 6-digit code that arrives,
and the key is shown exactly once.

```ts
import { createQrApiClient } from '@qrocodile/api'

const qr = createQrApiClient()
await qr.registerKey('you@example.com')
// → a 6-digit code arrives by email; exchange it for the key, which is shown exactly once:
const { apiKey, replaced } = await qr.confirmKey('123456', { email: 'you@example.com' })
```

Registering an address that already has a key is how you replace a lost one: confirming
rotates it, `replaced` comes back `true`, and the old key stops working immediately.

You can also get a key from the [API page](https://qrocodile.io/en/qr-code-api/) without
writing any code.

## Render

```ts
import { createQrApiClient } from '@qrocodile/api'

// Base URL defaults to https://api.qrocodile.io — just pass your key.
const qr = createQrApiClient({ apiKey: process.env.QR_API_KEY })

// SVG (string) from simple content + a preset
const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })

// PNG (ArrayBuffer) with a full design. Payload formats are strings you build yourself —
// the API encodes `content` exactly as given.
const png = await qr.renderPng({
  content: 'WIFI:T:WPA;S:Cafe;P:latte123;;',
  design: { preset: 'classic', moduleColor: { type: 'linear', stops: ['#0d9488', '#111'] } },
})
```

There are two render methods, one per output: `renderSvg` returns a `string`, `renderPng`
returns an `ArrayBuffer` — so there's no path or `parseAs` to get right. Both take the same
input: `content` (the string to encode) plus optional `design` (the full QrDesignConfig),
`size`, and `fixContrast`. They call `POST /v1/qr`, which supports every option (the
`GET /v1/qr` variant has no method yet).

The quickest way to build a `design` is the [QR Designer](https://qrocodile.io/en/) — style a
code by hand, then use its "Copy JSON" button and paste the result straight in.

## Errors

Each helper resolves to the data directly and rejects on failure, so handle errors with
`try/catch`. There are three outcomes, and they are distinguishable:

| what happened                                      | what you get                               |
| -------------------------------------------------- | ------------------------------------------ |
| the API answered with one of its documented errors | `QrApiError` — carries `status` and `code` |
| any other error response (gateway, empty body)     | `QrApiResponseError` — carries `status`    |
| the request never completed (offline, DNS)         | the underlying `fetch` error, untouched    |

```ts
import { createQrApiClient, QrApiError, QrApiResponseError } from '@qrocodile/api'

try {
  const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })
} catch (err) {
  if (err instanceof QrApiError) {
    // The API described this failure itself — branch on `code`.
    console.error(err.status, err.code, err.message)
  } else if (err instanceof QrApiResponseError) {
    // Something answered, but not the API: a gateway error page, an empty body from a load
    // balancer. There is no `code` to branch on, only `status`.
    console.error(err.status, err.message)
  } else {
    throw err // never reached the API
  }
}
```

`QrApiError` **extends** `QrApiResponseError`, so check it first — the order above matters,
and reversing it would swallow every documented API error into the second branch. The
upside of the hierarchy is that code which only cares about the status can catch the base
and cover both:

```ts
if (err instanceof QrApiResponseError && err.status >= 500) return retry()
```

`code` is a union of the API's documented failure codes, derived from the spec — so a
`switch` over it is exhaustive, and a code the API adds or drops surfaces as a compile
error rather than a branch that quietly stops matching. Branch on `code`, not `message`:
the message is written for a human and may be reworded.

A code the API adds _before_ this package catches up still arrives as a normal `QrApiError`
rather than being rejected — the client checks that `code` is present, not that it is one it
already knows about, so an upstream addition never breaks your application.

## Other environments

```ts
createQrApiClient({ apiKey, baseUrl: 'http://localhost:3002' })
```

## Full API documentation

Endpoint reference, design-config fields, error tables and rate limits:
[qrocodile.io/en/qr-code-api/](https://qrocodile.io/en/qr-code-api/) and the OpenAPI UI at
[api.qrocodile.io/docs](https://api.qrocodile.io/docs).

## License

MIT

## Contributing

Bug reports and questions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) if you are
working on the client itself.
