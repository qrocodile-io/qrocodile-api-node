import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQrApiClient, QrApiError, QrApiResponseError } from './index.ts'

/**
 * Unit level: `fetch` is stubbed, so nothing here touches the network. These cover the two
 * things the client actually does on top of the generated types — turning an error envelope
 * into a thrown `QrApiError`, and picking the right response parse per format.
 *
 * The live API is exercised separately in test/integration.test.ts.
 */

const KEY = 'qk_live_unit_test'

/** Build a stub `fetch` that answers once with the given response, and records the request. */
function stubFetch(response: Response) {
  const spy = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authorization', () => {
  it('sends the key as a Bearer token', async () => {
    const spy = stubFetch(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))

    await createQrApiClient({ apiKey: KEY }).renderSvg({ content: 'x' })

    const request = spy.mock.calls[0]?.[0] as Request
    expect(request.headers.get('authorization')).toBe(`Bearer ${KEY}`)
  })

  /**
   * The signup endpoints are the only ones callable without a key, so an omitted key must
   * not produce a header at all — `Bearer undefined` would be a 401 that reads like a bug in
   * the caller's code rather than a missing option.
   */
  it('sends no authorization header when no key is given', async () => {
    const spy = stubFetch(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await createQrApiClient().registerKey('you@example.com')

    const request = spy.mock.calls[0]?.[0] as Request
    expect(request.headers.has('authorization')).toBe(false)
  })
})

describe('render responses', () => {
  /**
   * The spec types both render bodies as `string` (OpenAPI `format: binary`), so these two
   * assertions are the runtime half of the contract the declared return types promise. If
   * `parseAs` were ever dropped from renderPng, this is what would catch it.
   */
  it('returns SVG as a string', async () => {
    stubFetch(new Response('<svg id="a"/>', { headers: { 'content-type': 'image/svg+xml' } }))

    const svg = await createQrApiClient({ apiKey: KEY }).renderSvg({ content: 'x' })

    expect(typeof svg).toBe('string')
    expect(svg).toContain('<svg')
  })

  it('returns PNG as an ArrayBuffer, not a string', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    stubFetch(new Response(bytes, { headers: { 'content-type': 'image/png' } }))

    const png = await createQrApiClient({ apiKey: KEY }).renderPng({ content: 'x' })

    expect(png).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(png)).toEqual(bytes)
  })

  it('sends the format the method implies', async () => {
    const spy = stubFetch(new Response(new Uint8Array([1]), { status: 200 }))

    await createQrApiClient({ apiKey: KEY }).renderPng({ content: 'x' })

    const body = await (spy.mock.calls[0]?.[0] as Request).json()
    expect(body).toMatchObject({ content: 'x', format: 'png' })
  })
})

describe('error handling', () => {
  it('throws QrApiError carrying the status and code', async () => {
    stubFetch(errorResponse(429, 'RATE_LIMITED', 'Too many requests'))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(QrApiError)
    expect(err).toMatchObject({
      name: 'QrApiError',
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    })
  })

  it('throws on a validation error from a keyless endpoint too', async () => {
    stubFetch(errorResponse(400, 'VALIDATION_ERROR', 'Invalid email'))

    const err = await createQrApiClient()
      .registerKey('not-an-email')
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(QrApiError)
    expect((err as QrApiError).code).toBe('VALIDATION_ERROR')
  })

  /**
   * A request that never reached the API has no status and no error code, so wrapping it in
   * QrApiError would invent both. It propagates untouched — documented behavior, and the
   * reason `instanceof QrApiError` is a meaningful check rather than a formality.
   */
  it('lets genuine network failures through unwrapped', async () => {
    const cause = new TypeError('fetch failed')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(cause))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e)

    expect(err).toBe(cause)
    expect(err).not.toBeInstanceOf(QrApiError)
  })
})

