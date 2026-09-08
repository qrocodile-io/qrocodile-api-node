/**
 * Generate a QR code with a centered logo via the QRocodile QR Code API.
 *
 * Two kinds of logo, chosen automatically from the 2nd argument:
 *   • a path to an image file (.png / .jpg / .svg) → embedded as a CUSTOM logo
 *     (base64, validated + sanitized server-side; no URL fetching)
 *   • anything else → treated as a BUILT-IN logo id (e.g. website, wifi, email)
 *
 *   QR_API_KEY=qk_live_… node examples/logo.ts "https://qrocodile.io" ./logo.png png
 *   QR_API_KEY=… node examples/logo.ts "https://qrocodile.io" website svg
 *   QR_API_URL=http://localhost:3002 QR_API_KEY=… node examples/logo.ts
 *
 * Uses renderSvg/renderPng (POST /v1/qr), which take content plus a full QrDesignConfig.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { createQrApiClient, type RenderInput } from '../src/index.ts'

const apiKey = process.env.QR_API_KEY
if (!apiKey) {
  console.error('Set QR_API_KEY. Get one with: node examples/signup.ts <email>')
  process.exit(1)
}

const content = process.argv[2] ?? 'https://qrocodile.io'
const logoArg = process.argv[3] ?? 'website'
const format = process.argv[4] === 'svg' ? 'svg' : 'png'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

// design.logo is a union: custom (base64 image) OR built-in (by id).
type DesignLogo = NonNullable<NonNullable<RenderInput['design']>['logo']>

async function buildLogo(): Promise<DesignLogo> {
  if (existsSync(logoArg)) {
    const mime = MIME_BY_EXT[extname(logoArg).toLowerCase()]
    if (!mime) throw new Error(`Unsupported logo file type: ${logoArg} (use .png, .jpg, or .svg)`)
    const base64 = (await readFile(logoArg)).toString('base64')
    // A self-describing data URL — the client sends it as-is; the API validates
    // the mime, size, and dimensions, and sanitizes SVGs before embedding.
    return { data: `data:${mime};base64,${base64}`, regionWidth: 0.25 }
  }
  // Not a file → a built-in logo id. Validated against the API's registry server-side
  // (a wrong id returns a clean 400), so we cast the runtime string to the id union.
  return { id: logoArg, color: '#111111', regionWidth: 0.25 } as DesignLogo
}

const qr = createQrApiClient({ apiKey, baseUrl: process.env.QR_API_URL })

try {
  const body: RenderInput = {
    content,
    design: { preset: 'classic', logo: await buildLogo() },
  }

  const file = `qr-logo.${format}`
  if (format === 'png') {
    await writeFile(file, Buffer.from(await qr.renderPng(body)))
  } else {
    await writeFile(file, await qr.renderSvg(body))
  }
  const kind = existsSync(logoArg) ? `custom logo ${logoArg}` : `built-in logo '${logoArg}'`
  console.error(`✓ Wrote ${file}  (content: ${content}, ${kind})`)
} catch (err) {
  console.error(`✗ Render failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
