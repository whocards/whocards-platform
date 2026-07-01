// Persist the content-addressed OG card render cache (.cache/og) across deploys.
//
// src/server/card-image.ts renders each (text, language) card only on a cache
// miss and writes the PNG into .cache/og keyed by a content hash. Restoring that
// dir before the build means a deploy that didn't change questions.json renders
// zero cards; saving it after keeps newly rendered ones for next time.
//
// Paths are relative to the build's base directory (apps/website), so `.cache/og`
// is the same dir card-image.ts writes to (it resolves from process.cwd()).
export const onPreBuild = async ({utils}) => {
  const restored = await utils.cache.restore('.cache/og')
  console.log(
    restored
      ? 'og-cache: restored .cache/og from the Netlify build cache'
      : 'og-cache: no cache yet — cards render fresh this build'
  )
}

export const onPostBuild = async ({utils}) => {
  await utils.cache.save('.cache/og')
  console.log('og-cache: saved .cache/og to the Netlify build cache')
}
