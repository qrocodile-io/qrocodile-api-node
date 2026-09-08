// Print one version's section of CHANGELOG.md, for use as GitHub release notes.
//
//   node scripts/changelog-section.mjs 0.2.0
//
// Exits non-zero when that version has no section, or has one with no content. The publish
// workflow runs this **before** publishing, so a release with nothing to say about it fails
// while that is still fixable — once the version is on npm it cannot be unpublished, and the
// release page would be the only place left to explain what changed.
//
// Keeping the changelog authoritative is the point. The release notes are a copy of one
// section, never a second thing to write and keep in step.
import { readFileSync } from 'node:fs'

const CHANGELOG = 'CHANGELOG.md'

/**
 * Everything under `## <version>`, up to the next `## ` heading or the end of the file.
 *
 * Exported for the tests. Headings are matched on the exact version so `0.1.0` cannot match
 * `0.1.0-beta.1` — a pre-release has its own section or none at all.
 */
export function extractSection(markdown, version) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${version}`)
  if (start === -1) return null

  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()

  return body === '' ? null : body
}

// Only run the CLI when executed directly, so importing the function in a test does not
// read the file or call process.exit.
if (process.argv[1] && process.argv[1].endsWith('changelog-section.mjs')) {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: node scripts/changelog-section.mjs <version>')
    process.exit(2)
  }

  const section = extractSection(readFileSync(CHANGELOG, 'utf8'), version)
  if (section === null) {
    console.error(
      `[qrocodile-api] ${CHANGELOG} has no content under "## ${version}".\n\n` +
        `Every release needs to say what changed — the GitHub release notes are this section,\n` +
        `and npm links people here. Add the entry, then move the tag:\n\n` +
        `  # edit ${CHANGELOG}\n` +
        `  git commit -am "Changelog for ${version}"\n` +
        `  git tag -fa v${version} -m "${version}" && git push --force origin v${version}\n\n` +
        `Nothing has been published at this point, so re-tagging is safe.`,
    )
    process.exit(1)
  }

  process.stdout.write(section + '\n')
}
