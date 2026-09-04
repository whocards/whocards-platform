export const addClick = () => {}

/**
 * `Object.keys` always widens to `string[]`, even when `T`'s keys are a
 * known closed set. Every call site here controls `T`'s construction (a
 * `Record` literal or `keyof typeof` source), so the widening is provably
 * safe — this is the one audited cast for that pattern, reused instead of
 * a separate `as SomeKey[]` suppression at each call site.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see comment above; this is the single audited cast for the Object.keys-widens-to-string[] pattern.
export const objectKeys = <T extends object>(o: T): (keyof T)[] => Object.keys(o) as (keyof T)[]
