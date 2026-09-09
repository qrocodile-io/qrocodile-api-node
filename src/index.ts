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
   * Get one via `registerKey(email)` → read the 6-digit code out of the email →
   * `confirmKey(code, { email })`.
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

// Derived from the spec rather than written out here: the API declares `error.code` as a
// closed enum, which arrives in the generated types as a union.
/**
 * Every error code the API documents.
 *
 * A `case` for a code that does not exist fails to compile. To be told about codes added in a
 * later version of this package as well, end the `switch` with a `default` that assigns the
 * code to `never`.
 */
export type QrApiErrorCode =
  operations['renderQrCodeWithDesign']['responses'][400]['content']['application/json']['error']['code']

/** What {@link createQrApiClient}'s `registerKey` resolves to. */
export type RegisterKeyResult =
  operations['registerKey']['responses'][202]['content']['application/json']

/** What {@link createQrApiClient}'s `confirmKey` resolves to: the key, and whether it replaced one. */
export type ConfirmKeyResult =
  operations['confirmKey']['responses'][200]['content']['application/json']

/**
 * Thrown when the API responds with an error status (non-2xx) whose body is not the
 * documented `{ error: { code, message } }` envelope: a gateway or CDN error page, an empty
 * body from a load balancer, or a JSON body of some other shape. The request reached
 * something other than the API's own error handling, so it has a `status` but no `code`.
 *
 * Catch this when the status is all you need, for example to retry:
 *
 * ```ts
 * catch (err) {
 *   if (err instanceof QrApiResponseError && err.status >= 500) return retry()
 * }
 * ```
 *
 * {@link QrApiError} is a subclass, so `instanceof QrApiResponseError` is true for a
 * documented API error too. Test for `QrApiError` first if you branch on both.
 */
export class QrApiResponseError extends Error {
  /** HTTP status of the error response. */
  readonly status: number

  constructor(message: string, status: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'QrApiResponseError'
    this.status = status
  }
}

/**
 * Thrown when the API responds with one of its own documented errors: an error status
 * carrying the `{ error: { code, message } }` envelope.
 *
 * Every method can fail in three ways, and you can tell them apart:
 *
 * | What happened                                   | What you get                              |
 * | ----------------------------------------------- | ----------------------------------------- |
 * | The API answered with a documented error        | `QrApiError`, with `status` and `code`    |
 * | Some other error response (gateway, empty body) | {@link QrApiResponseError}, with `status` |
 * | The request never completed (offline, DNS)      | The underlying `fetch` error, as is       |
 */
export class QrApiError extends QrApiResponseError {
  /**
   * Machine-readable error code from the API's `{ error: { code, message } }` body. It is stable,
   * so branch on it: `message` is written for people and may be reworded.
   */
  readonly code: QrApiErrorCode

  constructor(
    message: string,
    status: number,
    code: QrApiErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, status, options)
    this.name = 'QrApiError'
    this.code = code
  }
}

/** The API's documented error body, as far as this client needs to know it. */
interface QrApiErrorEnvelope {
  error: { code: QrApiErrorCode; message: string }
}

/**
 * Whether an error body is the API's documented envelope.
 *
 * openapi-fetch parses the error body as JSON only when the response says
 * `application/json`, and hands back the raw string otherwise — so what arrives here can be
 * a string, `null`, an array, an object with no `error` key, or an envelope with a piece
 * missing. The first four all fail the same way, on `typeof error !== 'object'`; only the
 * last group needs conditions of its own.
 *
 * `code` is checked for *being a non-empty string*, deliberately not for membership of
 * {@link QrApiErrorCode}. That union describes the spec as it stands today; a code the API
 * adds tomorrow is still a perfectly good API error, and rejecting it would break every
 * consumer over a change that harmed nobody. The union is pinned by a test instead, which is
 * the maintainer's signal to widen it — and costs consumers nothing in the meantime.
 */
function isErrorEnvelope(body: unknown): body is QrApiErrorEnvelope {
  // Optional chaining rather than a `typeof body === 'object'` gate, and no `Array.isArray`:
  // a string body, an array, `null` and a missing body all leave `error` undefined and fall
  // out on the next line, and an array `error` has no `code` so it falls out below. Written
  // that way on purpose — an earlier version spelled all three out, and a mutation sweep
  // showed those operands could be deleted with the suite still green, which is the same
  // thing as them not being guards at all. Every condition that survives here has a test
  // that fails on its own when it is removed.
  const error = (body as { error?: unknown } | null | undefined)?.error
  if (typeof error !== 'object' || error === null) return false

  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && code !== '' && typeof message === 'string' && message !== ''
}

