/**
 * A pixel-only UI snapshot format for the mobile app.
 *
 * Why not a plain `toJSON()` snapshot: React Native renames and reshuffles its
 * internal host props on almost every release, so a raw tree snapshot churns on
 * upgrades that changed nothing a player can see — and a suite that churns
 * trains everyone to run `jest -u` without reading the diff, which is exactly
 * the habit that lets a real regression through.
 *
 * So this serializer keeps only what can move a pixel:
 *   - the host component type (`View`, `Text`, `Image`, `Modal`, …)
 *   - the FLATTENED resolved style (see `flattenStyle`) — one line per property,
 *     alphabetically, so a diff points straight at the property that changed
 *   - a `className` only when a host mock still exposes it (NativeWind v5
 *     normally compiles it away and emits the resolved `style` instead)
 *   - rendered text content
 *   - the accessibility props that have a presentational effect:
 *     `accessibilityRole`, `accessibilityLabel`, `accessibilityState`
 *
 * Everything else — function props, refs, `testID`, `collapsable`, `source`,
 * and every RN-internal prop — is dropped on purpose.
 *
 * `source` is worth a word, because dropping it means swapping a bundled asset
 * for a different image does not move these snapshots. That is deliberate on
 * two counts. A bundled `source` resolves to a numeric asset-registry id whose
 * value depends on module registration order, so it churns on exactly the
 * bundler and toolchain upgrades this suite exists to hold still — it would add
 * false diffs, not real ones. And asset identity is a different question from
 * "did the render change", answerable far more cheaply by the assets being in
 * git. If asset swaps ever need catching, assert on them directly; do not
 * reintroduce the churn here.
 *
 * Two things it deliberately cannot see:
 *
 * 1. The native side. This is the JS half of the render only; what the native
 *    layer does with these props (Yoga's actual layout maths, text shaping,
 *    shadow rasterisation) is invisible here. A clean run is evidence that the
 *    JS render matches this baseline, not that the screen is identical — that
 *    still needs an on-device / Maestro comparison.
 * 2. Native layout and rasterization. Jest compiles and injects the app's
 *    stylesheet, so Tailwind classes are represented by their resolved styles;
 *    Yoga layout, text shaping, shadows, and platform rendering still need a
 *    native comparison.
 *
 * Usage:
 *
 *   import {uiSnapshot} from '@/test-utils/ui-snapshot'
 *   expect(uiSnapshot(screen)).toMatchSnapshot()
 */
import type {ImageStyle, StyleProp, TextStyle, ViewStyle} from 'react-native'
import {StyleSheet} from 'react-native'

/** Any of the three RN style shapes, in any of the nestings `style` accepts. */
type AnyStyle = StyleProp<ViewStyle | TextStyle | ImageStyle>

/**
 * The single flattened style object behind a `style` prop.
 *
 * A `style` prop is an arbitrarily nested array (NativeWind contributes one
 * entry per matching rule, in cascade order, on top of whatever the component
 * passed); React Native flattens it last-wins before it ever reaches the native
 * side, so the flattened object — not the array — is what decides pixels. This
 * is the one place that flattening happens for tests: anything else that needs
 * a resolved style should call through here rather than re-implement it.
 */
export const flattenStyle = (style: AnyStyle): Record<string, unknown> => {
  const flat = StyleSheet.flatten(style)
  if (!flat || typeof flat !== 'object') return {}
  return Object.fromEntries(Object.entries(flat))
}

/**
 * The accessibility props that change what is presented: a role can change a
 * platform's rendering of a control, a label is what a screen reader speaks,
 * and state (selected / checked / disabled) is what selection ticks and dimmed
 * rows are driven from. Ordered rather than alphabetical — role, then label,
 * then state reads the way the element does.
 */
const PRESENTATIONAL_PROPS = [
  'accessibilityRole',
  'accessibilityLabel',
  'accessibilityState',
] as const

/**
 * Style numbers are rounded to 4 decimal places. React Native's own maths
 * (`PixelRatio`, opacity compositing, rem→px) is float, so a release can shift
 * a value by ~1e-15 with no possible visual effect. 1/10000 of a point is two
 * orders of magnitude below the smallest addressable physical pixel on any
 * shipping density, so nothing visible can hide under this.
 */
const round = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : value

/** JSON with object keys sorted and numbers rounded, so the output is stable. */
const format = (value: unknown): string => {
  if (typeof value === 'number') return JSON.stringify(round(value))
  if (Array.isArray(value)) return `[${value.map((entry) => format(entry)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${format(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

/** One rendered host element, as `toJSON()` reports it. */
type HostElement = {
  type: string
  props: {style?: AnyStyle} & Record<string, unknown>
  children: unknown[] | null
}

const isHostElement = (value: unknown): value is HostElement =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof value.type === 'string' &&
  'props' in value

const INDENT = '  '

/**
 * Appends one node's lines. The format is indentation-structured:
 *   `<Type …>`      opens an element (no closing tag — indentation is structure)
 *   `~ className`   is a class string exposed by a host mock (usually absent in v5)
 *   `| key: value`  is one resolved style property of the element above it
 *   `"…"`           is rendered text
 */
const writeNode = (node: unknown, depth: number, lines: string[]): void => {
  const pad = INDENT.repeat(depth)
  if (typeof node === 'string' || typeof node === 'number') {
    lines.push(`${pad}${JSON.stringify(String(node))}`)
    return
  }
  if (!isHostElement(node)) return

  const attributes = PRESENTATIONAL_PROPS.filter((name) => node.props[name] !== undefined)
    .map((name) => ` ${name}=${format(node.props[name])}`)
    .join('')
  lines.push(`${pad}<${node.type}${attributes}>`)

  if (typeof node.props.className === 'string' && node.props.className.length > 0) {
    lines.push(`${pad}${INDENT}~ className: ${format(node.props.className)}`)
  }

  const style = flattenStyle(node.props.style)
  for (const key of Object.keys(style).toSorted()) {
    if (style[key] === undefined) continue
    lines.push(`${pad}${INDENT}| ${key}: ${format(style[key])}`)
  }

  for (const child of node.children ?? []) writeNode(child, depth + 1, lines)
}

/** What `uiSnapshot` returns; the serializer registered below prints it verbatim. */
export class UiSnapshot {
  constructor(readonly text: string) {}
}

expect.addSnapshotSerializer({
  test: (value: unknown) => value instanceof UiSnapshot,
  serialize: (value: unknown) => (value instanceof UiSnapshot ? value.text : ''),
})

/** Anything carrying RNTL's `toJSON()` — `screen`, or a `render()` result. */
type Rendered = {toJSON: () => unknown}

/**
 * The pixel-relevant description of everything currently rendered.
 *
 * `toJSON()` is deliberately the input rather than `screen.root`: it is the one
 * tree shape that is identical under @testing-library/react-native 13 and 14,
 * which is what lets a baseline recorded before an upgrade be replayed,
 * untouched, after it.
 */
export const uiSnapshot = (rendered: Rendered): UiSnapshot => {
  const tree = rendered.toJSON()
  const roots = Array.isArray(tree) ? tree : [tree]
  const lines: string[] = []
  for (const root of roots) writeNode(root, 0, lines)
  return new UiSnapshot(lines.join('\n'))
}
