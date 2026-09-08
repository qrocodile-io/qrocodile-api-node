import { describe, expectTypeOf, it } from 'vitest'

import {
  createQrApiClient,
  QrApiError,
  type ConfirmKeyResult,
  type QrApiClient,
  type QrApiClientOptions,
  type QrApiErrorCode,
  type RegisterKeyResult,
  type RenderInput,
} from './index.ts'

/**
 * Compile-time guard on the published surface.
 *
 * `expectTypeOf` assertions are checked by `tsc --noEmit` (the `typecheck` script), not at
 * runtime — the same mechanism `apps/qr-api/src/schemas/design.test.ts` uses. Vitest runs the
 * file so the `it` blocks report, but the real failure is a type error.
 *
 * The point is that a breaking change to this package's API has to be *deliberate*. Every
 * method signature here is one a consumer writes code against, and several are asserted
 * rather than inferred (see `unwrap` in index.ts), so nothing else would catch a wrong one.
 *
 * When one of these fails, that is the signal to bump accordingly and note it in the
 * changelog — not to edit the assertion until it passes.
 */

describe('the exported surface', () => {
  /**
   * Deliberately `toEqualTypeOf` on the whole client object rather than a per-method check:
   * this fails on a *removed* or *renamed* method too, which is the breaking change most
   * likely to slip through. A method added in the long tail widens this and is expected to
   * require an edit here.
   */
  it('is exactly these four methods, with these signatures', () => {
    expectTypeOf<QrApiClient>().toEqualTypeOf<{
      renderSvg(input: RenderInput): Promise<string>
      renderPng(input: RenderInput): Promise<ArrayBuffer>
      registerKey(email: string, lang?: 'en' | 'de'): Promise<RegisterKeyResult>
      confirmKey(
        code: string,
        identifier: { email: string } | { rid: string },
      ): Promise<ConfirmKeyResult>
    }>()
  })

  it('is what the factory returns', () => {
    expectTypeOf(createQrApiClient).returns.toEqualTypeOf<QrApiClient>()
    expectTypeOf(createQrApiClient).parameter(0).toEqualTypeOf<QrApiClientOptions | undefined>()
  })

  /**
   * The render half of the contract, restated on its own. `renderPng` returning `ArrayBuffer`
   * is the assertion with real history: the spec types that body as `string`, so inference
   * once produced a signature that promised a string of PNG bytes.
   */
  it('splits the two render outputs by type', () => {
    expectTypeOf<QrApiClient['renderSvg']>().returns.resolves.toEqualTypeOf<string>()
    expectTypeOf<QrApiClient['renderPng']>().returns.resolves.toEqualTypeOf<ArrayBuffer>()
  })
})

describe('the option bag', () => {
  it('takes an optional key and base url, and nothing else', () => {
    expectTypeOf<QrApiClientOptions>().toEqualTypeOf<{
      apiKey?: string | undefined
      baseUrl?: string | undefined
    }>()
  })
})

describe('RenderInput', () => {
  /** `format` is chosen by the method name, so exposing it would be a second way to say it. */
  it('does not expose format', () => {
    expectTypeOf<RenderInput>().not.toHaveProperty('format')
  })

  it('carries content plus the optional render controls', () => {
    expectTypeOf<RenderInput['content']>().toEqualTypeOf<string>()
    expectTypeOf<RenderInput>().toHaveProperty('design')
    expectTypeOf<RenderInput>().toHaveProperty('size')
    expectTypeOf<RenderInput>().toHaveProperty('fixContrast')
  })

  /**
   * Spot-check that design ids survived the declaration rollup as literal unions. If the
   * generated types ever failed to inline, these widen to `string` and the autocomplete this
   * package exists to provide is silently gone.
   */
  it('keeps design ids as literal unions, not string', () => {
    type Preset = NonNullable<NonNullable<RenderInput['design']>['preset']>
    expectTypeOf<Preset>().not.toEqualTypeOf<string>()
    expectTypeOf<'ocean'>().toExtend<Preset>()
  })
})

describe('errors', () => {
  it('exposes status and code on QrApiError', () => {
    expectTypeOf<QrApiError['status']>().toEqualTypeOf<number>()
    expectTypeOf<QrApiError['code']>().toEqualTypeOf<QrApiErrorCode>()
    expectTypeOf<QrApiError>().toExtend<Error>()
  })

  /**
   * A closed union, not `string` — that is what makes an exhaustive `switch` possible in
   * consumer code and turns an API-side change into a compile error there.
   */
  it('keeps QrApiErrorCode a closed union', () => {
    expectTypeOf<QrApiErrorCode>().not.toEqualTypeOf<string>()
    expectTypeOf<'RATE_LIMITED'>().toExtend<QrApiErrorCode>()
    expectTypeOf<'VALIDATION_ERROR'>().toExtend<QrApiErrorCode>()
  })
})

describe('signup results', () => {
  it('returns the key and the replaced flag', () => {
    expectTypeOf<ConfirmKeyResult['apiKey']>().toEqualTypeOf<string>()
    expectTypeOf<ConfirmKeyResult['replaced']>().toEqualTypeOf<boolean>()
  })

  it('returns a human-facing message from registerKey', () => {
    expectTypeOf<RegisterKeyResult['message']>().toEqualTypeOf<string>()
  })
})
