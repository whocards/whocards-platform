import {Icon} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useEffect, useRef, type PropsWithChildren} from 'react'
import {$langStore, setLang} from '~stores/Language.store'
import type {Language} from '~types'
import {LANGUAGES, cn, getCurrentLanguage, getCurrentQuestionUrl, isPrintPage} from '~utils'

const comingSoon: string[] = []

// TODO get current language perhaps from url, query param, or persistant store
export const LanguageSwitcher = () => {
  const shouldUseStore = isPrintPage()
  const store = useStore($langStore)
  const ref = useRef<HTMLDialogElement>(null)

  const handleClose = (event: MouseEvent) => {
    if (ref && ref.current === event.target) {
      window.langsModal.close()
    }
  }

  useEffect(() => {
    if (!ref.current) return
    ref.current.addEventListener('click', handleClose)

    return () => {
      if (!ref.current) return
      ref.current.removeEventListener('click', handleClose)
    }
  }, [ref])

  useEffect(() => {
    setLang(getCurrentLanguage(window.location.pathname))
  }, [])

  const close = () => {
    if (!ref.current) return
    ref.current.close()
  }

  return (
    <dialog id='langsModal' className='modal' style={{padding: 0, border: 0}} ref={ref}>
      <form
        method='dialog'
        className='modal-box h-full w-full bg-white p-0 text-darker md:h-fit md:max-w-2xl md:rounded-lg phone-landscape:max-w-full'
      >
        <div className='flex h-16 items-center justify-between pl-4 pr-3'>
          <h2 className='text-2xl font-bold'>Choose your language</h2>
          <button onClick={close} className='btn btn-square btn-ghost' aria-label='close modal'>
            <Icon icon='ic:round-close' className='text-2xl' />
          </button>
        </div>
        <section
          className='grid grid-cols-1 overflow-y-auto pb-4 md:grid-flow-col md:grid-cols-3 md:grid-rows-5 md:pb-2'
          style={{maxHeight: 'calc(100vh - 4rem)'}}
        >
          {Object.entries(LANGUAGES).map(([key, name]) => (
            <QuestionLink
              key={key}
              lang={key as Language}
              selected={key === store.lang}
              useButton={shouldUseStore}
            >
              {name}
              {key === store.lang && <Icon icon='zondicons:checkmark' className='ml-2 h-4 w-4' />}
            </QuestionLink>
          ))}
          {comingSoon.map((newLang) => (
            <div className='flex h-16 flex-col justify-center px-4 opacity-50'>
              {newLang}
              <br />
              <span className='text-sm'>coming soon&hellip;</span>
            </div>
          ))}
        </section>
      </form>
    </dialog>
  )
}

interface QuestionLinkProps extends PropsWithChildren<unknown> {
  lang: Language
  selected: boolean
  useButton: boolean
}

const QuestionButton = (props: QuestionLinkProps) => {
  return (
    <button
      onClick={() => setLang(props.lang)}
      className={cn('who-modal btn-ghost flex h-16 w-full items-center px-4', {
        'active-language text-primary-dark': props.selected,
      })}
    >
      {props.children}
    </button>
  )
}

const QuestionLink = (props: QuestionLinkProps) => {
  if (props.useButton) {
    return <QuestionButton {...props} />
  }

  return (
    <a
      href={getCurrentQuestionUrl(props.lang)}
      className={cn('who-modal btn-ghost flex h-16 w-full items-center px-4', {
        'active-language text-primary-dark': props.selected,
      })}
    >
      {props.children}
    </a>
  )
}
