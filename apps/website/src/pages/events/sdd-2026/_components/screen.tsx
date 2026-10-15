import type {ScreenState} from '@whocards/game'
import {clockOffset, playerCopyFor, readPairCode} from '@whocards/game'
import {useRoundTimer} from '@whocards/game/hooks'
import {useEffect, useMemo, useState} from 'react'

import {createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {joinPath} from '~lib/game/links'
import {createTokenStore} from '~lib/game/token-store'
import {createWakeLock} from '~lib/game/wake-lock'

import {Loading, QrCode} from './ui'

const POLL_MS = 3000
const copy = playerCopyFor('en')

const Board = ({code}: {code: string}) => {
  const api = useMemo(() => createGameApi(code, createTokenStore(null)), [code])
  const [screen, setScreen] = useState<ScreenState | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const joinUrl = `${location.origin}${joinPath(code)}`

  useEffect(() => {
    let alive = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      const sentAt = Date.now()
      try {
        const next = await api.screen()
        if (!alive) return
        setScreen(next)
        setOffsetMs(clockOffset({serverNow: next.serverNow, sentAt, receivedAt: Date.now()}))
      } catch {
        // A missed poll just keeps the last board up.
      }
      if (alive) timeout = setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    return () => {
      alive = false
      clearTimeout(timeout)
    }
  }, [api])

  useEffect(() => {
    const lock = createWakeLock()
    void lock.acquire()
    return () => void lock.release()
  }, [])

  if (!screen) return <Loading label={copy.waiting.loading} className='min-h-dvh text-[2em]' />

  const {game, counts} = screen
  const {steps, physicalStep} = copy.screen.howTo
  const howTo = screen.round?.physical ? [...steps.slice(0, -1), physicalStep] : steps
  const host = joinUrl.replace(/^https?:\/\//, '')

  return (
    <div className='grid h-dvh w-full grid-cols-[1fr_auto] gap-[4vw] px-[4vw] pt-[11vh] pb-[5vh]'>
      <div className='flex min-h-0 flex-col justify-between gap-[3vh]'>
        <div className='flex flex-col gap-[0.4em]'>
          <h1 className='font-title text-[3.4em] leading-tight font-bold text-balance'>
            {game.title}
          </h1>
          {game.organizer && (
            <p className='text-gray-dark text-[1.6em]'>
              {copy.join.hostedBy} {game.organizer}
            </p>
          )}
        </div>
        <Status screen={screen} offsetMs={offsetMs} />
        {game.status !== 'ended' && (
          <section className='flex flex-col gap-[0.6em]'>
            <h2 className='text-gray-dark text-[1.2em] font-semibold tracking-wider uppercase'>
              {copy.screen.howTo.title}
            </h2>
            <ol className='flex flex-col gap-[0.5em] text-[1.6em]'>
              {howTo.map((step, i) => (
                <li key={step} className='flex items-baseline gap-[0.6em]'>
                  <span className='bg-yellow-400 text-darkest inline-flex size-[1.5em] shrink-0 items-center justify-center rounded-full text-[0.8em] font-bold'>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        )}
        <dl className='grid grid-cols-4 gap-[1em]'>
          {(['joined', 'paired', 'talking', 'done'] as const).map((key) => (
            <div
              key={key}
              className='flex flex-col rounded-2xl border border-white/10 bg-white/5 px-[1em] py-[0.6em]'
            >
              <dt className='text-gray-dark order-2 text-[1.2em]'>{copy.screen.counts[key]}</dt>
              <dd className='font-title text-[2.8em] leading-none font-bold tabular-nums'>
                {counts[key]}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <aside className='bg-background/80 flex min-h-0 flex-col items-center justify-center gap-[1em] self-center rounded-3xl border border-white/10 p-[2em] shadow-2xl shadow-black/40 backdrop-blur-md'>
        {/* Shown in the lobby too: the join page waits on a draft game and lets people in once it opens. */}
        <span className='font-title text-[2em] font-bold'>{copy.screen.joinAt}</span>
        <QrCode value={joinUrl} className='w-[min(40vh,28vw)]' />
        <span className='text-gray-dark text-[1.2em]'>
          {copy.screen.orVisit} <span className='text-white'>{host}</span>
        </span>
        <div className='flex flex-col items-center'>
          <span className='text-gray-dark text-[1.1em] tracking-wider uppercase'>
            {copy.screen.code}
          </span>
          <span className='font-mono text-[3.2em] leading-none font-semibold tracking-[0.2em] text-yellow-300'>
            {game.code}
          </span>
        </div>
      </aside>
    </div>
  )
}

const Status = ({screen, offsetMs}: {screen: ScreenState; offsetMs: number}) => {
  const timer = useRoundTimer({round: screen.round, turn: null, offsetMs})
  const {round} = screen
  const status = screen.game.status
  if (status === 'ended')
    return <p className='font-title text-[4em] font-bold text-yellow-300'>{copy.screen.ended}</p>
  if (status === 'lobby' || !round)
    return (
      <p className='font-title text-[2.6em] font-bold text-yellow-300'>
        {status === 'lobby' ? copy.screen.draft : copy.screen.starting}
      </p>
    )
  return (
    <div className='flex items-baseline gap-[0.8em]'>
      <span className='font-title text-[2.6em] font-bold'>
        {copy.screen.round} {round.n}
      </span>
      {timer.roundRemainingMs !== null && (
        <span className='font-mono text-[4.4em] leading-none text-yellow-300 tabular-nums'>
          {formatClock(timer.roundRemainingMs)}
        </span>
      )}
    </div>
  )
}

export const SddScreen = () => {
  const [code] = useState(() =>
    readPairCode(new URLSearchParams(location.search).get('code') ?? '')
  )
  return (
    <div className='w-full text-[clamp(14px,1.9vh,24px)]'>
      {code ? <Board code={code} /> : <p className='p-[10vh] text-[2em]'>{copy.screen.noCode}</p>}
    </div>
  )
}
