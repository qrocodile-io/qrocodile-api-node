/**
 * Runs the published package on the oldest Node that `engines.node` admits.
 *
 * CI copies this file into a bare consumer that has the packed tarball installed with npm,
 * switches to that Node version, and runs it there: `pnpm` and `@types/node` cannot reach
 * that far back, so nothing else proves the floor. `fetch` is stubbed, so the result does
 * not depend on the network or the deployed API, but it is the runtime's own `Request` and
 * `Response` the client handles.
 *
 * Both entry points are loaded, because the ESM and CJS bundles are built separately and
 * can fail separately.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

globalThis.fetch = async (request) => {
  const body = await request.text()
  if (body.includes('"fail"')) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'bad' } }, { status: 400 })
  }
  return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
}

const entryPoints = {
  esm: await import('@qrocodile/api'),
  cjs: createRequire(import.meta.url)('@qrocodile/api'),
}

for (const [format, { createQrApiClient, QrApiError }] of Object.entries(entryPoints)) {
  const client = createQrApiClient({ apiKey: 'qk_test_floor' })

  assert.equal(await client.renderSvg({ content: 'hello' }), '<svg/>', format)
  assert.ok((await client.renderPng({ content: 'hello' })) instanceof ArrayBuffer, format)

  await assert.rejects(client.renderSvg({ content: 'fail' }), (error) => {
    assert.ok(error instanceof QrApiError, format)
    assert.equal(error.status, 400, format)
    assert.equal(error.code, 'VALIDATION_ERROR', format)
    return true
  })

  console.log(`${format}: ok on Node ${process.version}`)
}
