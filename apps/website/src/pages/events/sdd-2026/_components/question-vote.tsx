import type {GameLanguage, QuestionVote as Vote, TurnView} from '@whocards/game'
import {playerCopyFor} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useRef, useState} from 'react'

import {cn} from '~utils/cn'

type Props = {turn: TurnView; language: GameLanguage; act: GameSession['act']}

/** Optional thumbs on my own finished question; tapping the selected thumb clears it. */
export const QuestionVote = ({turn, language, act}: Props) => {
  const copy = playerCopyFor(language)
  const [optimistic, setOptimistic] = useState<Vote | null | undefined>(undefined)
  const latest = useRef(0)
  const shown = optimistic === undefined ? turn.questionVote : optimistic

  const vote = async (pick: Vote) => {
    const next = shown === pick ? null : pick
    const call = ++latest.current
    setOptimistic(next)
    await act((c) => c.vote(turn.id, next))
    // Only the last tap hands back to server state, so quick double-taps don't flicker.
    if (call === latest.current) setOptimistic(undefined)
  }

  const thumb = (pick: Vote, glyph: string, label: string) => (
    <button
      type='button'
      aria-label={label}
      aria-pressed={shown === pick}
      className={cn(
        'flex size-12 items-center justify-center rounded-full border border-white/20 text-2xl transition-transform active:scale-90',
        shown === pick ? 'bg-primary-light' : 'bg-transparent opacity-60'
      )}
      onClick={() => void vote(pick)}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  )

  return (
    <fieldset className='m-0 flex gap-3 border-0 p-0'>
      <legend className='sr-only'>{copy.turn.rateQuestion}</legend>
      {thumb(1, '👍', copy.turn.voteUp)}
      {thumb(-1, '👎', copy.turn.voteDown)}
    </fieldset>
  )
}
