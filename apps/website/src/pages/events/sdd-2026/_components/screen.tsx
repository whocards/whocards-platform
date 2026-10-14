import type {ScreenState} from '@whocards/game'
import {clockOffset, playerCopyFor, readPairCode} from '@whocards/game'
import {useRoundTimer} from '@whocards/game/hooks'
import {useEffect, useMemo, useState} from 'react'

import {createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
import {joinPath} from '~lib/game/links'
import {createTokenStore} from '~lib/game/token-store'
import {createWakeLock} from '~lib/game/wake-lock'

import {QrCode} from './ui'

const POLL_MS = 3000
const copy = playerCopyFor('en')

const Board = ({code}: {code: string}) => {
  const api = useMemo(() => createGameApi(code, createTokenStore(null)), [code])
  const [screen, setScreen] = useState<ScreenState | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const timer = useRoundTimer({round: screen?.round ?? null, turn: null, offsetMs})
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

  const round = screen?.round ?? null
  const status = screen?.game.status
  const open = status === 'live'

  return (
    <div className='grid min-h-screen w-full grid-cols-1 items-center gap-12 p-12 lg:grid-cols-2'>
      <div className='flex flex-col items-center gap-6'>
        {status === 'lobby' ? (
          <span className='text-6xl'>{copy.screen.draft}</span>
        ) : (
          <>
            <span className='text-4xl'>{copy.screen.joinAt}</span>
            <QrCode value={joinUrl} className='w-[min(60vh,40vw)]' />
            <span className='font-mono text-8xl font-semibold tracking-[0.3em]'>{code}</span>
          </>
        )}
      </div>
      <div className='flex flex-col items-center gap-8 text-center'>
        {screen && (
          <div className='flex flex-col items-center gap-3'>
            <h1 className='font-title text-5xl'>{screen.game.title}</h1>
            {screen.game.organizer && (
              <p className='text-mutedOnLight text-3xl'>
                {copy.join.hostedBy} {screen.game.organizer}
              </p>
            )}
          </div>
        )}
        {status === 'ended' && <p className='text-6xl'>{copy.screen.ended}</p>}
        {open && !round && <p className='text-6xl'>{copy.screen.starting}</p>}
        {open && round && (
          <>
            <span className='text-5xl'>
              {copy.screen.round} {round.n}
            </span>
            {timer.roundRemainingMs !== null && (
              <span className='font-mono text-[12rem] leading-none tabular-nums'>
                {formatClock(timer.roundRemainingMs)}
              </span>
            )}
          </>
        )}
        {screen && (
          <dl className='grid grid-cols-4 gap-8 text-3xl'>
            {(['joined', 'paired', 'talking', 'done'] as const).map((key) => (
              <div key={key} className='flex flex-col'>
                <dt className='text-mutedOnLight order-2 text-2xl'>{copy.screen.counts[key]}</dt>
                <dd className='font-mono text-6xl'>{screen.counts[key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

export const SddScreen = () => {
  const [code] = useState(() =>
    readPairCode(new URLSearchParams(location.search).get('code') ?? '')
  )
  return code ? <Board code={code} /> : <p className='p-12 text-3xl'>{copy.screen.noCode}</p>
}
