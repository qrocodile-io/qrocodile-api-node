// Regenerate `src/openapi.d.ts` from the QR Render API's OpenAPI document.
//
//   node scripts/codegen.mjs           rewrite src/openapi.d.ts in place
//   node scripts/codegen.mjs --check   compare instead of writing; exit 1 on drift
//
// The document comes from `apps/qr-api/scripts/dump-openapi.ts`, which builds the Fastify
// app in memory and reads its registered schemas — no server, no database, no port. See
// that script for why a dump beats generating against a developer's running instance.
//
// `SITE_URLS` and `BASE_URL` are pinned to the production values on purpose: they decide
// the server URL and the documentation links baked into the spec, and therefore into the
// types we publish. Generating with a developer's own `.env` would ship `localhost` in a
// package that describes the public API.
//
// The Prettier pass is not cosmetic. `--check` compares the generated text against the
// committed file byte for byte, and openapi-typescript's own formatting differs from this
// repo's, so without it every run reports drift that isn't there.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TARGET = 'src/openapi.d.ts'

const DUMP_ENV = {
  SITE_URLS: 'https://qrocodile.io',
  BASE_URL: 'https://api.qrocodile.io',
}

const check = process.argv.includes('--check')

// Everything transient lives in one directory that is removed in `finally`, so a failure
// part-way through cannot leave a stray file in the package for someone to commit.
const workDir = mkdtempSync(join(tmpdir(), 'qr-api-codegen-'))

try {
  const specPath = join(workDir, 'openapi.json')
  const spec = execFileSync('node', ['../../apps/qr-api/scripts/dump-openapi.ts'], {
    env: { ...process.env, ...DUMP_ENV },
    maxBuffer: 32 * 1024 * 1024,
  })
  writeFileSync(specPath, spec)

  const typesPath = join(workDir, 'openapi.d.ts')
  execFileSync('openapi-typescript', [specPath, '-o', typesPath], { stdio: 'inherit' })
  // Prettier resolves config (and the parser) from the file path it is told about, so pass
  // the eventual target rather than the temp file it is actually reading.
  const generated = execFileSync('prettier', ['--stdin-filepath', TARGET], {
    input: readFileSync(typesPath),
    maxBuffer: 32 * 1024 * 1024,
  }).toString()

  if (!check) {
    writeFileSync(TARGET, generated)
    console.log(`[qr-api-client] Wrote ${TARGET} (${(generated.length / 1024).toFixed(0)} KB).`)
  } else if (readFileSync(TARGET, 'utf8') !== generated) {
    throw new Error(
      `[qr-api-client] ${TARGET} is out of date with the QR Render API's OpenAPI document.\n\n` +
        `The published client's types no longer describe the API it talks to. Run\n` +
        `  pnpm --filter @qrocodile/api codegen\n` +
        `and commit the result.`,
    )
  } else {
    console.log(`[qr-api-client] ${TARGET} matches the API's OpenAPI document.`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
