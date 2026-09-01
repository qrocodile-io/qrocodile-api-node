// Fails the build if the published declarations import anything they should not.
//
// Two distinct hazards, both invisible in this repo and fatal on a consumer's disk:
//
//  1. `src/openapi.d.ts` is generated, internal, and not in `files` — so it is not
//     published. Every type the public surface derives from it (`RenderInput`,
//     `QrApiErrorCode`) has to be *inlined* by the declaration rollup. A surviving
//     `import('./openapi.d.ts')` type-checks perfectly here and resolves to nothing once
//     installed.
//  2. Re-exporting `operations` or `paths` would undo the deliberately sealed surface
//     described in src/index.ts: consumers would start depending on generated names that
//     change shape whenever the API's OpenAPI document does.
//
// `openapi-fetch` is the one allowed external specifier — it is a real runtime dependency,
// declared in `dependencies`, so a consumer resolves it normally.
//
// Both emitted declaration files are checked. They are byte-identical today, but the ESM and
// CJS declaration rollups are separate build outputs and only one of them is what a
// `require()` consumer resolves — checking a single file would leave that path unguarded.
import { readFileSync } from 'node:fs'

const DTS_PATHS = ['dist/index.d.ts', 'dist/index.d.cts']
const ALLOWED_SPECIFIERS = new Set(['openapi-fetch'])

for (const DTS_PATH of DTS_PATHS) {
  check(DTS_PATH)
}

function check(DTS_PATH) {
  const dts = readFileSync(DTS_PATH, 'utf8')

  const specifierOf = (line) => line.match(/from\s*(['"])(.+?)\1/)?.[2]

  const leakedImports = dts
    .split('\n')
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(({ line }) => /^import\s/.test(line) || /^export\s.*\bfrom\s/.test(line))
    .filter(({ line }) => {
      const specifier = specifierOf(line)
      return specifier === undefined || !ALLOWED_SPECIFIERS.has(specifier)
    })

  // An `import('…')` in type position is a leak too, and is not caught by the line scan above.
  const leakedTypeImports = [...dts.matchAll(/\bimport\((['"])(.+?)\1\)/g)]
    .map((m) => m[2])
    .filter((specifier) => !ALLOWED_SPECIFIERS.has(specifier))

  // The sealed surface: these names are internal even though index.ts imports them.
  const leakedNames = ['operations', 'paths', 'webhooks', '$defs'].filter((name) =>
    new RegExp(`^(export (declare )?(type|interface) )${name}\\b`, 'm').test(dts),
  )

  if (leakedImports.length > 0 || leakedTypeImports.length > 0 || leakedNames.length > 0) {
    const detail = [
      ...leakedImports.map(({ no, line }) => `  ${DTS_PATH}:${no}  ${line}`),
      ...leakedTypeImports.map((s) => `  type-position import(${JSON.stringify(s)})`),
      ...leakedNames.map((n) => `  exports the internal generated type \`${n}\``),
    ].join('\n')
    throw new Error(
      `[qr-api-client] ${DTS_PATH} is not publishable as-is:\n${detail}\n\n` +
        `The generated OpenAPI types are internal — they must be inlined into the rollup,\n` +
        `never imported from it or re-exported.`,
    )
  }

  console.log(
    `[qr-api-client] ${DTS_PATH} is self-contained (${(dts.length / 1024).toFixed(0)} KB).`,
  )
}
