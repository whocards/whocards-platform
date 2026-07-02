import {Icon as _Icon} from '@iconify-icon/react'
import type {IconifyIconProps} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useState} from 'react'
import type {ComponentType} from 'react'
import {
  buildCalibrationDownloadUrl,
  buildPrintDownloadUrl,
  clampOffsetMm,
  getDefaultPresetId,
  layoutUpCount,
} from '~components/print/print-ui'
import {PRINT_LANGUAGES} from '~server/print/params'
import {PHYSICAL_LAYOUTS} from '~server/print/presets'
import type {LayoutId, PhysicalLayout} from '~server/print/presets'
import {
  $calibrationOffsets,
  getCalibrationOffset,
  setCalibrationOffset,
} from '~stores/CalibrationOffsets.store'
import {$langStore} from '~stores/Language.store'
import {LANGUAGES, cn} from '~utils'

// @types/react 18 doesn't include bigint in ReactNode, but iconify-icon's
// ForwardRefExoticComponent return type does. Double-cast via unknown is type-only,
// no runtime effect.
const Icon = _Icon as unknown as ComponentType<IconifyIconProps>

const PRESET_LAYOUTS = Object.values(PHYSICAL_LAYOUTS)

// Small uppercase eyebrow used for the section labels below the hero (matches the
// "What to do" / "Why this matters" labels on the android-testers page) — the page's
// h1 is the only element that keeps the display/font-title treatment (design review #19).
const SECTION_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-[0.16em] text-primary-light'

export function Print() {
  const store = useStore($langStore)
  const [preset, setPreset] = useState<LayoutId | undefined>(() =>
    getDefaultPresetId(PHYSICAL_LAYOUTS)
  )

  // Calibration nudge (#40) is persisted per preset — a printer's drift is a property
  // of that printer + sheet, not of any one visit — so switching presets recalls
  // whatever offset (if any) was dialed in for it last time.
  const calibrationOffsets = useStore($calibrationOffsets)
  const {offsetX, offsetY} = getCalibrationOffset(calibrationOffsets, preset)

  const langSupported = PRINT_LANGUAGES.includes(store.lang)
  const canDownload = Boolean(preset) && langSupported
  const downloadUrl = preset
    ? buildPrintDownloadUrl('library', store.lang, preset, offsetX, offsetY)
    : undefined
  const testPrintUrl = preset ? buildCalibrationDownloadUrl(preset, offsetX, offsetY) : undefined

  const updateOffset = (axis: 'offsetX' | 'offsetY', value: number) => {
    if (!preset) return
    const clamped = clampOffsetMm(value)
    setCalibrationOffset(preset, {
      offsetX: axis === 'offsetX' ? clamped : offsetX,
      offsetY: axis === 'offsetY' ? clamped : offsetY,
    })
  }

  return (
    <>
      <div className='flex flex-col items-center gap-1.5 text-center lg:gap-2'>
        <h1 className='text-gradient font-title text-balance text-4xl font-extrabold uppercase leading-tight tracking-tight text-white lg:text-5xl'>
          Print It Yourself
        </h1>
        <p className='text-pretty max-w-xl text-base text-slate-300'>
          Free, perfectly aligned PDFs for your precut business-card sheets.
        </p>
      </div>

      {/* Configurator: tiles (~2/3) + the action panel (~1/3) that holds every remaining
          control — on mobile this collapses to a single column, tiles first (design
          review #19: the whole flow must fit one lg+ viewport without scrolling). */}
      <div className='grid w-full grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start lg:gap-8'>
        <div className='lg:col-span-2'>
          <h2 className={SECTION_LABEL_CLASS}>Choose your sheet</h2>
          <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {PRESET_LAYOUTS.map((layout) => (
              <PresetTile
                key={layout.id}
                layout={layout}
                selected={layout.id === preset}
                onSelect={() => setPreset(layout.id)}
              />
            ))}
          </div>
        </div>

        <div className='flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-1'>
          <div className='flex flex-col gap-2'>
            <h2 className={SECTION_LABEL_CLASS}>Language</h2>
            <button
              className='border-primary-light flex h-11 w-full items-center justify-center rounded-lg border-2 px-3 font-bold tracking-wider'
              onClick={() => window.langsModal.showModal()}
            >
              <div className='flex-1 text-left'>{LANGUAGES[store.lang]}</div>
              <Icon
                aria-hidden='true'
                icon='majesticons:chevron-up'
                className='rotate-180 justify-self-end'
                height={24}
                width={24}
              />
            </button>
            {!langSupported && (
              <p className='text-pretty text-sm text-amber-300'>
                {LANGUAGES[store.lang]} printing is coming soon — pick another language to download.
              </p>
            )}
          </div>

          <AlignmentSection
            offsetX={offsetX}
            offsetY={offsetY}
            onChangeOffset={updateOffset}
            disabled={!preset}
          />

          <p className='text-pretty text-xs font-semibold text-amber-300'>
            Print at 100% — turn off &ldquo;Fit to page&rdquo;.
          </p>

          <div className='flex flex-col gap-2'>
            <a
              className={cn('btn btn-primary !w-full', {
                'btn-disabled pointer-events-none opacity-50': !canDownload,
              })}
              aria-disabled={!canDownload}
              href={downloadUrl}
            >
              Download
            </a>
            <a
              className={cn('btn btn-outline !w-full', {
                'btn-disabled pointer-events-none opacity-50': !preset,
              })}
              aria-disabled={!preset}
              href={testPrintUrl}
            >
              Test print
            </a>
          </div>
        </div>
      </div>
    </>
  )
}

