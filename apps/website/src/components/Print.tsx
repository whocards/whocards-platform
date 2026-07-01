import {Icon as _Icon, type IconifyIconProps} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useState, type ComponentType} from 'react'
import {buildPrintDownloadUrl, getDefaultPresetId, layoutUpCount} from '~components/print/print-ui'
import {PRINT_LANGUAGES} from '~server/print/params'
import {PHYSICAL_LAYOUTS, type LayoutId, type PhysicalLayout} from '~server/print/presets'
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

  const langSupported = PRINT_LANGUAGES.includes(store.lang)
  const canDownload = Boolean(preset) && langSupported
  const downloadUrl = preset ? buildPrintDownloadUrl('library', store.lang, preset) : undefined

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
    </>
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
