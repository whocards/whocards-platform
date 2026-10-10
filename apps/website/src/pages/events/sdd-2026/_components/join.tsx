import type {GameLanguage, JoinInput} from '@whocards/game'
import {gameLanguageSchema, joinInputSchema, playerCopyFor, readPairCode} from '@whocards/game'
import type {GameError} from '@whocards/game/hooks'
import {useState} from 'react'

import {cn} from '~utils/cn'

import {noticeText} from './notices'
import {Button, inputClass, Notice, Screen} from './ui'

type JoinProps = {
  initialCode: string
  onJoin: (input: JoinInput, records: boolean) => Promise<GameError | null>
}

export const Join = ({initialCode, onJoin}: JoinProps) => {
  const [step, setStep] = useState<'details' | 'consent'>('details')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<GameLanguage>('en')
  const [code, setCode] = useState(initialCode)
  const [transcript, setTranscript] = useState(true)
  const [recap, setRecap] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<GameError | null>(null)
  const copy = playerCopyFor(language)

  const input = (records: boolean): JoinInput => ({
    code,
    name,
    language,
    email: recap && email.trim() ? email.trim() : undefined,
    consentTranscript: records,
    consentRecap: recap,
  })
  const detailsReady = name.trim() !== '' && readPairCode(code) !== null
  const consentReady =
    joinInputSchema.safeParse(input(transcript)).success && (!recap || email.trim() !== '')

  const submit = async (records: boolean) => {
    setBusy(true)
    const result = await onJoin(input(records), records)
    setBusy(false)
    setFailure(result)
    if (result?.refusal === 'unknown_game') setStep('details')
  }

  if (step === 'details')
    return (
      <Screen title={copy.join.title}>
        <form
          className='flex w-full flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault()
            if (detailsReady) setStep('consent')
          }}
        >
          <label className='flex flex-col gap-1'>
            <span>{copy.join.name}</span>
            <input
              className={inputClass}
              value={name}
              maxLength={40}
              autoComplete='off'
              placeholder={copy.join.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className='flex flex-col gap-1'>
            <legend className='mb-1'>{copy.join.language}</legend>
            <div className='grid grid-cols-2 gap-2'>
              {gameLanguageSchema.options.map((option) => (
                <button
                  key={option}
                  type='button'
                  aria-pressed={language === option}
                  className={cn(
                    'h-12 rounded-full border text-lg',
                    language === option
                      ? 'bg-darkest text-primary-light border-darkest'
                      : 'border-darkest/20'
                  )}
                  onClick={() => setLanguage(option)}
                >
                  {copy.join.languages[option]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className='flex flex-col gap-1'>
            <span>{copy.join.code}</span>
            <input
              className={cn(inputClass, 'font-mono uppercase tracking-widest')}
              value={code}
              maxLength={8}
              autoCapitalize='characters'
              autoComplete='off'
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          {failure && <Notice>{noticeText(language, failure)}</Notice>}
          <Button type='submit' disabled={!detailsReady}>
            {copy.join.next}
          </Button>
        </form>
      </Screen>
    )

  return (
    <Screen title={copy.consent.title}>
      <label className='flex w-full items-start gap-3'>
        <input
          type='checkbox'
          className='checkbox mt-1'
          checked={transcript}
          onChange={(event) => setTranscript(event.target.checked)}
        />
        <span>
          {copy.consent.transcript}
          <span className='text-mutedOnLight block text-sm'>{copy.consent.transcriptHint}</span>
        </span>
      </label>
      <label className='flex w-full items-start gap-3'>
        <input
          type='checkbox'
          className='checkbox mt-1'
          checked={recap}
          onChange={(event) => setRecap(event.target.checked)}
        />
        <span>{copy.consent.recap}</span>
      </label>
      {recap && (
        <label className='flex w-full flex-col gap-1'>
          <span>{copy.consent.email}</span>
          <input
            type='email'
            className={inputClass}
            value={email}
            autoComplete='email'
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      )}
      <Privacy language={language} />
      {failure && <Notice>{noticeText(language, failure)}</Notice>}
      <Button disabled={busy || !consentReady} onClick={() => void submit(transcript)}>
        {copy.consent.play}
      </Button>
      {transcript && (
        <Button
          variant='ghost'
          disabled={busy || !joinInputSchema.safeParse(input(false)).success}
          onClick={() => void submit(false)}
        >
          {copy.consent.decline}
        </Button>
      )}
      <button type='button' className='underline' onClick={() => setStep('details')}>
        {copy.consent.back}
      </button>
    </Screen>
  )
}

const Privacy = ({language}: {language: GameLanguage}) => {
  const {privacy} = playerCopyFor(language)
  return (
    <section className='w-full rounded-2xl bg-white/60 px-4 py-3 text-sm'>
      <h2 className='font-semibold'>{privacy.title}</h2>
      <ul className='mt-2 flex list-disc flex-col gap-1 pl-4'>
        {privacy.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
