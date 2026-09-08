import { describe, expect, it } from 'vitest'

import { createQrApiClient, QrApiError } from '../src/index.ts'

/**
 * Integration level: these hit the real QR Render API over the network.
 *
 * Everything else in this package is mocked, which means everything else would still pass if
 * the API changed its response shape, its error envelope, or its auth scheme. This suite is
 * the only thing that would not.
 *
 * **Key handling.** `QR_API_KEY` is a CI variable in the pipeline, so CI genuinely exercises
 * the API. Locally it is usually unset, and the suite skips rather than failing a `pnpm test`
 * that was never going to have a key.
 *
 * That asymmetry is deliberate but has one sharp edge: a silently-skipped suite in CI looks
 * exactly like a passing one. So when `CI` is set and the key is not, this fails loudly
 * instead of skipping — a missing or expired CI variable should break the pipeline, not
 * quietly delete the only coverage of the live API.
 *
 * **Budget.** Renders are rate limited to 60 per minute for the whole account, shared with
 * anything else using that key. Keep this suite to a handful of calls.
 */

const apiKey = process.env['QR_API_KEY']
const baseUrl = process.env['QR_API_URL'] // undefined → the client's default

if (!apiKey && process.env['CI']) {
  throw new Error(
    'QR_API_KEY is not set, but CI is. The integration suite is the only coverage of the live ' +
      'API — skipping it here would leave the pipeline green with that coverage silently gone. ' +
      'Set the QR_API_KEY CI variable, or remove this job.',
  )
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

describe.skipIf(!apiKey)('against the live API', () => {
  const qr = createQrApiClient({ apiKey, baseUrl })

  it('renders an SVG', async () => {
    const svg = await qr.renderSvg({
      content: 'https://qrocodile.io',
      design: { preset: 'ocean' },
    })

    expect(typeof svg).toBe('string')
    expect(svg).toMatch(/^<\?xml|^<svg/)
    expect(svg).toContain('</svg>')
  })

  /**
   * The assertion that matters most here. The API declares this body as `format: binary`,
   * which the generated types render as `string`; only a real response proves the client
   * hands back bytes.
   */
  it('renders a PNG as real image bytes', async () => {
    const png = await qr.renderPng({
      content: 'https://qrocodile.io',
      design: { preset: 'classic' },
    })

    expect(png).toBeInstanceOf(ArrayBuffer)
    expect(png.byteLength).toBeGreaterThan(100)
    expect([...new Uint8Array(png).slice(0, 4)]).toEqual(PNG_MAGIC)
  })

  /**
   * Proves the error envelope the client unwraps is the envelope the API actually sends —
   * `{ error: { code, message } }`, with a code from the documented union. A shape change
   * here would surface in consumer code as `undefined` reaching `err.code`.
   */
  it('maps an API error onto QrApiError', async () => {
    const err = await qr
      // Empty content is rejected by the request schema.
      .renderSvg({ content: '' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(QrApiError)
    const apiError = err as QrApiError
    expect(apiError.status).toBe(400)
    expect(apiError.code).toBe('VALIDATION_ERROR')
    expect(apiError.message).toBeTruthy()
  })

  it('rejects a bad key with UNAUTHORIZED', async () => {
    const err = await createQrApiClient({ apiKey: 'qk_live_definitely_not_a_real_key', baseUrl })
      .renderSvg({ content: 'https://qrocodile.io' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(QrApiError)
    expect((err as QrApiError).status).toBe(401)
    expect((err as QrApiError).code).toBe('UNAUTHORIZED')
  })
})
