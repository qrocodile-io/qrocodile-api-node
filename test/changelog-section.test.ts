import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

// @ts-expect-error -- plain ESM script, deliberately outside the TypeScript project so it
// stays runnable with bare `node` in CI before anything is built.
import { extractSection } from '../scripts/changelog-section.mjs'

/**
 * This decides whether a release happens: the publish workflow runs it before publishing and
 * fails when a version has nothing written about it. A wrong answer either blocks a good
 * release or lets one out with empty notes, so the parsing is worth pinning down.
 */

const CHANGELOG = `# Changelog

Preamble that belongs to no version.

## Unreleased

## 0.2.0

### Added

- A thing.

## 0.1.0

First public release.

### Notes

- Server-side only.
`

describe('extractSection', () => {
  it('returns everything under the heading, up to the next one', () => {
    expect(extractSection(CHANGELOG, '0.2.0')).toBe('### Added\n\n- A thing.')
  })

  it('reads the last section to the end of the file', () => {
    expect(extractSection(CHANGELOG, '0.1.0')).toBe(
      'First public release.\n\n### Notes\n\n- Server-side only.',
    )
  })

  /** An empty `## Unreleased` is the normal state between releases, not a section. */
  it('treats a heading with no content as missing', () => {
    expect(extractSection(CHANGELOG, 'Unreleased')).toBeNull()
  })

  it('returns null for a version that is not there', () => {
    expect(extractSection(CHANGELOG, '9.9.9')).toBeNull()
  })

  /**
   * Exact-match on the heading. A prefix match would hand `0.1.0`'s notes to `0.1.0-beta.1`,
   * which is precisely when someone is least likely to check.
   */
  it('does not let one version match another that starts the same way', () => {
    expect(extractSection(CHANGELOG, '0.1')).toBeNull()
    expect(extractSection('## 0.1.0-beta.1\n\nBeta notes.\n', '0.1.0')).toBeNull()
  })

  it('ignores the preamble above the first version', () => {
    expect(extractSection(CHANGELOG, 'Changelog')).toBeNull()
  })
})

describe('the CLI', () => {
  const run = (args: string[]) =>
    execFileSync('node', ['scripts/changelog-section.mjs', ...args], { encoding: 'utf8' })

  it('prints the section for the current version', () => {
    const version = JSON.parse(
      execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
        encoding: 'utf8',
      }),
    ).version as string

    expect(run([version]).trim()).not.toBe('')
  })

  /**
   * The failure path is the one that matters — it is what stops a release going out with
   * nothing written about it, so it has to actually exit non-zero.
   */
  it('exits non-zero, with an actionable message, for a missing version', () => {
    expect(() => run(['9.9.9'])).toThrow()

    try {
      run(['9.9.9'])
      expect.unreachable('should have thrown')
    } catch (err) {
      const { status, stderr } = err as { status: number; stderr: string }
      expect(status).toBe(1)
      expect(stderr).toContain('has no content under "## 9.9.9"')
      expect(stderr).toContain('git tag -fa')
    }
  })

  it('exits 2 when given no version at all', () => {
    try {
      run([])
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as { status: number }).status).toBe(2)
    }
  })
})
