import {Icon as _Icon} from '@iconify-icon/react'
import type {IconifyIconProps} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useEffect, useMemo, useRef} from 'react'
import type {ComponentType, PropsWithChildren} from 'react'
import {idsStore} from '~stores/Game.store'
import {$langStore, setLang} from '~stores/Language.store'
import type {Language} from '~types'
import {LANG_KEYS, LANGUAGES, cn, getCurrentLanguage, isPrintPage} from '~utils'
import {getCurrentQuestionUrl} from '~utils/urls'
import {getDisabledLanguageCodes} from '~components/print/print-ui'
import {PRINT_LANGUAGES} from '~server/print/params'

// @types/react 18 doesn't include bigint in ReactNode, but iconify-icon's
// ForwardRefExoticComponent return type does. Double-cast via unknown is type-only,
// no runtime effect.
const Icon = _Icon as unknown as ComponentType<IconifyIconProps>

// TODO get current language perhaps from url, query param, or persistant store
export const LanguageSwitcher = () => {
  const shouldUseStore = isPrintPage()
  const store = useStore($langStore)
  const ref = useRef<HTMLDialogElement>(null)

  // On the print page, he/zh/jp aren't renderable by the PDF endpoint yet (#41) — show
  // them as disabled "coming soon" tiles rather than hiding them. Elsewhere (site nav)
  // every language stays enabled.
  const disabledCodes = useMemo(
    () => new Set(shouldUseStore ? getDisabledLanguageCodes(LANG_KEYS, PRINT_LANGUAGES) : []),
    [shouldUseStore]
  )

  useEffect(() => {
    // capture the node so the cleanup removes the listener from the same element
    // (not a possibly-changed ref.current), with a stable handler and a one-shot mount
    const dialog = ref.current
    if (!dialog) return

    const handleBackdropClick = (event: MouseEvent) => {
      if (dialog === event.target) window.langsModal.close()
    }

    dialog.addEventListener('click', handleBackdropClick)
    return () => dialog.removeEventListener('click', handleBackdropClick)
  }, [])

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
          {Object.entries(LANGUAGES).map(([key, name]) =>
            disabledCodes.has(key) ? (
              <div
                key={key}
                className='flex h-16 flex-col justify-center px-4 opacity-50'
                aria-disabled='true'
              >
                {name}
                <span className='text-sm'>coming soon&hellip;</span>
              </div>
            ) : (
              <QuestionLink
                key={key}
                lang={key as Language}
                selected={key === store.lang}
                useButton={shouldUseStore}
              >
                {name}
                {key === store.lang && <Icon icon='zondicons:checkmark' className='ml-2 h-4 w-4' />}
              </QuestionLink>
            )
          )}
        </section>
      </form>
    </dialog>
  )
}

type QuestionLinkProps = {
  lang: Language
  selected: boolean
  useButton: boolean
} & PropsWithChildren<unknown>

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
      href={getCurrentQuestionUrl(props.lang, idsStore.get().current)}
      className={cn('who-modal btn-ghost flex h-16 w-full items-center px-4', {
        'active-language text-primary-dark': props.selected,
      })}
    >
      {props.children}
    </a>
  )
}
