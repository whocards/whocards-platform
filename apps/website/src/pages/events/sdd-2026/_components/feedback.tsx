import type {GameLanguage} from '@whocards/game'
import {playerCopyFor} from '@whocards/game'
import type {GameSession} from '@whocards/game/hooks'
import {useState} from 'react'

import {cn} from '~utils/cn'

import {noticeText} from './notices'
import {Button, Notice, Screen} from './ui'

const RATINGS = [1, 2, 3, 4, 5] as const

export const Feedback = ({language, act}: {language: GameLanguage; act: GameSession['act']}) => {
  const copy = playerCopyFor(language)
  const [rating, setRating] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'open' | 'sending' | 'sent'>('open')
  const [notice, setNotice] = useState<string | null>(null)

  if (status === 'sent') return <Screen title={copy.feedback.thanks}>{null}</Screen>

  const send = async () => {
    if (rating === null) return
    setStatus('sending')
    const failure = await act((client) =>
      client.feedback({rating, text: text.trim() ? text.trim() : undefined})
    )
    setNotice(failure ? noticeText(language, failure) : null)
    setStatus(failure ? 'open' : 'sent')
  }

  return (
    <Screen title={copy.feedback.title}>
      <fieldset className='w-full'>
        <legend className='mb-2'>{copy.feedback.rating}</legend>
        <div className='grid grid-cols-5 gap-2'>
          {RATINGS.map((value) => (
            <button
              key={value}
              type='button'
              aria-pressed={rating === value}
              className={cn(
                'h-14 rounded-2xl border text-xl',
                rating === value ? 'bg-darkest text-primary-light' : 'border-darkest/20'
              )}
              onClick={() => setRating(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <label className='flex w-full flex-col gap-1'>
        <span>{copy.feedback.text}</span>
        <textarea
          className='textarea bg-white text-darkest border-darkest/20 min-h-32 w-full rounded-2xl text-lg'
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {notice && <Notice>{notice}</Notice>}
      <Button disabled={rating === null || status === 'sending'} onClick={() => void send()}>
        {copy.feedback.send}
      </Button>
    </Screen>
  )
}
