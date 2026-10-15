import type {PairCandidate, PairInput, PlayerState} from '@whocards/game'
import {copyFor, playerCopyFor, readPairCode} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useEffect, useRef, useState} from 'react'

import {createVideoScanner} from '~lib/game/scanner'
import {cn} from '~utils/cn'

import {noticeText} from './notices'
import {Button, inputClass, Notice, QrCode, Screen} from './ui'

type PairingProps = {
  state: PlayerState
  act: GameSession['act']
  /** Namesakes I could pair with, for the pick list after an ambiguous name. */
  candidates: (name: string) => Promise<PairCandidate[]>
  /** Shown above my code, e.g. "find a facilitator" or "you're on standby". */
  hint?: string
}

const joinedTime = (at: number) =>
  new Date(at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

export const Pairing = ({state, act, candidates, hint}: PairingProps) => {
  const {language, pairCode} = state.me
  const copy = playerCopyFor(language)
  const [typed, setTyped] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choices, setChoices] = useState<PairCandidate[]>([])
  const video = useRef<HTMLVideoElement>(null)
  const pairing = useRef(false)

  const send = async (input: PairInput, name?: string) => {
    if (pairing.current) return
    pairing.current = true
    setBusy(true)
    const failure = await act((client) => client.pair(input))
    const options =
      failure?.refusal === 'ambiguous_name' && name
        ? await candidates(name).catch((): PairCandidate[] => [])
        : []
    pairing.current = false
    setBusy(false)
    setChoices(options)
    setMessage(failure ? noticeText(language, failure) : null)
  }

  const pair = async (raw: string) => {
    const partnerCode = readPairCode(raw)
    if (!partnerCode) {
      setMessage(copy.pairing.notACode)
      return
    }
    await send({partnerCode})
  }
  const mixedLanguages = new Set(choices.map((c) => c.language)).size > 1
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
      {hint && <p className='text-center text-2xl'>{hint}</p>}
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
          const partner = typed.trim()
          if (partner) void send({partner}, partner)
        }}
      >
        <label className='flex flex-col gap-1'>
          <span className='text-gray-lighter'>{copy.pairing.typeCode}</span>
          <input
            className={inputClass}
            value={typed}
            maxLength={40}
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
      {choices.length > 0 && (
        <div className='flex w-full flex-col gap-2'>
          <span>{copy.pairing.pick}</span>
          {choices.map((choice) => (
            <Button
              key={choice.id}
              variant='ghost'
              disabled={busy}
              onClick={() => void send({partnerId: choice.id})}
            >
              {choice.name}
              <span className='text-gray-dark text-sm font-normal'>
                {[
                  mixedLanguages && copy.join.languages[choice.language],
                  `${copy.pairing.joined} ${joinedTime(choice.joinedAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Button>
          ))}
        </div>
      )}
    </Screen>
  )
}
