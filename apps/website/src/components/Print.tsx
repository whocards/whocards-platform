import {Icon} from '@iconify-icon/react'
import {useStore} from '@nanostores/react'
import {useState} from 'react'
import {$langStore} from '~stores/Language.store'
import {LANGUAGES, cn} from '~utils'

export default function Print() {
  const store = useStore($langStore)
  const [isWide, setIsWide] = useState<boolean>(true)

  return (
    <>
      <h1 className='text-gradient font-title text-center text-7xl font-extrabold uppercase leading-none tracking-tight text-white md:text-8xl xl:text-9xl'>
        Print It Yourself
      </h1>
      <p className='text-center text-xl text-slate-300 md:text-2xl lg:max-w-6xl lg:text-4xl'>
        Print your own WhoCards for free and experience the power of authentic connections.
        {/* <br />
        <span className='text-lg italic md:text-xl lg:text-2xl'>
          Help us make this possible, and please consider{' '}
          <a
            href={donationUrl}
            target='_blank'
            className=' text-primary-light underline hover:font-bold hover:underline'
          >
            donating
          </a>
          .
        </span> */}
      </p>
      <div className='my-8 grid w-full grid-cols-1 gap-8 md:my-4 md:w-auto md:grid-cols-2'>
        <h2 className='font-title order-1 text-center text-5xl md:order-none'>Language</h2>
        <h2 className='font-title order-3 mt-8 text-center text-5xl md:order-none md:mt-0'>
          Orientation
        </h2>
        <div className='order-2 flex items-center justify-center md:order-none'>
          <button
            className='border-primary-light flex h-12 w-full items-center justify-center rounded-lg border-2 px-2 font-bold tracking-wider md:mx-6'
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
        </div>
        <div className='order-4 grid w-fit grid-cols-2 items-center gap-4 justify-self-center text-black md:order-none'>
          <button
            className={cn('flex h-32 w-32 items-center justify-center', {
              'border-primary-dark rounded-lg border-2': isWide,
            })}
            onClick={() => setIsWide(true)}
          >
            <div className='bg-primary-light flex h-16 w-24 items-center justify-center gap-2 rounded-lg font-bold'>
              <div>Wide</div>
            </div>
          </button>
          <button
            className={cn('flex h-32 w-32 items-center justify-center', {
              'border-primary-dark rounded-lg border-2': !isWide,
            })}
            onClick={() => setIsWide(false)}
          >
            <div className='bg-primary-light mx-auto flex h-24 w-16 flex-col items-center justify-center gap-2 rounded-lg font-bold'>
              <div>Tall</div>
            </div>
          </button>
        </div>
        <div className='mx order-5 mt-8 text-center md:order-none md:col-span-2'>
          <a
            target='_blank'
            className='btn btn-primary mt-auto'
            href={`/cards/${store.lang}-${isWide ? 'wide' : 'tall'}.pdf`}
          >
            Download
          </a>
        </div>
      </div>
    </>
  )
}
