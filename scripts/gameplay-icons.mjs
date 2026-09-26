import fs from 'node:fs/promises'
import path from 'node:path'
import { extractPngsFromZip } from './zip-png.mjs'

const IMAGE_RE = /\.(png|jpe?g|webp)$/i

const urlJoin = (...parts) => '/' + parts.map(p => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')

function dirs(publicDir) {
  const root = path.join(publicDir, 'gameplay-icons')
  return {
    root,
    abilityLibrary: path.join(root, 'abilities'),
    skillUploads: path.join(root, 'uploads', 'skills'),
    abilityUploads: path.join(root, 'uploads', 'abilities'),
  }
}

async function listDir(dir, urlBase, source) {
  await fs.mkdir(dir, { recursive: true })
  const entries = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(d => d.isFile() && IMAGE_RE.test(d.name))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b))
  return entries.map(name => ({ name, url: urlJoin(urlBase, name), source }))
}

export async function listGameplayIcons(publicDir, kind) {
  const d = dirs(publicDir)
  if (kind === 'skill') return listDir(d.skillUploads, 'gameplay-icons/uploads/skills', 'upload')
  if (kind === 'ability') {
    const [library, uploads] = await Promise.all([
      listDir(d.abilityLibrary, 'gameplay-icons/abilities', 'library'),
      listDir(d.abilityUploads, 'gameplay-icons/uploads/abilities', 'upload'),
    ])
    return [...library, ...uploads]
  }
  throw new Error('invalid icon kind')
}

function decodeDataUrl(data, allowed) {
  if (typeof data !== 'string') throw new Error('missing data')
  const m = data.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!m || !allowed.includes(m[1].toLowerCase())) throw new Error('unsupported file type')
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length) throw new Error('empty file')
  return { mime: m[1].toLowerCase(), buf }
}

function safeStem(fileName) {
  const base = path.basename(String(fileName || 'icon')).replace(/\.[^.]+$/, '')
  return (base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'icon').slice(0, 80)
}

function extForMime(mime) {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  throw new Error('unsupported image type')
}

export async function saveUploadedIcon(publicDir, kind, fileName, data) {
  if (!['skill', 'ability'].includes(kind)) throw new Error('invalid icon kind')
  const { mime, buf } = decodeDataUrl(data, ['image/png', 'image/jpeg', 'image/webp'])
  if (buf.length > 2 * 1024 * 1024) throw new Error('image exceeds 2 MB')
  const d = dirs(publicDir)
  const dir = kind === 'skill' ? d.skillUploads : d.abilityUploads
  await fs.mkdir(dir, { recursive: true })
  const name = Date.now() + '-' + safeStem(fileName) + extForMime(mime)
  await fs.writeFile(path.join(dir, name), buf)
  return {
    icon: {
      name,
      url: urlJoin('gameplay-icons', 'uploads', kind === 'skill' ? 'skills' : 'abilities', name),
      source: 'upload',
    },
    relativePath: path.posix.join('public', 'gameplay-icons', 'uploads', kind === 'skill' ? 'skills' : 'abilities', name),
  }
}

export async function importAbilityIconZip(publicDir, data) {
  const { buf } = decodeDataUrl(data, ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
  if (buf.length > 4 * 1024 * 1024) throw new Error('zip exceeds 4 MB')
  const files = extractPngsFromZip(buf, { maxFiles: 500, maxTotalBytes: 20 * 1024 * 1024 })
  if (!files.length) throw new Error('zip contains no PNG icons')
  const d = dirs(publicDir)
  await fs.mkdir(d.abilityLibrary, { recursive: true })
  for (const file of files) await fs.writeFile(path.join(d.abilityLibrary, file.name), file.data)
  return {
    count: files.length,
    icons: await listGameplayIcons(publicDir, 'ability'),
    relativePath: 'public/gameplay-icons/abilities',
  }
}