type AlignmentSectionProps = {
  offsetX: number
  offsetY: number
  onChangeOffset: (axis: 'offsetX' | 'offsetY', value: number) => void
  disabled: boolean
}

// Compact alignment nudge (#40): the two inputs stay in the main flow (a printer's
// drift can ruin a whole precut sheet, so they need to stay reachable), but the full
// how-to copy — and what the Test print button actually produces — moves into a
// <details> disclosure rather than a title-attribute tooltip (design review #19).
function AlignmentSection({offsetX, offsetY, onChangeOffset, disabled}: AlignmentSectionProps) {
  return (
    <div className='flex flex-col gap-2'>
      <h2 className={SECTION_LABEL_CLASS}>Fine-tune alignment</h2>
      <div className='flex items-end gap-3'>
        <OffsetInput
          label='X (mm)'
          value={offsetX}
          disabled={disabled}
          onChange={(value) => onChangeOffset('offsetX', value)}
        />
        <OffsetInput
          label='Y (mm)'
          value={offsetY}
          disabled={disabled}
          onChange={(value) => onChangeOffset('offsetY', value)}
        />
      </div>
      <p className='text-pretty text-xs text-slate-400'>Cards off by a hair? Nudge X/Y here.</p>
      <details className='text-xs text-slate-400'>
        <summary className='cursor-pointer font-semibold text-slate-300 hover:text-primary-light'>
          How does alignment &amp; test print work?
        </summary>
        <p className='text-pretty mt-2 leading-relaxed'>
          Test print downloads a single plain-paper page with card outlines and corner marks. Print
          it at 100% (no &ldquo;Fit to page&rdquo;), hold it over your precut sheet or up to the
          light, and nudge X/Y here in mm until the outlines land on the perforations — the offset
          carries over when you download your full deck.
        </p>
      </details>
    </div>
  )
}

type OffsetInputProps = {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

function OffsetInput({label, value, onChange, disabled}: OffsetInputProps) {
  return (
    <label className='flex flex-col gap-1 text-xs text-slate-300'>
      {label}
      <input
        type='number'
        inputMode='decimal'
        step={0.5}
        min={-20}
        max={20}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className='border-primary-light disabled:opacity-40 w-20 rounded-lg border-2 bg-transparent px-2 py-1.5 text-center text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light'
      />
    </label>
  )
}

type PresetTileProps = {
  layout: PhysicalLayout
  selected: boolean
  onSelect: () => void
}

function PresetTile({layout, selected, onSelect}: PresetTileProps) {
  const disabled = !layout.supported

  return (
    <button
      type='button'
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border-2 border-white/20 p-2.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-primary-light',
        selected && !disabled && 'border-primary-light bg-primary-light/10'
      )}
    >
      <PresetDiagram layout={layout} />
      <div className='text-sm font-bold'>{layout.label}</div>
      {layout.note && <div className='text-pretty text-xs text-slate-400'>{layout.note}</div>}
      {disabled && (
        <div className='text-xs font-bold uppercase tracking-wide text-amber-300'>Coming soon</div>
      )}
    </button>
  )
}

function PresetDiagram({layout}: {layout: PhysicalLayout}) {
  const pageAspect = layout.page.width / layout.page.height
  const cardAspect = layout.card.width / layout.card.height

  return (
    <div
      aria-hidden='true'
      className='flex items-center justify-center rounded border border-white/30 bg-black/20 p-1'
      style={{aspectRatio: pageAspect, height: '3.5rem'}}
    >
      <div
        className='grid h-full w-full gap-[2px]'
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        }}
      >
        {Array.from({length: layoutUpCount(layout)}).map((_, index) => (
          <div
            key={index}
            className='self-center rounded-[1px] bg-primary-light/70'
            style={{aspectRatio: cardAspect}}
          />
        ))}
      </div>
    </div>
  )
}
