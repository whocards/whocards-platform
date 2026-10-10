import type {GameLanguage, Refusal} from '@whocards/game'
import {copyFor, playerCopyFor, refusalSchema} from '@whocards/game'
import type {GameError, TurnNotice} from '@whocards/game/hooks'

const isRefusal = (notice: TurnNotice): notice is Refusal => refusalSchema.safeParse(notice).success

export const noticeText = (language: GameLanguage, notice: TurnNotice | GameError): string => {
  const key = typeof notice === 'string' ? notice : (notice.refusal ?? 'network')
  return isRefusal(key) ? copyFor(language).refusals[key] : playerCopyFor(language).notices[key]
}
