import {createRouter} from '@tanstack/react-router'

import {DefaultCatchBoundary} from './components/DefaultCatchBoundary'
import {NotFound} from './components/NotFound'
import {routeTree} from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  // oxlint-disable-next-line consistent-type-definitions -- module augmentation requires `interface`, `type` can't merge
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
