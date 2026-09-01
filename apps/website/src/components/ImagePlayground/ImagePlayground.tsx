import {useState} from 'react'
import questions from '~data/questions.json'
import {PRINT_LANGUAGES} from '~server/print/params'
import {PHYSICAL_LAYOUTS} from '~server/print/presets'
import type {LayoutId} from '~server/print/presets'
import type {Language, QuestionId} from '~types'
import {LANG_KEYS, LANGUAGES} from '~utils'

/**
 * Dev-only Image Playground (issue #177) — renders every programmatically
 * generated image (Share Card og/story/post, print presets) with pickable
 * question/language/size, URL-param overrides for the existing design knobs,
 * side-by-side comparison, and the two owner-requested exploratory toggles
 * (cardOutline, theme). Never shipped: this component is only ever mounted
 * from src/pages/dev/image-playground.astro, which 404s outside `astro dev`
 * (see that file and src/pages/api/dev/image-playground/card.png.ts for the
 * gating — this component itself has no gate of its own).
 *
 * Deliberately duplicates a couple of tiny playground-only constants
 * (CARD_SIZE_OPTIONS below) instead of importing CARD_SIZES from
 * ~server/card-image: that module pulls in Satori/resvg/node:fs, which are
 * not safe to bundle into a client React island. The print side (languages,
 * presets) has no such problem — ~server/print/params and
 * ~server/print/presets are pure geometry/data with no Node-only deps, the
 * same modules ~components/Print.tsx already imports client-side — so those
 * are reused directly rather than duplicated.
 */

type CardSizeKey = 'og' | 'story' | 'post'

// Mirrors the key set (not the design values) of CARD_SIZES in
// ~server/card-image.ts — update this list if a new Share Card size is ever
// added there. Labels include the pixel dimensions for reference only.
const CARD_SIZE_OPTIONS: {key: CardSizeKey; label: string}[] = [
  {key: 'og', label: 'OG · 1200×630'},
  {key: 'story', label: 'Story · 1080×1920'},
  {key: 'post', label: 'Post · 1080×1350'},
]

const QUESTION_IDS = Object.keys(questions).toSorted(
  (a, b) => Number(a) - Number(b)
) as QuestionId[]

type VerticalAlign = 'flex-start' | 'center'
type RtlJustify = 'flex-start' | 'flex-end'
type Theme = 'light' | 'dark'

type CardVariant = {
  key: string
  id: QuestionId
  language: Language
  size: CardSizeKey
  padding: number | ''
  wordmarkScale: number | ''
  fontScale: number | ''
  verticalAlign: VerticalAlign | ''
  rtlJustify: RtlJustify | ''
  cardOutline: boolean
  theme: Theme
}

let variantCounter = 0
const nextVariantKey = (): string => `variant-${(variantCounter += 1)}`

const defaultVariant = (overrides: Partial<CardVariant> = {}): CardVariant => ({
  key: nextVariantKey(),
  id: '1',
  language: 'en',
  size: 'og',
  padding: '',
  wordmarkScale: '',
  fontScale: '',
  verticalAlign: '',
  rtlJustify: '',
  cardOutline: false,
  theme: 'dark',
  ...overrides,
})

/** Builds the query string for the dev-only param-accepting card endpoint. */
const buildCardPlaygroundUrl = (variant: CardVariant): string => {
  const params = new URLSearchParams({
    language: variant.language,
    id: variant.id,
    size: variant.size,
    cardOutline: String(variant.cardOutline),
    theme: variant.theme,
  })
  if (variant.padding !== '') params.set('padding', String(variant.padding))
  if (variant.wordmarkScale !== '') params.set('wordmarkScale', String(variant.wordmarkScale))
  if (variant.fontScale !== '') params.set('fontScale', String(variant.fontScale))
  if (variant.verticalAlign !== '') params.set('verticalAlign', variant.verticalAlign)
  if (variant.rtlJustify !== '') params.set('rtlJustify', variant.rtlJustify)
  return `/api/dev/image-playground/card.png?${params.toString()}`
}

const SECTION_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-[0.16em] text-primary-light'
const LABEL_CLASS = 'flex flex-col gap-1 text-xs text-slate-300'
const INPUT_CLASS =
  'w-full rounded-md border border-white/20 bg-black/20 px-2 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light'

