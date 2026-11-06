import {shuffle} from '../engine/shuffle'
import type {QuestionId} from '../types'
import {poolQuestionIds} from './index'

const DAY_MS = 86_400_000

// mulberry32: a tiny seeded PRNG, so every device shuffles a cycle the same way.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

/**
 * The Question of the Day for a `YYYY-MM-DD` calendar date: the same date gives the
 * same question on every device. Days run in cycles as long as the Pool, each cycle
 * a fresh shuffle, so no question repeats within one.
 */
export const questionOfTheDay = (dateKey: string): QuestionId => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error(`not a YYYY-MM-DD date: ${dateKey}`)
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
  const cycle = Math.floor(day / poolQuestionIds.length)
  const order = shuffle(poolQuestionIds, seeded(cycle))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a non-negative remainder of the Pool's length always indexes it.
  return order[day - cycle * poolQuestionIds.length] as QuestionId
}
