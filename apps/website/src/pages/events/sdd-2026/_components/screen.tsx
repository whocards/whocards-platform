import type {ScreenState} from '@whocards/game'
import {clockOffset, playerCopyFor, readPairCode} from '@whocards/game'
import {useRoundTimer} from '@whocards/game/hooks'
import {useEffect, useMemo, useState} from 'react'

import {createGameApi} from '~lib/game/client'
import {formatClock} from '~lib/game/format'
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
  const joinUrl = `${location.origin}/events/sdd-2026?code=${code}`

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
  const status = screen?.game.status ?? 'lobby'

  return (
    <div className='grid min-h-screen w-full grid-cols-1 items-center gap-12 p-12 lg:grid-cols-2'>
      <div className='flex flex-col items-center gap-6'>
        <span className='text-4xl'>{copy.screen.joinAt}</span>
        <QrCode value={joinUrl} className='w-[min(60vh,40vw)]' />
        <span className='font-mono text-8xl font-semibold tracking-[0.3em]'>{code}</span>
      </div>
      <div className='flex flex-col items-center gap-8 text-center'>
        {screen && <h1 className='font-title text-5xl'>{screen.game.title}</h1>}
        {status === 'ended' && <p className='text-6xl'>{copy.screen.ended}</p>}
        {status !== 'ended' && !round && <p className='text-6xl'>{copy.screen.lobby}</p>}
        {status !== 'ended' && round && (
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
