import {readFile, readdir, writeFile} from 'node:fs/promises'
import {relative, resolve, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const REDIRECTS_START = '# BEGIN GENERATED CLEAN URL ALIASES'
const REDIRECTS_END = '# END GENERATED CLEAN URL ALIASES'

export const cleanUrlRedirect = (relativePath) => {
  const publicPath = `/${relativePath.split(sep).join('/')}`

  if (publicPath === '/index.html') return `${publicPath} / 301!`
  return `${publicPath} ${publicPath.replace(/\.html$/, '')} 301!`
}

export const normalizeSitemapRoot = (sitemap) =>
  sitemap.replace(/<loc>(https?:\/\/[^/<]+)<\/loc>/g, '<loc>$1/</loc>')

export const withCleanUrlRedirects = (existingConfig, redirects) => {
  const generatedBlock = `${REDIRECTS_START}\n${redirects.join('\n')}\n${REDIRECTS_END}`
  const withoutGeneratedBlock = existingConfig
    .replace(
      /\n?# BEGIN GENERATED CLEAN URL ALIASES\n[\s\S]*?# END GENERATED CLEAN URL ALIASES\n?/g,
      ''
    )
    .trimEnd()

  return `${withoutGeneratedBlock}${withoutGeneratedBlock ? '\n\n' : ''}${generatedBlock}\n`
}

export const assertCleanSitemap = (sitemap) => {
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])

  const rootLocation = locations.find((location) => new URL(location).pathname === '/')
  if (!rootLocation?.endsWith('/')) throw new Error('Sitemap does not contain a clean root URL')
  const htmlLocation = locations.find((location) => location.endsWith('.html'))
  if (htmlLocation) throw new Error(`Sitemap contains build artifact URL: ${htmlLocation}`)
}

const findHtmlFiles = async (directory) => {
  const entries = await readdir(directory, {withFileTypes: true})
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? findHtmlFiles(path) : [path]
    })
  )
  return files.flat().filter((path) => path.endsWith('.html'))
}

export const writeSeoConfig = async (distDirectory) => {
  const sitemapPath = resolve(distDirectory, 'sitemap-0.xml')
  const sitemap = normalizeSitemapRoot(await readFile(sitemapPath, 'utf8'))
  assertCleanSitemap(sitemap)
  await writeFile(sitemapPath, sitemap)

  const htmlFiles = await findHtmlFiles(distDirectory)
  const redirects = htmlFiles
    .map((path) => relative(distDirectory, path))
    .filter((path) => path !== '404.html')
    .toSorted()
    .map(cleanUrlRedirect)

  // Exact rules are necessary because Netlify only supports splats at the end
  // of a path (so `/*.html` is not a valid wildcard). `301!` forces redirects
  // even though the matching .html files exist. Query strings are preserved.
  const redirectsPath = resolve(distDirectory, '_redirects')
  const existingConfig = await readFile(redirectsPath, 'utf8')
  await writeFile(redirectsPath, withCleanUrlRedirects(existingConfig, redirects))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) await writeSeoConfig(fileURLToPath(new URL('../dist', import.meta.url)))