describe('key signup', () => {
  it('returns the key and whether it replaced an existing one', async () => {
    stubFetch(
      new Response(JSON.stringify({ apiKey: 'qk_live_new', replaced: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await createQrApiClient().confirmKey('123456', { email: 'you@example.com' })

    expect(result).toEqual({ apiKey: 'qk_live_new', replaced: true })
  })

  it('identifies a pending signup by rid as well as by email', async () => {
    const spy = stubFetch(
      new Response(JSON.stringify({ apiKey: 'qk_live_new', replaced: false }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    await createQrApiClient().confirmKey('123456', { rid: 'abc' })

    expect(await (spy.mock.calls[0]?.[0] as Request).json()).toEqual({ code: '123456', rid: 'abc' })
  })

  it('omits lang when not given, rather than sending undefined', async () => {
    const spy = stubFetch(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await createQrApiClient().registerKey('you@example.com')

    expect(await (spy.mock.calls[0]?.[0] as Request).json()).toEqual({ email: 'you@example.com' })
  })
})

describe('base url', () => {
  it('defaults to the hosted API', async () => {
    const spy = stubFetch(new Response('<svg/>'))

    await createQrApiClient({ apiKey: KEY }).renderSvg({ content: 'x' })

    expect((spy.mock.calls[0]?.[0] as Request).url).toBe('https://api.qrocodile.io/v1/qr')
  })

  it('honors an override', async () => {
    const spy = stubFetch(new Response('<svg/>'))

    await createQrApiClient({ apiKey: KEY, baseUrl: 'http://localhost:3002' }).renderSvg({
      content: 'x',
    })

    expect((spy.mock.calls[0]?.[0] as Request).url).toBe('http://localhost:3002/v1/qr')
  })
})

/**
 * What the API answers with when it is not the API answering.
 *
 * `unwrap` branches on the truthiness of openapi-fetch's `error`, then reaches straight
 * through `error.error.message`. Neither step holds for a body that is not the documented
 * `{ error: { code, message } }` envelope — and a body like that is the *likely* production
 * failure, since a gateway, CDN or load balancer in front of the API serves its own error
 * page and never consults the OpenAPI document.
 *
 * Verified against openapi-fetch@0.17.0 before these were written, because the guard has to
 * be built on what it actually hands over rather than what the types suggest:
 *
 *   - `error` is parsed as JSON only when the response says `content-type: application/json`;
 *     for anything else — and for a JSON content-type whose body will not parse — it is the
 *     raw body **string**.
 *   - `parseAs` does not affect this. The error body is parsed the same way for `'text'`,
 *     `'arrayBuffer'` and the default, so one guard covers both render helpers and the two
 *     signup helpers rather than needing a variant per method.
 *   - an empty body arrives as `''` and a literal `null` body as `null` — both falsy, which
 *     is how a failed request can currently skip the error branch altogether.
 *
 * These assertions deliberately do not name the class that should be thrown; that is the one
 * open decision, isolated in the `it.todo` at the end. Everything here is a property every
 * candidate fix has to satisfy.
 */
describe('error responses that are not the API error envelope', () => {
  /**
   * `contentType` is omitted rather than defaulted, because "no content-type at all" is
   * exactly what a truncated or empty gateway response looks like and it parses differently.
   */
  function malformedResponse(body: string, status: number, contentType?: string) {
    return new Response(body, {
      status,
      ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
    })
  }

  /**
   * The properties a failed request has to have however the fix is shaped. Split out so each
   * row below fails on its own, which is what makes the guard's conditions individually
   * mutation-testable — one row per condition, not one row per guard.
   */
  function expectUsableFailure(err: unknown, status: number) {
    // The request *arrived*. A TypeError is what an unguarded property read produces, and is
    // also what a genuine network failure legitimately throws — so letting one escape here
    // would make `instanceof TypeError` useless for telling those two apart.
    expect(err).not.toBeInstanceOf(TypeError)
    expect(err).toBeInstanceOf(Error)

    // Naming the status is the difference between a diagnosis and a puzzle: it is the only
    // thing about these responses the client can state with confidence.
    expect((err as Error).message).toContain(String(status))
    expect((err as Error).message).not.toContain('Cannot read properties')

    // If it *is* a QrApiError, `code` has to be a real code. The declared type is a closed
    // union, so `undefined` there is a value consumers were promised was impossible: an
    // exhaustive `switch` matches no branch and silently does nothing.
    if (err instanceof QrApiError) {
      expect(typeof err.code).toBe('string')
      expect(err.code).not.toBe('')
      expect(err.message).not.toBe('')
    }
  }

  it.each([
    // `error` comes back as a string — the whole envelope is absent.
    [
      'an HTML error page from a gateway',
      '<html><body>503 unavailable</body></html>',
      503,
      'text/html',
    ],
    ['a plain-text body', 'internal error', 500, 'text/plain'],
    ['a body that claims to be JSON but will not parse', '{not json', 400, 'application/json'],
    ['an empty body with no content-type', '', 502, undefined],
    // `error` is an object, but there is no usable `error.error`.
    ['JSON with no error property', '{"message":"too many"}', 429, 'application/json'],
    ['a JSON array', '[]', 400, 'application/json'],
    ['a literal null JSON body', 'null', 400, 'application/json'],
    ['an error property that is null', '{"error":null}', 400, 'application/json'],
    // `error.error` exists but is the wrong shape — these are the ones that currently
    // produce a plausible-looking QrApiError with `code: undefined`.
    ['an error property that is a string', '{"error":"nope"}', 400, 'application/json'],
    ['an error property that is an array', '{"error":[]}', 400, 'application/json'],
    [
      'an envelope whose code is empty',
      '{"error":{"code":"","message":"bad"}}',
      400,
      'application/json',
    ],
    [
      'an envelope whose message is empty',
      '{"error":{"code":"VALIDATION_ERROR","message":""}}',
      400,
      'application/json',
    ],
    [
      'an envelope missing message',
      '{"error":{"code":"VALIDATION_ERROR"}}',
      400,
      'application/json',
    ],
    ['an envelope missing code', '{"error":{"message":"bad"}}', 400, 'application/json'],
  ] as const)('rejects usably on %s', async (_label, body, status, contentType) => {
    stubFetch(malformedResponse(body, status, contentType))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expectUsableFailure(err, status)
  })

  /**
   * The same body through the PNG helper. `parseAs` does not change how the error body is
   * parsed, so this is not a second code path — but it is a second *declared return type*,
   * and `Promise<ArrayBuffer>` quietly resolving with `undefined` is the failure a consumer
   * would chase furthest from its cause.
   */
  it('rejects rather than resolving undefined from renderPng', async () => {
    stubFetch(malformedResponse('', 502))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderPng({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expectUsableFailure(err, 502)
  })

  /** A keyless endpoint reaches the same guard; nothing about it is render-specific. */
  it('rejects usably from the signup endpoints too', async () => {
    stubFetch(malformedResponse('<html>504</html>', 504, 'text/html'))

    const err = await createQrApiClient()
      .registerKey('you@example.com')
      .catch((e: unknown) => e as unknown)

    expectUsableFailure(err, 504)
  })

  /**
   * The counterweight, and the reason the guard must check `typeof code === 'string'` rather
   * than membership of the union: a well-formed envelope has to keep working even when the
   * API has moved on. Tightening the guard until it only admits today's codes would break
   * every consumer the next time the API adds one — a change that harmed nobody.
   */
  it('still throws QrApiError for a well-formed envelope carrying an unknown code', async () => {
    stubFetch(
      malformedResponse(
        '{"error":{"code":"SOME_NEW_CODE","message":"brand new"}}',
        400,
        'application/json',
      ),
    )

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expect(err).toBeInstanceOf(QrApiError)
    expect(err).toMatchObject({ status: 400, code: 'SOME_NEW_CODE', message: 'brand new' })
  })

  it('still throws QrApiError for an envelope that gained extra fields', async () => {
    stubFetch(
      malformedResponse(
        '{"error":{"code":"RATE_LIMITED","message":"slow down","requestId":"req_1","retryAfter":30}}',
        429,
        'application/json',
      ),
    )

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expect(err).toBeInstanceOf(QrApiError)
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'slow down' })
  })

  /**
   * The type distinction, now that it is settled. `QrApiError` means "the API described this
   * failure in its own documented vocabulary", and nothing else may claim that — a gateway's
   * HTML page gets the base class, which carries the `status` retry logic needs without
   * inventing a `code` that {@link QrApiErrorCode} would then be lying about.
   *
   * The subclass relationship is asserted in both directions, so the ordering hazard it
   * creates is pinned by a test rather than living only in a doc comment: a consumer who
   * checks the base class first silently swallows every documented API error.
   */
  it('separates an undescribable error response from a documented one', async () => {
    // `statusText` is set explicitly: real `fetch` fills it in from the status line, but the
    // `Response` constructor defaults it to `''`, so a stub without it exercises the fallback
    // branch instead of the normal one. Both are asserted — the bare-status form below.
    stubFetch(
      new Response('<html>503 unavailable</html>', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'content-type': 'text/html' },
      }),
    )

    const undescribable = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expect(undescribable).toBeInstanceOf(QrApiResponseError)
    expect(undescribable).not.toBeInstanceOf(QrApiError)
    expect(undescribable).not.toHaveProperty('code')
    expect(undescribable).toMatchObject({ name: 'QrApiResponseError', status: 503 })

    // Naming what arrived, not only what was expected — the whole point of the message.
    expect((undescribable as Error).message).toContain('503 Service Unavailable')
    expect((undescribable as Error).message).toContain('<html>503 unavailable</html>')

    stubFetch(errorResponse(429, 'RATE_LIMITED', 'Too many requests'))

    const documented = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    // A documented error is *also* a QrApiResponseError, so status-only handling covers both.
    expect(documented).toBeInstanceOf(QrApiError)
    expect(documented).toBeInstanceOf(QrApiResponseError)
    expect(documented).toMatchObject({ name: 'QrApiError', status: 429, code: 'RATE_LIMITED' })
  })

  /**
   * An empty body has nothing to quote, and `""` in a message reads like a bug in the client
   * rather than a description of the response. Worth its own case because it is the shape a
   * load balancer returns when it gives up mid-request.
   */
  it('says so plainly when there was no body to describe', async () => {
    stubFetch(malformedResponse('', 502))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    // No status text on this stub, so this also pins the bare-status fallback.
    expect((err as Error).message).toContain('status 502,')
    expect((err as Error).message).toContain('an empty body')
  })

  /** A gateway error page can be kilobytes of markup; none of it belongs in a stack trace. */
  it('truncates a long body rather than pasting it into the message', async () => {
    stubFetch(malformedResponse(`<html>${'x'.repeat(5000)}</html>`, 503, 'text/html'))

    const err = await createQrApiClient({ apiKey: KEY })
      .renderSvg({ content: 'x' })
      .catch((e: unknown) => e as unknown)

    expect((err as Error).message).toContain('(truncated)')
    expect((err as Error).message.length).toBeLessThan(400)
  })
})