export function ImagePlayground() {
  return (
    <div className='flex flex-col gap-10'>
      <div className='flex flex-col gap-1.5'>
        <h1 className='text-gradient font-title text-3xl font-extrabold tracking-tight text-white uppercase'>
          Image Playground
        </h1>
        <p className='max-w-2xl text-sm text-pretty text-slate-300'>
          Dev-only (issue #177). Renders Share Cards and print presets against the real renderers.
          Card variants below hit a param-accepting dev endpoint — production <code>/og</code>/
          <code>/share-card</code> routes are untouched.
        </p>
      </div>

      <ShareCardPlayground />
      <PrintPlayground />
    </div>
  )
}

function ShareCardPlayground() {
  const [variants, setVariants] = useState<CardVariant[]>(() => [
    defaultVariant({size: 'og'}),
    defaultVariant({size: 'story'}),
    defaultVariant({size: 'post'}),
  ])

  const updateVariant = (key: string, patch: Partial<CardVariant>) => {
    setVariants((prev) => prev.map((v) => (v.key === key ? {...v, ...patch} : v)))
  }

  const duplicateVariant = (key: string) => {
    setVariants((prev) => {
      const source = prev.find((v) => v.key === key)
      if (!source) return prev
      return [...prev, {...source, key: nextVariantKey()}]
    })
  }

  const removeVariant = (key: string) => {
    setVariants((prev) => (prev.length > 1 ? prev.filter((v) => v.key !== key) : prev))
  }

  const addBlankVariant = () => setVariants((prev) => [...prev, defaultVariant()])

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <h2 className={SECTION_LABEL_CLASS}>Share cards (og / story / post)</h2>
        <button type='button' className='btn btn-outline btn-sm' onClick={addBlankVariant}>
          + Add variant
        </button>
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {variants.map((variant) => (
          <CardVariantCard
            key={variant.key}
            variant={variant}
            onChange={(patch) => updateVariant(variant.key, patch)}
            onDuplicate={() => duplicateVariant(variant.key)}
            onRemove={() => removeVariant(variant.key)}
            removable={variants.length > 1}
          />
        ))}
      </div>
    </section>
  )
}

type CardVariantCardProps = {
  variant: CardVariant
  onChange: (patch: Partial<CardVariant>) => void
  onDuplicate: () => void
  onRemove: () => void
  removable: boolean
}

