/// <reference types="vite/client" />
import {createRootRoute, HeadContent, Scripts} from '@tanstack/react-router'
import {TanStackRouterDevtools} from '@tanstack/react-router-devtools'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {useState} from 'react'
import appCss from '~/styles/app.css?url'

import {Backdrop} from '~/components/backdrop'
import {DefaultCatchBoundary} from '~/components/DefaultCatchBoundary'
import {NotFound} from '~/components/NotFound'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {charSet: 'utf-8'},
      {name: 'viewport', content: 'width=device-width, initial-scale=1'},
      {name: 'color-scheme', content: 'dark'},
      {name: 'theme-color', content: '#0d051f'},
      {name: 'robots', content: 'noindex, nofollow'},
      {title: 'WhoCards @ Work'},
    ],
    links: [
      {rel: 'stylesheet', href: appCss},
      {rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml'},
      ...['aptly_regular', 'aptly_medium', 'golos_text'].map((font) => ({
        rel: 'preload',
        href: `/fonts/${font}.woff2`,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous' as const,
      })),
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({children}: {children: React.ReactNode}) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Backdrop />
        <QueryClientProvider client={queryClient}>
          {children}
          {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
