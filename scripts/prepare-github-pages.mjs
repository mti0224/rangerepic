import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = path.resolve('dist-play')

function normalizeBase(value) {
  const parts = String(value || '/rangerepic/').split('/').filter(Boolean)
  return `/${parts.join('/')}/`
}

const base = normalizeBase(process.env.PAGES_BASE_PATH)
const baseNoSlash = base.replace(/\/$/, '')

const entries = await fs.readdir(OUT_DIR, { withFileTypes: true })
const staticDirs = entries
  .filter(entry => entry.isDirectory() && entry.name !== 'assets')
  .map(entry => entry.name)

const textExtensions = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.xml',
])

async function walk(dir) {
  const found = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await walk(full))
    else if (textExtensions.has(path.extname(entry.name))) found.push(full)
  }
  return found
}

function prefixQuotedPath(text, from, to) {
  for (const quote of ['"', "'", '`']) {
    text = text.split(`${quote}${from}`).join(`${quote}${to}`)
  }
  return text
}

function rewrite(text) {
  for (const dir of staticDirs) {
    text = prefixQuotedPath(text, `/${dir}/`, `${base}${dir}/`)
    text = text.split(`url(/${dir}/`).join(`url(${base}${dir}/`)
  }

  // Files copied directly from public/ that are referenced from HTML.
  text = prefixQuotedPath(text, '/manifest.webmanifest', `${base}manifest.webmanifest`)

  // The play UI uses pathname-based routes. GitHub Pages project sites live
  // under /rangerepic/, so keep those routes inside the repository base path.
  for (const route of ['/lobby', '/stages', '/team', '/characters']) {
    text = prefixQuotedPath(text, route, `${baseNoSlash}${route}`)
  }

  return text
}

for (const file of await walk(OUT_DIR)) {
  const before = await fs.readFile(file, 'utf8')
  const after = rewrite(before)
  if (after !== before) await fs.writeFile(file, after, 'utf8')
}

const manifestPath = path.join(OUT_DIR, 'manifest.webmanifest')
try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.start_url = base
  manifest.scope = base
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
} catch {
  // The manifest is optional for deployment.
}

// GitHub Pages has no SPA rewrite rule. Serving the same app as 404.html lets
// direct visits/refreshes at /rangerepic/lobby and /rangerepic/team boot the SPA.
await fs.copyFile(path.join(OUT_DIR, 'index.html'), path.join(OUT_DIR, '404.html'))
await fs.writeFile(path.join(OUT_DIR, '.nojekyll'), '', 'utf8')

console.log(`Prepared GitHub Pages output for base ${base}`)
console.log(`Static directories rewritten: ${staticDirs.join(', ')}`)