/** `503 Service Unavailable`, or bare `503` when the response carries no status text. */
function describeStatus(response: Response): string {
  return response.statusText === ''
    ? String(response.status)
    : `${response.status} ${response.statusText}`
}

/** How much of an unreadable body to quote back. A gateway error page can be kilobytes. */
const BODY_SNIPPET_LENGTH = 200

/**
 * A short, quoted rendering of whatever actually arrived.
 *
 * Naming it is the difference between "the response was not an API error" and "the response
 * was a 503 HTML page", and it costs one interpolation. Whitespace is collapsed because the
 * markup is almost always pretty-printed and the useful part is the first line.
 */
function describeBody(body: unknown): string {
  const rendered = typeof body === 'string' ? body : JSON.stringify(body)
  const collapsed = rendered === undefined ? '' : rendered.replace(/\s+/g, ' ').trim()

  if (collapsed === '') return 'an empty body'
  return collapsed.length > BODY_SNIPPET_LENGTH
    ? `${JSON.stringify(collapsed.slice(0, BODY_SNIPPET_LENGTH))} (truncated)`
    : JSON.stringify(collapsed)
}

/**
 * Turn an openapi-fetch `{ data, error, response }` result into the bare data, throwing
 * {@link QrApiError} on a documented API error and {@link QrApiResponseError} on any other
 * error response.
 *
 * The branch is on `response.ok`, **not** on the truthiness of `error`. openapi-fetch reports
 * an empty body as `''` and a literal `null` body as `null`, both falsy — so branching on
 * `error` lets a failed request fall through and resolve with `undefined`, against a declared
 * `Promise<string>` or `Promise<ArrayBuffer>`. That is the failure a consumer would chase
 * furthest from its cause, because it type-checks at every call site.
 *
 * `data` is deliberately `unknown` rather than inferred, so `T` comes from each caller's
 * declared return type instead of from the spec. That matters for the render endpoints: the
 * API declares their 200 body as `format: binary`, which openapi-typescript emits as
 * `string` for both SVG and PNG, and openapi-fetch does not re-type the result from
 * `parseAs`. Inferring would therefore have promised a `string` of PNG bytes — the one
 * signature in this package a consumer is most likely to act on and get wrong.
 */
async function unwrap<T>(
  promise: Promise<{ data?: unknown; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise

  if (!response.ok) {
    if (isErrorEnvelope(error)) {
      throw new QrApiError(error.error.message, response.status, error.error.code)
    }
    throw new QrApiResponseError(
      `The QRocodile API answered with status ${describeStatus(response)}, and a body this ` +
        `client cannot read as an API error: ${describeBody(error)}`,
      response.status,
    )
  }

  return data as T
}

/**
 * Create a typed client for the QRocodile QR Code API.
 *
 * The method picks the output format, and the return type follows: `renderSvg` returns a
 * `string`, `renderPng` an `ArrayBuffer`. Every method rejects on failure, so handle errors
 * with `try/catch` (which also suits TanStack Query and SWR): a documented API error throws
 * {@link QrApiError}, any other error response throws {@link QrApiResponseError}, and a
 * request that never completed rejects with the underlying `fetch` error. The render methods
 * call `POST /v1/qr`, which supports every option; the `GET /v1/qr` variant has no method yet.
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
     * a bare `{ content: 'https://…' }` yields a plain QR code, and the full QrDesignConfig
     * (presets, styles, colors, logo…) goes under `design`.
     */
    renderSvg(input: RenderInput): Promise<string> {
      return unwrap(client.POST('/v1/qr', { body: { ...input, format: 'svg' }, parseAs: 'text' }))
    },

    /** Render PNG bytes (`POST /v1/qr`). Same input as {@link renderSvg}. */
    renderPng(input: RenderInput): Promise<ArrayBuffer> {
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
    registerKey(email: string, lang?: 'en' | 'de'): Promise<RegisterKeyResult> {
      return unwrap(client.POST('/v1/keys', { body: { email, ...(lang ? { lang } : {}) } }))
    },

    /**
     * Exchange the emailed code for the key (`POST /v1/keys/confirm`). Identify the pending
     * signup by the address it was sent to, or by the `rid` the verification link carries.
     *
     * To replace a lost or leaked key, register the same address again and confirm here. That
     * issues a new key and revokes the old one, which keeps working until you confirm.
     */
    confirmKey(
      code: string,
      identifier: { email: string } | { rid: string },
    ): Promise<ConfirmKeyResult> {
      return unwrap(client.POST('/v1/keys/confirm', { body: { code, ...identifier } }))
    },
  }
}

/** The object returned by {@link createQrApiClient}. */
export type QrApiClient = ReturnType<typeof createQrApiClient>
