import createClient from 'openapi-fetch'

import type { operations, paths } from './openapi.d.ts'

export type { paths }
export type { components, operations } from './openapi.d.ts'

/** Default base URL of the hosted QRocodile QR Code API. */
const DEFAULT_BASE_URL = 'https://api.qrocodile.io'

export interface QrApiClientOptions {
  /**
   * Your API key (`qk_live_…`), sent as `Authorization: Bearer`.
   * Omit it only for the key-registration flow (`registerKey` / `confirmKey`).
   * Get one via `registerKey(email)` → confirm the emailed link → `confirmKey(token)`.
   */
  apiKey?: string | undefined
  /** Override the API base URL. Defaults to `https://api.qrocodile.io`. */
  baseUrl?: string | undefined
}

/** Query for the simple render endpoint (`GET /v1/qr`); `format` is set per method. */
export type RenderQuery = Omit<NonNullable<operations['getQr']['parameters']['query']>, 'format'>

/** Body for the full-design render endpoint (`POST /v1/qr`); `format` is set per method. */
export type RenderDesignBody = Omit<
  operations['createQr']['requestBody']['content']['application/json'],
  'format'
>

/**
 * Thrown by the client helpers when the API returns an error response (non-2xx).
 * Genuine network failures (offline, DNS, aborted) reject with the underlying `fetch`
 * error instead — they never reached the API, so there is no status or code.
 */
export class QrApiError extends Error {
  /** HTTP status of the error response. */
  readonly status: number
  /** Machine-readable error code from the API's `{ error: { code, message } }` body. */
  readonly code: string

  constructor(message: string, status: number, code: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'QrApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Turn an openapi-fetch `{ data, error, response }` result into the bare data, throwing
 * a {@link QrApiError} on an API error response.
 */
async function unwrap<T>(
  promise: Promise<{
    data?: T
    error?: { error: { code: string; message: string } }
    response: Response
  }>,
): Promise<T> {
  const result = await promise
  if (result.error) {
    throw new QrApiError(
      result.error.error.message,
      result.response.status,
      result.error.error.code,
    )
  }
  return result.data as T
}

/**
 * Create a typed client for the QRocodile QR Code API.
 *
 * Render helpers spare you the raw path, HTTP verb, and `parseAs` juggling: pick the
 * output format by method name and the return type follows (SVG → `string`, PNG →
 * `ArrayBuffer`). Each helper resolves to the data directly and throws {@link QrApiError}
 * on an API error response, so you handle failures with `try/catch` (which also plays well
 * with TanStack Query / SWR). Reach for `.raw` when you want the untouched openapi-fetch
 * `{ data, error, response }` envelope, or an endpoint/option the helpers don't cover.
 *
 * @example
 * const qr = createQrApiClient({ apiKey: process.env.QR_API_KEY })
 *
 * // Simple content + preset → SVG string
 * const svg = await qr.renderSvg({ content: 'https://qrocodile.io', preset: 'ocean' })
 *
 * // Full design → PNG bytes
 * const png = await qr.renderDesignPng({
 *   content: { type: 'wifi', ssid: 'Cafe', password: 'latte123', encryption: 'WPA' },
 *   design: { preset: 'classic', moduleColor: { type: 'linear', stops: ['#0d9488', '#111'] } },
 * })
 */
export function createQrApiClient(options: QrApiClientOptions = {}) {
  const { apiKey, baseUrl = DEFAULT_BASE_URL } = options
  const client = createClient<paths>({ baseUrl })

  if (apiKey) {
    client.use({
      onRequest({ request }) {
        request.headers.set('Authorization', `Bearer ${apiKey}`)
        return request
      },
    })
  }

  return {
    /** The underlying typed openapi-fetch client — an escape hatch for anything below. */
    raw: client,

    /** Render an SVG string from simple content + an optional preset (`GET /v1/qr`). */
    renderSvg(query: RenderQuery) {
      return unwrap(
        client.GET('/v1/qr', { params: { query: { ...query, format: 'svg' } }, parseAs: 'text' }),
      )
    },

    /** Render PNG bytes from simple content + an optional preset (`GET /v1/qr`). */
    renderPng(query: RenderQuery) {
      return unwrap(
        client.GET('/v1/qr', {
          params: { query: { ...query, format: 'png' } },
          parseAs: 'arrayBuffer',
        }),
      )
    },

    /** Render an SVG string from structured content + a full design config (`POST /v1/qr`). */
    renderDesignSvg(body: RenderDesignBody) {
      return unwrap(client.POST('/v1/qr', { body: { ...body, format: 'svg' }, parseAs: 'text' }))
    },

    /** Render PNG bytes from structured content + a full design config (`POST /v1/qr`). */
    renderDesignPng(body: RenderDesignBody) {
      return unwrap(
        client.POST('/v1/qr', { body: { ...body, format: 'png' }, parseAs: 'arrayBuffer' }),
      )
    },

    /**
     * Register an email for an API key (`POST /v1/keys`). A confirmation link is emailed;
     * open it (or pass its token to `confirmKey`) to reveal the key exactly once.
     */
    registerKey(email: string) {
      return unwrap(client.POST('/v1/keys', { body: { email } }))
    },

    /** Confirm a registration and retrieve the API key once (`GET /v1/keys/confirm`). */
    confirmKey(token: string) {
      return unwrap(
        client.GET('/v1/keys/confirm', {
          params: { query: { token } },
          parseAs: 'json',
          headers: { Accept: 'application/json' },
        }),
      )
    },
  }
}

/** The object returned by {@link createQrApiClient}. */
export type QrApiClient = ReturnType<typeof createQrApiClient>
