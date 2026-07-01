import {Icon as _Icon, type IconifyIconProps} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useState, type ComponentType} from 'react'
import {
  buildCalibrationDownloadUrl,
  buildPrintDownloadUrl,
  clampOffsetMm,
  getDefaultPresetId,
  layoutUpCount,
} from '~components/print/print-ui'
import {PRINT_LANGUAGES} from '~server/print/params'
import {PHYSICAL_LAYOUTS, type LayoutId, type PhysicalLayout} from '~server/print/presets'
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

export default function Print() {
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
  const calibrationUrl = preset ? buildCalibrationDownloadUrl(preset, offsetX, offsetY) : undefined

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
      <h1 className='text-gradient font-title text-center text-7xl font-extrabold uppercase leading-none tracking-tight text-white md:text-8xl xl:text-9xl'>
        Print It Yourself
      </h1>
      <p className='text-center text-xl text-slate-300 md:text-2xl lg:max-w-6xl lg:text-4xl'>
        Print your own WhoCards for free and experience the power of authentic connections.
      </p>

      <div className='w-full max-w-4xl'>
        <h2 className='font-title text-center text-5xl'>Choose your sheet</h2>
        <div className='mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
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

      <div className='flex w-full max-w-sm flex-col items-center gap-3'>
        <h2 className='font-title text-center text-5xl'>Language</h2>
        <button
          className='border-primary-light flex h-12 w-full items-center justify-center rounded-lg border-2 px-2 font-bold tracking-wider'
          onClick={() => window.langsModal.showModal()}
        >
          <div className='flex-1'>{LANGUAGES[store.lang]}</div>
          <Icon
            icon='majesticons:chevron-up'
            className='rotate-180 justify-self-end'
            height={24}
            width={24}
          />
        </button>
        {!langSupported && (
          <p className='text-center text-sm text-amber-300'>
            {LANGUAGES[store.lang]} printing is coming soon — pick another language to download.
          </p>
        )}
      </div>

      <div className='flex flex-col items-center gap-3 text-center'>
        <p className='max-w-md font-bold text-amber-300'>
          Print at 100% / actual size — turn off &ldquo;Fit to page&rdquo; so the cards line up with
          your precut sheet.
        </p>
        <a
          className={cn('btn btn-primary', {
            'btn-disabled pointer-events-none opacity-50': !canDownload,
          })}
          aria-disabled={!canDownload}
          href={downloadUrl}
        >
          Download
        </a>
      </div>

      <CalibrationSection
        preset={preset}
        offsetX={offsetX}
        offsetY={offsetY}
        onChangeOffset={updateOffset}
        calibrationUrl={calibrationUrl}
      />
    </>
  )
}

interface CalibrationSectionProps {
  preset: LayoutId | undefined
  offsetX: number
  offsetY: number
  onChangeOffset: (axis: 'offsetX' | 'offsetY', value: number) => void
  calibrationUrl: string | undefined
}

// "Alignment / calibrate" (#40): most printers add a small (sub-cm) offset even at
// 100% scale, which can ruin a whole precut sheet. Collapsed by default so it doesn't
// compete with the main download flow — the calibration sheet + nudge are only needed
// once per printer/sheet combo.
function CalibrationSection({
  preset,
  offsetX,
  offsetY,
  onChangeOffset,
  calibrationUrl,
}: CalibrationSectionProps) {
  return (
    <details className='w-full max-w-md rounded-lg border-2 border-white/20 p-4 text-center'>
      <summary className='cursor-pointer font-bold tracking-wide'>Alignment / calibrate</summary>
      <div className='mt-4 flex flex-col items-center gap-4'>
        <p className='text-sm text-slate-300'>
          Download the calibration sheet, print it at 100%, and lay it over your precut sheet. Read
          off any drift in mm against the rulers, enter it below, then re-download your cards.
        </p>
        <a
          className={cn('btn btn-outline btn-sm', {
            'btn-disabled pointer-events-none opacity-50': !preset,
          })}
          aria-disabled={!preset}
          href={calibrationUrl}
        >
          Download calibration sheet
        </a>
        <div className='flex items-center gap-4'>
          <OffsetInput
            label='X offset (mm)'
            value={offsetX}
            onChange={(value) => onChangeOffset('offsetX', value)}
          />
          <OffsetInput
            label='Y offset (mm)'
            value={offsetY}
            onChange={(value) => onChangeOffset('offsetY', value)}
          />
        </div>
      </div>
    </details>
  )
}

interface OffsetInputProps {
  label: string
  value: number
  onChange: (value: number) => void
}

function OffsetInput({label, value, onChange}: OffsetInputProps) {
  return (
    <label className='flex flex-col items-center gap-1 text-xs text-slate-300'>
      {label}
      <input
        type='number'
        step={0.5}
        min={-20}
        max={20}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className='input input-bordered input-sm w-24 text-center text-darker'
      />
    </label>
  )
}

interface PresetTileProps {
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
        'flex flex-col items-center gap-3 rounded-lg border-2 border-white/20 p-4 text-center transition',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-primary-light',
        selected && !disabled && 'border-primary-light bg-primary-light/10'
      )}
    >
      <PresetDiagram layout={layout} />
      <div className='font-bold'>{layout.label}</div>
      <div className='text-sm text-slate-300'>{layoutUpCount(layout)}-up</div>
      {layout.note && <div className='text-xs text-slate-400'>{layout.note}</div>}
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
      className='flex items-center justify-center rounded border border-white/30 bg-black/20 p-1.5'
      style={{aspectRatio: pageAspect, height: '5rem'}}
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
