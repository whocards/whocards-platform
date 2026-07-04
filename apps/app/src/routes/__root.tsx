/// <reference types="vite/client" />
import {createRootRoute, HeadContent, Scripts} from '@tanstack/react-router'
import {TanStackRouterDevtools} from '@tanstack/react-router-devtools'
import appCss from '~/styles/app.css?url'

import {DefaultCatchBoundary} from '~/components/DefaultCatchBoundary'
import {NotFound} from '~/components/NotFound'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {charSet: 'utf-8'},
      {name: 'viewport', content: 'width=device-width, initial-scale=1'},
      {name: 'robots', content: 'noindex, nofollow'},
      {title: 'WhoCards @ Work'},
    ],
    links: [{rel: 'stylesheet', href: appCss}],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
        <Scripts />
      </body>
    </html>
  )
}
