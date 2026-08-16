import createClient from 'openapi-fetch'

// The generated OpenAPI types are an internal implementation detail — used here to
// derive our own types, but deliberately NOT re-exported, so consumers depend only on
// the hand-written surface (createQrApiClient, RenderInput, QrApiError, …).
import type { operations, paths } from './openapi.d.ts'

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

/**
 * Input for a render call (`POST /v1/qr`), minus `format` (chosen by the method).
 * `content` is the string to encode, verbatim; `design` is the full QrDesignConfig
 * (preset, module/finder styles, colors, gradients, logo…). Everything the simple
 * `GET /v1/qr` endpoint can do is expressible here, plus more.
 */
export type RenderInput = Omit<
  operations['renderQrCodeWithDesign']['requestBody']['content']['application/json'],
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
 * with TanStack Query / SWR). The render helpers use `POST /v1/qr`, which supports every
 * option; the `GET /v1/qr` variant has no method yet (add one if it's needed).
 *
 * @example
 * const qr = createQrApiClient({ apiKey: process.env.QR_API_KEY })
 *
 * // Simple: content + a preset → SVG string
 * const svg = await qr.renderSvg({ content: 'https://qrocodile.io', design: { preset: 'ocean' } })
 *
 * // Full design → PNG bytes. Payload formats like WIFI: are strings you build yourself.
 * const png = await qr.renderPng({
 *   content: 'WIFI:T:WPA;S:Cafe;P:latte123;;',
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
    /**
     * Render an SVG string (`POST /v1/qr`). Pass content plus an optional design:
     * a bare `{ content: 'https://…' }` yields a plain code, and the full QrDesignConfig
     * (presets, styles, colors, logo…) goes under `design`.
     */
    renderSvg(input: RenderInput) {
      return unwrap(client.POST('/v1/qr', { body: { ...input, format: 'svg' }, parseAs: 'text' }))
    },

    /** Render PNG bytes (`POST /v1/qr`). Same input as {@link renderSvg}. */
    renderPng(input: RenderInput) {
      return unwrap(
        client.POST('/v1/qr', { body: { ...input, format: 'png' }, parseAs: 'arrayBuffer' }),
      )
    },

    /**
     * Register an email for an API key (`POST /v1/keys`). A 6-digit code is emailed; pass it to
     * {@link confirmKey} to reveal the key, which is shown exactly once.
     *
     * The 202 is identical whether or not the address already has a key, so it cannot be used to
     * probe which addresses are registered.
     */
    registerKey(email: string, lang?: 'en' | 'de') {
      return unwrap(client.POST('/v1/keys', { body: { email, ...(lang ? { lang } : {}) } }))
    },

    /**
     * Exchange the emailed code for the key (`POST /v1/keys/confirm`). Identify the pending
     * signup by the address it was sent to, or by the `rid` the verification link carries.
     *
     * Registering an address that already has a key rotates it: confirming issues a fresh key
     * and revokes the old one, and the old key keeps working until then.
     */
    confirmKey(code: string, identifier: { email: string } | { rid: string }) {
      return unwrap(client.POST('/v1/keys/confirm', { body: { code, ...identifier } }))
    },
  }
}

/** The object returned by {@link createQrApiClient}. */
export type QrApiClient = ReturnType<typeof createQrApiClient>
