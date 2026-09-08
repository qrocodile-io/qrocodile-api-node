import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQrApiClient, QrApiError } from './index.ts'

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
   * QrApiError would invent both. It propagates untouched — documented behaviour, and the
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

  it('honours an override', async () => {
    const spy = stubFetch(new Response('<svg/>'))

    await createQrApiClient({ apiKey: KEY, baseUrl: 'http://localhost:3002' }).renderSvg({
      content: 'x',
    })

    expect((spy.mock.calls[0]?.[0] as Request).url).toBe('http://localhost:3002/v1/qr')
  })
})
