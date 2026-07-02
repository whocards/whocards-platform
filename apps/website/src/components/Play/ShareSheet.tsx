import {useEffect, useRef, useState} from 'react'
import {logWarn} from '@whocards/observability'
import {EVENTS, track} from '@whocards/observability/events'
import type {ShareImageFormat} from './share-ui'
import {
  buildQuestionShareUrl,
  buildShareCardFilename,
  buildShareCardUrl,
  getImageRowLabel,
  supportsFileShare,
} from './share-ui'

// Hoisted inline JSX <svg> constants — same rationale as Play.tsx's Prev/NextArrowIcon:
// astro-icon's <Icon> can't render from a React island, and these are one-off glyphs
// (rendering-hoist-jsx keeps them from being re-created every render).
const CloseIcon = (
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' className='h-5 w-5'>
    <path
      fill='currentColor'
      d='M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
    />
  </svg>
)

type RowState = 'idle' | 'busy' | 'error'

export type ShareSheetProps = {
  open: boolean
  onClose: () => void
  /** Recorded on the share_completed event so both surfaces roll into one metric. */
  deckId: string
  game: string
  language: string
  questionId: string
  questionText: string
  /**
   * Whether the deck is Pool-backed (`source.kind === 'library'`), computed by
   * the page from the deck registry and threaded through Play.tsx's
   * `isPoolBacked` prop (see `share-ui.ts`'s `supportsShareImages`). The
   * on-demand Share Card endpoint only knows Pool ids (ADR-0007), so decks that
   * carry inline questions (e.g. ai-at-work, hajnalig) hide the Story/Post rows
   * and offer Share link only.
   */
  supportsShareImages: boolean
}

/**
 * The per-question Share sheet (#155): "Share link" (Web Share API, clipboard-copy
 * fallback) plus "Story image" / "Post image" (OS file-share where supported,
 * download otherwise — decided once at mount via `supportsFileShare`, never at
 * click time, so the row label is never dishonest about what tapping it will do).
 *
 * A `<dialog>` gives native focus-trap + Escape-to-close + backdrop semantics for
 * free, same pattern as `Modal/LanguageSwitcher.tsx`.
 */
export const ShareSheet = ({
  open,
  onClose,
  deckId,
  game,
  language,
  questionId,
  questionText,
  supportsShareImages,
}: ShareSheetProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const [imageState, setImageState] = useState<Record<ShareImageFormat, RowState>>({
    story: 'idle',
    post: 'idle',
  })

  // Decided once per mount, not per click (#155's "honest label" requirement) — the
  // sheet only exists while a question is on screen, so re-mounting on question
  // change is fine and keeps this a plain lazy useState rather than an effect.
  const [canShareFiles] = useState(() =>
    supportsFileShare(typeof navigator === 'undefined' ? undefined : navigator)
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setLinkCopied(false)
      setLinkError(false)
      setImageState({story: 'idle', post: 'idle'})
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    // Fires on Escape and on `dialog.close()` alike — keeps the parent's `open`
    // state in sync regardless of how the dialog closed.
    const handleClose = () => onClose()
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleBackdropClick)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleBackdropClick)
    }
  }, [onClose])

  const emitShareCompleted = (format: 'link' | ShareImageFormat) => {
    track({
      name: EVENTS.SHARE_COMPLETED,
      props: {deck_id: deckId, question_id: questionId, language, game, format},
    })
  }

  const handleShareLink = async () => {
    const url = buildQuestionShareUrl(window.location.origin, deckId, language, questionId)
    setLinkError(false)

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({title: 'WhoCards', text: questionText, url})
        emitShareCompleted('link')
      } catch (error) {
        // AbortError = the player closed the OS sheet without picking a target —
        // not a failure, and not a completed share (CONTEXT.md: share is never a
        // game event, but it IS only a growth event when it actually happens).
        if ((error as Error)?.name !== 'AbortError') {
          logWarn('share-sheet: navigator.share failed', error)
        }
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      emitShareCompleted('link')
    } catch (error) {
      logWarn('share-sheet: clipboard copy failed', error)
      setLinkError(true)
    }
  }

  const handleImageRow = async (format: ShareImageFormat) => {
    setImageState((state) => ({...state, [format]: 'busy'}))
    try {
      const res = await fetch(buildShareCardUrl(format, language, questionId))
      if (!res.ok) throw new Error(`share-card fetch failed with status ${res.status}`)
      const blob = await res.blob()
      const filename = buildShareCardFilename(format, language, questionId)

      if (canShareFiles) {
        const file = new File([blob], filename, {type: 'image/png'})
        await navigator.share({files: [file]})
      } else {
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = filename
        document.body.append(link)
        link.click()
        link.remove()
        // Deferred: revoking synchronously can race the browser's own read of the
        // blob URL to start the download in some engines (WebKit in particular).
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      }

      setImageState((state) => ({...state, [format]: 'idle'}))
      emitShareCompleted(format)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        // player closed the OS sheet without picking a target — not a failure
        setImageState((state) => ({...state, [format]: 'idle'}))
        return
      }
      logWarn('share-sheet: image share/download failed', error, {format})
      setImageState((state) => ({...state, [format]: 'error'}))
    }
  }

  const close = () => ref.current?.close()

  const imageRow = (format: ShareImageFormat) => {
    const state = imageState[format]
    return (
      <div key={format} className='flex flex-col'>
        <button
          type='button'
          onClick={() => handleImageRow(format)}
          disabled={state === 'busy'}
          aria-busy={state === 'busy'}
          className='who-modal btn-ghost flex w-full items-center px-4 py-3 text-left disabled:opacity-60'
        >
          {state === 'busy' ? 'Preparing image…' : getImageRowLabel(format, canShareFiles)}
        </button>
        {state === 'error' && (
          <p role='alert' className='text-red px-4 pb-2 text-sm'>
            Couldn&apos;t load that image — try again.
          </p>
        )}
      </div>
    )
  }

  return (
    <dialog
      ref={ref}
      aria-label='share this question'
      className='modal modal-bottom sm:modal-middle'
    >
      <div className='modal-box max-w-sm bg-white p-0 text-darker'>
        <div className='flex items-center justify-between px-4 pb-2 pt-4'>
          <h2 className='text-lg font-bold'>Share</h2>
          <button
            type='button'
            onClick={close}
            aria-label='close share sheet'
            className='btn btn-square btn-ghost btn-sm'
          >
            {CloseIcon}
          </button>
        </div>
        <div className='flex flex-col pb-4'>
          <button
            type='button'
            onClick={handleShareLink}
            className='who-modal btn-ghost flex w-full items-center px-4 py-3 text-left'
          >
            {linkCopied ? 'Link copied!' : 'Share link'}
          </button>
          {linkError && (
            <p role='alert' className='text-red px-4 pb-2 text-sm'>
              Couldn&apos;t copy the link — try again.
            </p>
          )}
          {supportsShareImages && (
            <>
              {imageRow('story')}
              {imageRow('post')}
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
