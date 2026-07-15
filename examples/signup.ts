/* eslint-disable no-console -- this is a CLI; stdout/stderr are its interface */
/**
 * Interactive signup helper for the QRocodile QR Code API.
 *
 *   pnpm --filter @pagebase/qr-api-client signup [email]
 *   QR_API_URL=http://localhost:3002 pnpm --filter @pagebase/qr-api-client signup you@example.com
 *
 * Flow: register an email → you open the confirmation link from your inbox (or
 * paste it here) → the script fetches your key and prints it to stdout (so it's
 * pipeable: `signup you@example.com > key.txt`). All prompts/messages go to stderr.
 *
 * Non-interactive: pass the email as arg 1 and, once you have it, the confirmation
 * token/link as arg 2 to skip prompts entirely.
 */
import { stderr, stdin } from 'node:process'
import { createInterface } from 'node:readline/promises'

import { createQrApiClient } from '../src/index.ts'

const baseUrl = process.env.QR_API_URL ?? 'https://api.qrocodile.io'
const rl = stdin.isTTY ? createInterface({ input: stdin, output: stderr }) : null

async function ask(question: string): Promise<string> {
  if (!rl) return ''
  return (await rl.question(question)).trim()
}

function tokenFrom(input: string): string {
  const s = input.trim()
  try {
    return new URL(s).searchParams.get('token') ?? s
  } catch {
    return s // already a bare token
  }
}

// The helpers throw QrApiError (extends Error) on an API error response.
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const email = process.argv[2] ?? (await ask('Email: '))
if (!email) {
  console.error('An email address is required. Usage: signup <email>')
  rl?.close()
  process.exit(1)
}

const qr = createQrApiClient({ baseUrl })

console.error(`Registering ${email} at ${baseUrl} …`)
try {
  await qr.registerKey(email)
} catch (err) {
  console.error(`✗ Registration failed: ${errMessage(err)}`)
  rl?.close()
  process.exit(1)
}
console.error('✓ Confirmation email sent. Open the link in your inbox to reveal the key,')
console.error('  or paste it here and this script will fetch the key for you.')

const token = process.argv[3]
  ? tokenFrom(process.argv[3])
  : tokenFrom(await ask('Confirmation link or token: '))
if (!token) {
  console.error('No link provided — open it in your browser to see your key. Done.')
  rl?.close()
  process.exit(0)
}

let apiKey: string
try {
  // The 200 documents both JSON and HTML, so `data` is a union — we asked for JSON.
  apiKey = ((await qr.confirmKey(token)) as { apiKey: string }).apiKey
} catch (err) {
  rl?.close()
  console.error(`✗ Confirmation failed: ${errMessage(err)}`)
  process.exit(1)
}
rl?.close()

console.error('\n✓ Your API key (store it now — it is not shown again):\n')
console.log(apiKey) // stdout only, so it can be piped/captured
