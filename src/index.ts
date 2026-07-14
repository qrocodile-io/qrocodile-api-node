import createClient from 'openapi-fetch'

import type { paths } from './openapi.d.ts'

export type { paths }
export type { components, operations } from './openapi.d.ts'

/**
 * Create a typed client for the QRocodile QR Code API.
 *
 * @param baseUrl - Base URL of the API (e.g. `https://api.qrocodile.io`).
 * @param apiKey  - Your API key (`qk_live_…`), sent as `Authorization: Bearer`.
 *                  Get one via `POST /v1/keys` (email → confirm → key).
 *
 * Render responses are image bytes, so pass `parseAs` to control the return type:
 * `'text'` for SVG, `'blob'`/`'arrayBuffer'` for PNG.
 *
 * @example
 * const qr = createQrApiClient('https://api.qrocodile.io', apiKey)
 *
 * // SVG (string)
 * const { data: svg } = await qr.GET('/v1/qr', {
 *   params: { query: { content: 'https://qrocodile.io', preset: 'ocean' } },
 *   parseAs: 'text',
 * })
 *
 * // PNG (Blob) with a full design
 * const { data: png } = await qr.POST('/v1/qr', {
 *   body: {
 *     content: { type: 'wifi', ssid: 'Cafe', password: 'latte123', encryption: 'WPA' },
 *     design: { preset: 'classic' },
 *     format: 'png',
 *   },
 *   parseAs: 'blob',
 * })
 */
export function createQrApiClient(baseUrl: string, apiKey?: string) {
  const client = createClient<paths>({ baseUrl })

  if (apiKey) {
    client.use({
      onRequest({ request }) {
        request.headers.set('Authorization', `Bearer ${apiKey}`)
        return request
      },
    })
  }

  return client
}