function CardVariantCard({
  variant,
  onChange,
  onDuplicate,
  onRemove,
  removable,
}: CardVariantCardProps) {
  const imageUrl = buildCardPlaygroundUrl(variant)

  return (
    <div className='flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4'>
      <div className='overflow-hidden rounded-lg border border-white/10 bg-black/30'>
        {/* key forces a fresh <img> per param change instead of the browser
            reusing a stale decoded frame for the same element. */}
        <img key={imageUrl} src={imageUrl} alt='' className='block w-full' loading='lazy' />
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <label className={LABEL_CLASS}>
          Question id
          <select
            className={INPUT_CLASS}
            value={variant.id}
            onChange={(e) => onChange({id: e.target.value as QuestionId})}
          >
            {QUESTION_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Language
          <select
            className={INPUT_CLASS}
            value={variant.language}
            onChange={(e) => onChange({language: e.target.value as Language})}
          >
            {LANG_KEYS.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGES[lang as Language]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Size
          <select
            className={INPUT_CLASS}
            value={variant.size}
            onChange={(e) => onChange({size: e.target.value as CardSizeKey})}
          >
            {CARD_SIZE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Theme (exploratory)
          <select
            className={INPUT_CLASS}
            value={variant.theme}
            onChange={(e) => onChange({theme: e.target.value as Theme})}
          >
            <option value='dark'>Dark (shipped)</option>
            <option value='light'>Light (exploratory)</option>
          </select>
        </label>

        <label className={LABEL_CLASS}>
          Padding (px)
          <input
            type='number'
            className={INPUT_CLASS}
            placeholder='default'
            value={variant.padding}
            onChange={(e) =>
              onChange({padding: e.target.value === '' ? '' : e.target.valueAsNumber})
            }
          />
        </label>
        <label className={LABEL_CLASS}>
          Wordmark scale
          <input
            type='number'
            step={0.05}
            className={INPUT_CLASS}
            placeholder='default'
            value={variant.wordmarkScale}
            onChange={(e) =>
              onChange({wordmarkScale: e.target.value === '' ? '' : e.target.valueAsNumber})
            }
          />
        </label>
        <label className={LABEL_CLASS}>
          Font scale
          <input
            type='number'
            step={0.05}
            className={INPUT_CLASS}
            placeholder='default'
            value={variant.fontScale}
            onChange={(e) =>
              onChange({fontScale: e.target.value === '' ? '' : e.target.valueAsNumber})
            }
          />
        </label>
        <label className={LABEL_CLASS}>
          Vertical align
          <select
            className={INPUT_CLASS}
            value={variant.verticalAlign}
            onChange={(e) => onChange({verticalAlign: e.target.value as VerticalAlign | ''})}
          >
            <option value=''>default</option>
            <option value='flex-start'>flex-start</option>
            <option value='center'>center</option>
          </select>
        </label>
        <label className={LABEL_CLASS}>
          RTL justify
          <select
            className={INPUT_CLASS}
            value={variant.rtlJustify}
            onChange={(e) => onChange({rtlJustify: e.target.value as RtlJustify | ''})}
          >
            <option value=''>default</option>
            <option value='flex-start'>flex-start</option>
            <option value='flex-end'>flex-end</option>
          </select>
        </label>
        <label className='flex items-center gap-2 text-xs text-slate-300'>
          <input
            type='checkbox'
            checked={variant.cardOutline}
            onChange={(e) => onChange({cardOutline: e.target.checked})}
          />
          Card outline (exploratory)
        </label>
      </div>

      <div className='flex gap-2'>
        <button type='button' className='btn btn-outline btn-xs' onClick={onDuplicate}>
          Duplicate
        </button>
        {removable && (
          <button type='button' className='btn btn-outline btn-xs' onClick={onRemove}>
            Remove
          </button>
        )}
        <a
          className='btn btn-outline btn-xs ml-auto'
          href={imageUrl}
          target='_blank'
          rel='noreferrer'
        >
          Open PNG
        </a>
      </div>
    </div>
  )
}

function PrintPlayground() {
  const presetIds = Object.keys(PHYSICAL_LAYOUTS) as LayoutId[]
  const [preset, setPreset] = useState<LayoutId>(presetIds[0])
  const [lang, setLang] = useState<Language>('en')

  const supported = PHYSICAL_LAYOUTS[preset]?.supported ?? false
  const printUrl = `/api/print.pdf?deck=library&lang=${lang}&preset=${preset}`

  return (
    <section className='flex flex-col gap-3'>
      <h2 className={SECTION_LABEL_CLASS}>Print presets</h2>
      <p className='max-w-2xl text-xs text-pretty text-slate-400'>
        Reuses the real production endpoint (<code>/api/print.pdf</code>) directly — it already
        accepts <code>lang</code>/<code>preset</code>/<code>offsetX</code>/<code>offsetY</code> as
        query params, so no dev-only print route was needed.
      </p>

      <div className='flex flex-wrap items-end gap-3'>
        <label className={LABEL_CLASS}>
          Preset
          <select
            className={INPUT_CLASS}
            value={preset}
            onChange={(e) => setPreset(e.target.value as LayoutId)}
          >
            {presetIds.map((id) => (
              <option key={id} value={id}>
                {PHYSICAL_LAYOUTS[id].label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Language
          <select
            className={INPUT_CLASS}
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
          >
            {PRINT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGES[code as Language] ?? code}
              </option>
            ))}
          </select>
        </label>
        <a className='btn btn-outline btn-sm' href={printUrl} target='_blank' rel='noreferrer'>
          Open PDF
        </a>
      </div>

      {!supported && (
        <p className='text-xs text-pretty text-amber-300'>
          This preset isn&apos;t calibrated yet (<code>supported: false</code>) — the endpoint will
          400.
        </p>
      )}

      {supported && (
        // oxlint-disable-next-line react/iframe-missing-sandbox -- dev-only playground previewing our own same-origin print route; sandboxing would break its scripts
        <iframe
          key={printUrl}
          title='Print preset preview'
          src={printUrl}
          className='h-[600px] w-full rounded-lg border border-white/10 bg-white'
        />
      )}
    </section>
  )
}
