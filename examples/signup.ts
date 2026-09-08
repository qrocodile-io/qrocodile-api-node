/* eslint-disable no-console -- this is a CLI; stdout/stderr are its interface */
/**
 * Interactive signup helper for the QRocodile QR Code API.
 *
 *   node examples/signup.ts [email] [code]
 *   QR_API_URL=http://localhost:3002 node examples/signup.ts you@example.com
 *
 * Flow: register an email → a 6-digit code arrives in your inbox → paste it here → the script
 * prints your key to stdout (so it's pipeable: `signup you@example.com > key.txt`). All
 * prompts and messages go to stderr.
 *
 * Non-interactive: pass the email as arg 1 and, once you have it, the code as arg 2.
 *
 * The API emails a code rather than a link because mail-security appliances prefetch links and
 * burn single-use tokens before a human ever clicks (docs/qrocodile-auth-concept.md).
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

/** Accepts the code on its own, or pasted out of the email's verify link. */
function codeFrom(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

// The helpers throw QrApiError (extends Error) on an API error response.
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const email = process.argv[2] ?? (await ask('Email: '))
if (!email) {
  console.error('An email address is required. Usage: signup <email> [code]')
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
console.error('✓ Email sent. It carries a 6-digit code — enter it here to reveal your API key.')

const code = codeFrom(process.argv[3] ?? (await ask('6-digit code: ')))
if (code.length !== 6) {
  console.error('A 6-digit code is required. Re-run with the code once the email arrives.')
  rl?.close()
  process.exit(1)
}

let apiKey: string
// `replaced` is true when this address already had a key: the old one stopped working the
// moment this one was issued, so anything still using it now gets a 401.
let replaced: boolean
try {
  const result = await qr.confirmKey(code, { email })
  apiKey = result.apiKey
  replaced = result.replaced
} catch (err) {
  rl?.close()
  console.error(`✗ Confirmation failed: ${errMessage(err)}`)
  console.error('  Five wrong codes burn the pending signup — register again to get a new one.')
  process.exit(1)
}
rl?.close()

if (replaced) {
  console.error('\n! This replaced an existing key for that address — the old one no longer works.')
}
console.error('\n✓ Your API key (store it now — it is not shown again):\n')
console.log(apiKey) // stdout only, so it can be piped/captured
