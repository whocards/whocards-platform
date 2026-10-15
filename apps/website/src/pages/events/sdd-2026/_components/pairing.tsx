import type {PlayerState} from '@whocards/game'
import {copyFor, playerCopyFor, readPairCode} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useEffect, useRef, useState} from 'react'

import {createVideoScanner} from '~lib/game/scanner'
import {cn} from '~utils/cn'

import {noticeText} from './notices'
import {Button, inputClass, Notice, QrCode, Screen} from './ui'

type PairingProps = {state: PlayerState; act: GameSession['act']}

export const Pairing = ({state, act}: PairingProps) => {
  const {language, pairCode} = state.me
  const copy = playerCopyFor(language)
  const [typed, setTyped] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const pairing = useRef(false)

  const pair = async (raw: string) => {
    const partnerCode = readPairCode(raw)
    if (!partnerCode) {
      setMessage(copy.pairing.notACode)
      return
    }
    if (pairing.current) return
    pairing.current = true
    setBusy(true)
    const failure = await act((client) => client.pair(partnerCode))
    pairing.current = false
    setBusy(false)
    setMessage(failure ? noticeText(language, failure) : null)
  }
  const pairRef = useRef(pair)
  useEffect(() => {
    pairRef.current = pair
  })

  useEffect(() => {
    if (!scanning || !video.current) return undefined
    const scanner = createVideoScanner(video.current)
    scanner
      .start((code) => {
        setScanning(false)
        void pairRef.current(code)
      })
      .catch(() => {
        setScanning(false)
        setMessage(copy.pairing.cameraOff)
      })
    return () => void scanner.stop()
  }, [scanning, copy.pairing.cameraOff])

  return (
    <Screen>
      <div className='bg-background/80 flex w-full flex-col items-center gap-3 rounded-3xl border border-white/10 p-5 shadow-2xl shadow-black/40 backdrop-blur-md'>
        <span className='text-gray-dark'>{copy.pairing.myCode}</span>
        <QrCode value={pairCode} className='w-56' />
        <span className='font-mono text-4xl font-semibold tracking-[0.3em] text-yellow-300'>
          {pairCode}
        </span>
      </div>
      <video
        ref={video}
        muted
        playsInline
        className={cn(
          'aspect-square w-full rounded-2xl bg-black object-cover',
          !scanning && 'hidden'
        )}
      />
      <Button variant={scanning ? 'ghost' : 'primary'} onClick={() => setScanning((on) => !on)}>
        {scanning ? copy.pairing.stopScan : copy.pairing.scan}
      </Button>
      <form
        className='flex w-full flex-col gap-2'
        onSubmit={(event) => {
          event.preventDefault()
          void pair(typed)
        }}
      >
        <label className='flex flex-col gap-1'>
          <span className='text-gray-lighter'>{copy.pairing.typeCode}</span>
          <input
            className={cn(inputClass, 'font-mono uppercase tracking-widest')}
            value={typed}
            maxLength={8}
            autoCapitalize='characters'
            autoComplete='off'
            placeholder={copy.pairing.codePlaceholder}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <Button type='submit' variant='ghost' pending={busy} disabled={typed.trim() === ''}>
          {copyFor(language).actions.pair}
        </Button>
      </form>
      {message && <Notice onDismiss={() => setMessage(null)}>{message}</Notice>}
    </Screen>
  )
}
