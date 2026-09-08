// Regenerate `src/openapi.d.ts` from the QR Render API's OpenAPI document.
//
//   node scripts/codegen.mjs           rewrite src/openapi.d.ts in place
//   node scripts/codegen.mjs --check   compare instead of writing; exit 1 on drift
//
// The document is fetched from the live API. Inside the monorepo this used to be dumped
// from the Fastify app in memory — no server, no network — but that is not available here,
// and fetching has one property the dump did not: it describes the API as **deployed**,
// which is the only API a published client can actually talk to.
//
// The cost is that `--check` now answers a slightly different question. It no longer fails
// when someone edits the API's source; it fails once that edit is deployed. Drift is caught
// after release rather than before merge, so this is worth running on a schedule and not
// only on push. A versioned spec artifact would restore the pre-merge guarantee — see the
// `qrocodile-openapi` plan in the monorepo's docs.
//
// The Prettier pass is not cosmetic. `--check` compares the generated text against the
// committed file byte for byte, and openapi-typescript's own formatting differs from this
// repo's, so without it every run reports drift that isn't there.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TARGET = 'src/openapi.d.ts'
const SPEC_URL = process.env['QR_API_SPEC_URL'] ?? 'https://api.qrocodile.io/docs/json'

const check = process.argv.includes('--check')

async function fetchSpec() {
  const response = await fetch(SPEC_URL, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(
      `[qrocodile-api] Could not fetch the OpenAPI document from ${SPEC_URL} ` +
        `(HTTP ${response.status}). Point QR_API_SPEC_URL at another deployment to override.`,
    )
  }
  // Re-serialised rather than passed through, so a change in the server's whitespace or key
  // order cannot show up as drift in the generated types.
  return JSON.stringify(await response.json(), null, 2)
}

// Everything transient lives in one directory that is removed in `finally`, so a failure
// part-way through cannot leave a stray file in the repo for someone to commit.
const workDir = mkdtempSync(join(tmpdir(), 'qrocodile-api-codegen-'))

try {
  const specPath = join(workDir, 'openapi.json')
  writeFileSync(specPath, await fetchSpec())

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
    console.log(`[qrocodile-api] Wrote ${TARGET} (${(generated.length / 1024).toFixed(0)} KB).`)
  } else if (readFileSync(TARGET, 'utf8') !== generated) {
    throw new Error(
      `[qrocodile-api] ${TARGET} is out of date with the deployed API at ${SPEC_URL}.\n\n` +
        `The published client's types no longer describe the API it talks to. Run\n` +
        `  pnpm codegen\n` +
        `and commit the result.`,
    )
  } else {
    console.log(`[qrocodile-api] ${TARGET} matches the deployed API.`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
