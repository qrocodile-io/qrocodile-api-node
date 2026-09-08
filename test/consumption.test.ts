import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Consumption level: packs the real tarball and loads it the way an outside consumer would.
 *
 * Nothing else in this repository can catch what this catches. Every in-repo consumer
 * resolves `src/` through the workspace, so the `publishConfig` overlay, the `exports` map,
 * the dual ESM/CJS output and the `files` allowlist are all completely untested until a
 * tarball is installed somewhere that has none of our tooling. Those are exactly the things
 * that fail silently and only for other people.
 *
 * The consumer is assembled by hand rather than with `npm install` so the suite needs no
 * network: the tarball goes into `node_modules/@qrocodile/api`, and `openapi-fetch` — the
 * one runtime dependency — is copied from this package's own resolved copy.
 */

const EXPECTED_EXPORTS = ['QrApiError', 'createQrApiClient']

let consumer: string

/** Run a node script inside the fake consumer and return its stdout. */
function runInConsumer(filename: string, source: string): string {
  const file = join(consumer, filename)
  writeFileSync(file, source)
  return execFileSync('node', [file], { cwd: consumer, encoding: 'utf8' }).trim()
}

beforeAll(() => {
  const packDir = mkdtempSync(join(tmpdir(), 'qr-api-pack-'))
  consumer = mkdtempSync(join(tmpdir(), 'qr-api-consumer-'))

  // `prepack` builds, so the tarball can never contain a stale dist/.
  const packed = execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
    encoding: 'utf8',
    cwd: process.cwd(),
  })
  const tarball = packed
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith('.tgz'))
  if (!tarball) throw new Error(`Could not find the packed tarball in:\n${packed}`)

  const installed = join(consumer, 'node_modules', '@qrocodile', 'api')
  mkdirSync(installed, { recursive: true })
  // npm tarballs wrap everything in package/, which --strip-components removes.
  execFileSync('tar', ['xzf', tarball, '-C', installed, '--strip-components', '1'])

  cpSync(
    join(process.cwd(), 'node_modules', 'openapi-fetch'),
    join(consumer, 'node_modules', 'openapi-fetch'),
    { recursive: true, dereference: true },
  )
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module' }, null, 2),
  )

  rmSync(packDir, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(consumer, { recursive: true, force: true })
})

describe('the published tarball', () => {
  it('ships only what it should', () => {
    const files = execFileSync('find', ['.', '-type', 'f'], {
      cwd: join(consumer, 'node_modules', '@qrocodile', 'api'),
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(/^\.\//, ''))
      .sort()

    expect(files).toContain('package.json')
    expect(files).toContain('README.md')
    expect(files).toContain('LICENSE')
    expect(files.filter((f) => f.startsWith('dist/')).length).toBeGreaterThan(0)

    // Source, examples and contributor docs stay in the repository.
    expect(files.some((f) => f.startsWith('src/'))).toBe(false)
    expect(files.some((f) => f.startsWith('examples/'))).toBe(false)
    expect(files).not.toContain('CONTRIBUTING.md')
    expect(files).not.toContain('tsup.config.ts')
  })

  it('points its manifest at dist, not src', () => {
    const manifest = JSON.parse(
      readFileSync(join(consumer, 'node_modules', '@qrocodile', 'api', 'package.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(manifest['main']).toBe('./dist/index.cjs')
    expect(manifest['module']).toBe('./dist/index.js')
    expect(manifest['types']).toBe('./dist/index.d.ts')
    expect(manifest['private']).toBeUndefined()

    // Each condition needs its own `types`; one shared entry is the dual-package typing bug.
    expect(manifest['exports']).toEqual({
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    })
  })
})

describe('loading it', () => {
  it('works through import', () => {
    const out = runInConsumer(
      'probe.mjs',
      `import * as api from '@qrocodile/api'
       console.log(Object.keys(api).sort().join(','))`,
    )
    expect(out).toBe(EXPECTED_EXPORTS.join(','))
  })

  it('works through require', () => {
    const out = runInConsumer(
      'probe.cjs',
      `const api = require('@qrocodile/api')
       console.log(Object.keys(api).sort().join(','))`,
    )
    expect(out).toBe(EXPECTED_EXPORTS.join(','))
  })

  /**
   * The two entry points are separate build outputs, so `instanceof QrApiError` holding in
   * one says nothing about the other. A consumer that catches an error from this client
   * relies on it in whichever module system they happen to use.
   */
  it('builds a working client in both module systems', () => {
    const body = `
      const qr = createQrApiClient({ apiKey: 'qk_live_x' })
      const methods = Object.keys(qr).sort().join(',')
      const err = new QrApiError('boom', 429, 'RATE_LIMITED')
      console.log([methods, err instanceof QrApiError, err instanceof Error, err.status].join('|'))`

    const expected = 'confirmKey,registerKey,renderPng,renderSvg|true|true|429'

    expect(
      runInConsumer(
        'client.mjs',
        `import { createQrApiClient, QrApiError } from '@qrocodile/api'${body}`,
      ),
    ).toBe(expected)
    expect(
      runInConsumer(
        'client.cjs',
        `const { createQrApiClient, QrApiError } = require('@qrocodile/api')${body}`,
      ),
    ).toBe(expected)
  })
})
