/**
 * Helpers for asserting on the styles NativeWind actually resolved a
 * `className` into.
 *
 * Under NativeWind v5 a `className` never reaches the rendered element: the
 * component wrapper compiles it away and emits a `style` prop instead. So
 * `expect(node.props.className).toBe('text-white')` — which is what these tests
 * used to do — can only ever assert that a string was passed *in*, and would
 * keep passing even if the whole CSS pipeline stopped producing styles. Reading
 * the resolved `style` back asserts the thing that actually reaches the screen:
 * that `text-white` is `colors.white`, that the Tailwind theme was built from
 * @whocards/tokens, and that class resolution is running at all.
 */

type StyledNode = {props: {style?: unknown}}

/**
 * The single flattened style object behind a node's `style` prop. NativeWind
 * emits an array (one entry per contributing rule, in cascade order), which
 * React Native flattens last-wins.
 */
export const resolvedStyle = (node: StyledNode): Record<string, unknown> => {
  const merged: Record<string, unknown> = {}
  for (const entry of [node.props.style].flat(Number.POSITIVE_INFINITY)) {
    if (entry && typeof entry === 'object') Object.assign(merged, entry)
  }
  return merged
}

/**
 * A token colour with Tailwind's `/NN` opacity modifier applied, in the 8-digit
 * hex form lightningcss serialises to — `withOpacity(colors.white, 70)` is what
 * `text-white/70` should resolve to.
 *
 * The alpha byte is `round(f32(percent / 100) * 255)`: lightningcss holds alpha
 * as a 32-bit float, so `70%` is 0.69999998 and rounds *down* to 178 (`b2`)
 * rather than the 179 an exact 0.7 would give.
 */
export const withOpacity = (hex: string, percent: number): string =>
  hex +
  Math.round(Math.fround(percent / 100) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * Tailwind's root font size, in the px React Native works in. Tailwind emits
 * spacing/radius tokens in `rem`; react-native-css inlines them at compile time
 * against this multiplier, so `rounded-2.5xl` (1.25rem) is 17.5.
 */
export const REM_PX = 14

/** `rem('1.125rem')` → 15.75 — a rem-valued token as the px it compiles to. */
export const rem = (value: string): number => Number.parseFloat(value) * REM_PX
