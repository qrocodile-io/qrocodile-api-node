/**
 * Generate a QR code via the QRocodile QR Code API and save it to a file.
 *
 *   QR_API_KEY=qk_live_… pnpm --filter @pagebase/qr-api-client generate "https://qrocodile.io" png
 *   QR_API_URL=http://localhost:3002 QR_API_KEY=… pnpm --filter @pagebase/qr-api-client generate "hi" svg
 *
 * Args: [content] [format: svg|png]. Get a key with the `signup` example.
 * This shows the simple GET path; for full designs (palettes, gradients, logos,
 * custom styles) POST /v1/qr with a `design` body — see the README.
 */
import { writeFile } from 'node:fs/promises'

import { createQrApiClient } from '../src/index.ts'

const baseUrl = process.env.QR_API_URL ?? 'https://api.qrocodile.io'
const apiKey = process.env.QR_API_KEY
if (!apiKey) {
  console.error(
    'Set QR_API_KEY. Get one with: pnpm --filter @pagebase/qr-api-client signup <email>',
  )
  process.exit(1)
}

const content = process.argv[2] ?? 'https://qrocodile.io'
const format = process.argv[3] === 'svg' ? 'svg' : 'png'
// Encode as a URL when it looks like one, otherwise as plain text (else the default
// 'url' type would reject non-URL content).
const type = /^https?:\/\//i.test(content) ? 'url' : 'text'

const qr = createQrApiClient(baseUrl, apiKey)

// `preset` (and module/finder style/logo ids) are typed literal unions — your editor
// autocompletes the valid values. Swap 'ocean' for any preset the API supports.
const result = await qr.GET('/v1/qr', {
  params: { query: { content, type, format, preset: 'ocean' } },
  parseAs: format === 'png' ? 'arrayBuffer' : 'text',
})

if (!result.response.ok) {
  // The API declares no error-response schema (so `error` is typed `never`), but
  // openapi-fetch still parses the { error: { code, message } } body into it at runtime.
  const body = result.error as { error?: { message?: string } } | undefined
  console.error(`✗ Render failed: ${body?.error?.message ?? `HTTP ${result.response.status}`}`)
  process.exit(1)
}
const { data } = result

// Render responses are raw image bytes (the API declares no typed body), so cast.
const file = `qr.${format}`
const bytes =
  format === 'png' ? Buffer.from(data as unknown as ArrayBuffer) : (data as unknown as string)
await writeFile(file, bytes)
console.error(`✓ Wrote ${file}  (content: ${content}, preset: ocean)`)
