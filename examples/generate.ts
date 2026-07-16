/**
 * Generate a QR code via the QRocodile QR Code API and save it to a file.
 *
 *   QR_API_KEY=qk_live_… pnpm --filter @pagebase/qr-api-client generate "https://qrocodile.io" png
 *   QR_API_URL=http://localhost:3002 QR_API_KEY=… pnpm --filter @pagebase/qr-api-client generate "hi" svg
 *
 * Args: [content] [format: svg|png]. Get a key with the `signup` example.
 * renderSvg/renderPng take content plus an optional design; for structured content
 * (wifi, vcard…) pass a typed `content` object — see the logo example and README.
 */
import { writeFile } from 'node:fs/promises'

import { createQrApiClient, type RenderInput } from '../src/index.ts'

const baseUrl = process.env.QR_API_URL // undefined → the client's default (api.qrocodile.io)
const apiKey = process.env.QR_API_KEY
if (!apiKey) {
  console.error(
    'Set QR_API_KEY. Get one with: pnpm --filter @pagebase/qr-api-client signup <email>',
  )
  process.exit(1)
}

const content = process.argv[2] ?? 'https://qrocodile.io'
const format = process.argv[3] === 'svg' ? 'svg' : 'png'

const qr = createQrApiClient({ apiKey, baseUrl })

// URL-looking input uses the typed `url` builder; anything else is encoded as text.
// `design.preset` (and style/logo ids) are typed literal unions — your editor
// autocompletes the valid values. Swap 'ocean' for any preset the API supports.
// The method name picks the output format, so there's no path or `parseAs` to get right —
// the helper resolves to the image directly and throws QrApiError on an error response.
const input: RenderInput = {
  content: /^https?:\/\//i.test(content) ? { type: 'url', url: content } : content,
  design: { preset: 'ocean' },
}

try {
  const file = `qr.${format}`
  if (format === 'png') {
    await writeFile(file, Buffer.from(await qr.renderPng(input)))
  } else {
    await writeFile(file, await qr.renderSvg(input))
  }
  console.error(`✓ Wrote ${file}  (content: ${content}, preset: ocean)`)
} catch (err) {
  console.error(`✗ Render failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
