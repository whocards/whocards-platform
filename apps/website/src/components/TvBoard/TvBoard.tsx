import {useMemo, useState} from 'react'
import type {QuestionSet} from '@whocards/decks'

export type TvBoardProps = {
  /** map of question id -> { lang: text } — same shape <Play> takes (@whocards/decks) */
  questions: QuestionSet
  /** ordered list of available language codes; the Board always shows the first */
  languages: string[]
}

// Unambiguous alphabet for a human-typeable room code (no 0/O, 1/I/L, …) — the
// Jackbox/Slido/Mentimeter room-code convention this spike is exploring
// (see docs/strategy/surface-tv.md §3, §6). Not shared with any real
// implementation yet — this is the spike's own throwaway copy.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5

const randomRoomCode = (): string =>
  Array.from(
    {length: CODE_LENGTH},
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join('')

const randomQuestionId = (ids: string[], exclude?: string): string | undefined => {
  const pool = ids.length > 1 && exclude !== undefined ? ids.filter((id) => id !== exclude) : ids
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Dev-only spike (issue #213, docs/strategy/surface-tv.md §6) — a big-screen
 * "Board" rendering *one* Question in 10-foot-readable type next to a room
 * code, to let the visual direction get judged on an actual screen before any
 * real build. Deliberately NOT the real thing:
 *
 * - The room code is generated client-side on mount and goes nowhere — there
 *   is no pairing, no session, no backend (see surface-tv.md §3 for the
 *   proposed real mechanism).
 * - "Show another question" is a dev-only affordance to preview more than one
 *   card without wiring a real deal/advance action. A real Board has NO
 *   on-screen interactive controls at all — every control comes from the
 *   phone Remote (surface-tv.md §4) — this button is styled to look
 *   unmistakably like a dev tool, not part of the design.
 *
 * Only ever mounted from src/pages/dev/tv-board.astro, which 404s outside
 * `astro dev` — see that file for the gating (mirrors dev/image-playground.astro).
 */
export const TvBoard = ({questions, languages}: TvBoardProps) => {
  const questionIds = useMemo(() => Object.keys(questions), [questions])
  const language = languages[0] ?? ''

  const [roomCode] = useState(randomRoomCode)
  const [questionId, setQuestionId] = useState<string | undefined>(() => questionIds[0])

  const questionText = (questionId !== undefined && questions[questionId]?.[language]) || ''

  const showAnother = () => setQuestionId((current) => randomQuestionId(questionIds, current))

  return (
    <div className='bg-darkest relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-16 py-12 text-white'>
      <div className='absolute right-8 top-8 flex flex-col items-end gap-1 text-right'>
        <span className='text-gray-dark text-sm uppercase tracking-widest'>Join on your phone</span>
        <span className='font-title rounded-lg bg-white/10 px-5 py-2 text-4xl tracking-[0.3em] text-yellow-400'>
          {roomCode}
        </span>
        <span className='text-gray-dark text-xs'>
          whocards.cc/tv/remote — mock code, not wired up
        </span>
      </div>

      <h1 className='max-w-6xl text-balance text-center text-6xl font-semibold leading-tight lg:text-8xl'>
        {questionText}
      </h1>

      <button
        type='button'
        onClick={showAnother}
        className='text-gray-dark absolute bottom-8 left-1/2 -translate-x-1/2 text-sm underline decoration-dotted underline-offset-4 hover:text-white'
      >
        dev only — show another question
      </button>

      <span className='font-title absolute bottom-8 right-8 text-lg'>
        WHO<span className='text-primary-dark'>?</span>
        <span className='text-white'>CARDS</span>
      </span>
    </div>
  )
}
