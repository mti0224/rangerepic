import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fetchRanger } from '../scripts/fetch-ranger.mjs'
import { fetchLericoData } from '../scripts/fetch-lerico.mjs'
import { DEFAULT_BATTLE_RULES, GAMEPLAY_ID_RE, validateBattleRules, validateCharacter, validateClass } from '../scripts/gameplay-schema.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(ROOT)

const PORT = Number(process.env.PORT || 4174)
const HOST = process.env.HOST || '127.0.0.1'
const DIST_DIR = path.resolve(ROOT, process.env.ADMIN_DIST_DIR || 'dist')
const RANGERS_DIR = path.join(ROOT, 'public', 'rangers')
const DELETED_DIR = path.join(ROOT, 'data', 'deleted-rangers')
const GAME_DIR = path.join(ROOT, 'data', 'game')
const CHARACTERS_DIR = path.join(GAME_DIR, 'characters')
const CLASSES_DIR = path.join(GAME_DIR, 'classes')
const RULES_FILE = path.join(GAME_DIR, 'rules.json')
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i
const COOKIE_NAME = 'rangerepic_admin'
const SESSION_TTL_SEC = Math.max(900, Number(process.env.SESSION_TTL_SEC || 43200))
const SECURE_COOKIE = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false')
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'
const AUTO_GIT_PUSH = process.env.AUTO_GIT_PUSH === 'true'
const GIT_REMOTE = process.env.GIT_REMOTE || 'origin'
const GIT_BRANCH = process.env.GIT_BRANCH || 'main'
const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || 'RangerEpic Admin'
const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || 'rangerepic-admin@localhost'
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || ''
const PLAIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(32).toString('hex'))

if (!PASSWORD_HASH && !PLAIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD 至少必須設定一個')
}
if (!SESSION_SECRET) {
  throw new Error('正式環境必須設定 SESSION_SECRET')
}

const loginAttempts = new Map()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_LIMIT = 5
let gitQueue = Promise.resolve()

function sendJson(res, code, data) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function redirect(res, location, code = 303) {
  res.statusCode = code
  res.setHeader('Location', location)
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
}

function newSession() {
  const payload = b64url(JSON.stringify({
    exp: Date.now() + SESSION_TTL_SEC * 1000,
    nonce: crypto.randomBytes(12).toString('hex'),
  }))
  return payload + '.' + sign(payload)
}

function verifySession(token) {
  if (!token || !token.includes('.')) return false
  const i = token.lastIndexOf('.')
  const payload = token.slice(0, i)
  const supplied = token.slice(i + 1)
  const expected = sign(payload)
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number(data.exp) > Date.now()
  } catch {
    return false
  }
}

function sessionCookie(token) {
  return [
    COOKIE_NAME + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + SESSION_TTL_SEC,
    SECURE_COOKIE ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function clearSessionCookie() {
  return [
    COOKIE_NAME + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    SECURE_COOKIE ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest()
}

function verifyPassword(password) {
  if (PASSWORD_HASH) {
    const parts = PASSWORD_HASH.split('$')
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false
    try {
      const salt = Buffer.from(parts[1], 'hex')
      const expected = Buffer.from(parts[2], 'hex')
      const actual = crypto.scryptSync(password, salt, expected.length)
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
    } catch {
      return false
    }
  }
  const a = sha256(password)
  const b = sha256(PLAIN_PASSWORD)
  return crypto.timingSafeEqual(a, b)
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    if (xff) return xff
  }
  return req.socket.remoteAddress || 'unknown'
}

function canTryLogin(ip) {
  const now = Date.now()
  const old = loginAttempts.get(ip)
  if (!old || old.resetAt <= now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    return true
  }
  return old.count < LOGIN_LIMIT
}

function noteFailedLogin(ip) {
  const now = Date.now()
  const item = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS }
  item.count += 1
  loginAttempts.set(ip, item)
}

function loginPage(error = '') {
  const safeError = String(error).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  return [
    '<!doctype html>',
    '<html lang="zh-Hant-TW">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<title>RangerEpic 管理後台</title>',
    '<style>',
    'html,body{height:100%;margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10131a;color:#f4f7fb}',
    'body{display:grid;place-items:center}.card{width:min(420px,calc(100vw - 40px));background:#181d27;border:1px solid #2b3444;border-radius:18px;padding:28px;box-shadow:0 24px 80px #0008}',
    'h1{margin:0 0 8px;font-size:25px}.sub{margin:0 0 22px;color:#aeb8c8;line-height:1.55}.error{background:#3a1f26;border:1px solid #753142;color:#ffd7df;padding:10px 12px;border-radius:10px;margin:0 0 14px}',
    'label{display:block;margin:0 0 8px;color:#cbd3df}input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #39465b;background:#0e1219;color:white;font-size:16px;outline:none}',
    'input:focus{border-color:#7ba8ff}button{width:100%;margin-top:16px;padding:12px 14px;border:0;border-radius:10px;background:#4f84f5;color:white;font-size:16px;font-weight:700;cursor:pointer}',
    '.hint{margin-top:16px;color:#7f8a9d;font-size:13px;line-height:1.5}',
    '</style>',
    '</head>',
    '<body><main class="card">',
    '<h1>RangerEpic 管理後台</h1>',
    '<p class="sub">登入後可新增 Ranger、下載動畫資源、修改角色設定與更新遊戲資料。</p>',
    safeError ? '<div class="error">' + safeError + '</div>' : '',
    '<form method="post" action="/login" autocomplete="on">',
    '<label for="password">管理員密碼</label>',
    '<input id="password" name="password" type="password" autocomplete="current-password" required autofocus />',
    '<button type="submit">登入</button>',
    '</form>',
    '<div class="hint">管理密碼只在伺服器端驗證，不會寫入前端 bundle。</div>',
    '</main></body></html>',
  ].join('\n')
}

function isAuthenticated(req) {
  return verifySession(parseCookies(req)[COOKIE_NAME])
}

function safeJoin(base, requestPath) {
  let decoded
  try { decoded = decodeURIComponent(requestPath) } catch { return null }
  const rel = decoded.replace(/^\/+/, '')
  const full = path.resolve(base, rel)
  const root = path.resolve(base) + path.sep
  return full === path.resolve(base) || full.startsWith(root) ? full : null
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.sam': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveFile(res, file, cache = true) {
  const stat = await fs.stat(file).catch(() => null)
  if (!stat || !stat.isFile()) return false
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Cache-Control', cache ? 'public, max-age=300' : 'no-store')
  res.end(await fs.readFile(file))
  return true
}

const gameNameOf = stats =>
  stats?.name?.zh?.trim?.() || stats?.name?.th?.trim?.() || stats?.name?.en?.trim?.() || null

async function listRangerItems() {
  await fs.mkdir(RANGERS_DIR, { recursive: true })
  const dirs = (await fs.readdir(RANGERS_DIR, { withFileTypes: true })).filter(d => d.isDirectory())
  return Promise.all(dirs.map(async d => {
    const dir = path.join(RANGERS_DIR, d.name)
    const data = await fs.readFile(path.join(dir, 'ranger.json'), 'utf8').then(JSON.parse).catch(() => null)
    const stats = await fs.readFile(path.join(dir, 'stats.json'), 'utf8').then(JSON.parse).catch(() => null)
    const files = await fs.readdir(dir).catch(() => [])
    const bullets = files.map(f => (f.match(/^(bul\d*)\.sam$/) || [])[1]).filter(Boolean).sort()
    return {
      id: d.name,
      configured: !!data,
      approved: data?.approved === true,
      grade: typeof stats?.grade === 'number' ? stats.grade : null,
      name: data?.name && data.name !== d.name ? data.name : gameNameOf(stats) || d.name,
      gameNames: stats?.name || undefined,
      bullets,
      role: data?.role || null,
      element: data?.element || null,
      category: data?.category || null,
    }
  }))
}

async function readJson(file, fallback = null) {
  return fs.readFile(file, 'utf8').then(JSON.parse).catch(() => fallback)
}

async function listGameplayDocs(dir) {
  await fs.mkdir(dir, { recursive: true })
  const files = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(d => d.isFile() && d.name.endsWith('.json'))
    .map(d => d.name)
    .sort()
  const rows = []
  for (const name of files) {
    const data = await readJson(path.join(dir, name))
    if (data) rows.push(data)
  }
  return rows
}

async function saveGameplayDoc(dir, id, data) {
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, id + '.json')
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return file
}

async function git(args, extraEnv = {}) {
  return execFileAsync('git', args, {
    cwd: ROOT,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  })
}

async function doPersist(paths, message) {
  if (!AUTO_GIT_PUSH) return { enabled: false }
  await git(['add', '-A', '--', ...paths])
  let changed = true
  try {
    await git(['diff', '--cached', '--quiet'])
    changed = false
  } catch (e) {
    if (e?.code !== 1) throw e
  }
  if (!changed) return { enabled: true, committed: false, pushed: false }

  await git(
    ['-c', 'user.name=' + GIT_AUTHOR_NAME, '-c', 'user.email=' + GIT_AUTHOR_EMAIL, 'commit', '-m', message],
    { GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME: GIT_AUTHOR_NAME, GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL },
  )
  await git(['push', GIT_REMOTE, 'HEAD:' + GIT_BRANCH])
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  return { enabled: true, committed: true, pushed: true, commit: head }
}

function persist(paths, message) {
  const run = gitQueue.then(() => doPersist(paths, message))
  gitQueue = run.catch(() => {})
  return run
}

async function persistSafe(paths, message) {
  try {
    return { ok: true, ...(await persist(paths, message)) }
  } catch (e) {
    console.error('[git]', e)
    return { ok: false, enabled: AUTO_GIT_PUSH, error: e instanceof Error ? e.message : String(e) }
  }
}

async function handleApi(req, res, url) {
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)

  if (req.method === 'GET' && seg[0] === 'auth' && seg[1] === 'status') {
    return sendJson(res, 200, { authenticated: true })
  }

  if (req.method === 'GET' && seg[0] === 'rangers') {
    return sendJson(res, 200, { rangers: await listRangerItems() })
  }
  if (seg[0] === 'gameplay') {
    if (req.method === 'GET' && seg[1] === 'characters' && !seg[2]) {
      return sendJson(res, 200, { characters: await listGameplayDocs(CHARACTERS_DIR) })
    }
    if (req.method === 'GET' && seg[1] === 'classes' && !seg[2]) {
      return sendJson(res, 200, { classes: await listGameplayDocs(CLASSES_DIR) })
    }
    if (req.method === 'GET' && seg[1] === 'rules') {
      return sendJson(res, 200, { rules: await readJson(RULES_FILE, DEFAULT_BATTLE_RULES) })
    }

    if (seg[1] === 'character' && seg[2]) {
      const id = seg[2]
      if (!GAMEPLAY_ID_RE.test(id)) return sendJson(res, 400, { error: 'bad gameplay id' })
      const file = path.join(CHARACTERS_DIR, id + '.json')
      if (req.method === 'GET') return sendJson(res, 200, { character: await readJson(file) })
      if (req.method === 'POST') {
        const data = JSON.parse(await readBody(req))
        const errors = validateCharacter(data, id)
        if (errors.length) return sendJson(res, 400, { error: 'invalid character', errors })
        await saveGameplayDoc(CHARACTERS_DIR, id, data)
        const sync = await persistSafe(['data/game/characters/' + id + '.json'], 'admin: update character ' + id)
        return sendJson(res, 200, { ok: true, character: data, git: sync })
      }
      if (req.method === 'DELETE') {
        const classes = await listGameplayDocs(CLASSES_DIR)
        if (classes.some(c => c.characterId === id)) return sendJson(res, 409, { error: 'character is used by a class' })
        const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
        if (!exists) return sendJson(res, 404, { error: 'not found' })
        await fs.unlink(file)
        const sync = await persistSafe(['data/game/characters/' + id + '.json'], 'admin: remove character ' + id)
        return sendJson(res, 200, { ok: true, git: sync })
      }
    }

    if (seg[1] === 'class' && seg[2]) {
      const id = seg[2]
      if (!GAMEPLAY_ID_RE.test(id)) return sendJson(res, 400, { error: 'bad gameplay id' })
      const file = path.join(CLASSES_DIR, id + '.json')
      if (req.method === 'GET') return sendJson(res, 200, { class: await readJson(file) })
      if (req.method === 'POST') {
        const data = JSON.parse(await readBody(req))
        const errors = validateClass(data, id)
        if (errors.length) return sendJson(res, 400, { error: 'invalid class', errors })
        const character = await readJson(path.join(CHARACTERS_DIR, data.characterId + '.json'))
        if (!character) return sendJson(res, 400, { error: 'unknown characterId' })
        const assetDir = path.join(RANGERS_DIR, data.assetVariantId)
        const assetExists = await fs.stat(assetDir).then(s => s.isDirectory()).catch(() => false)
        if (!assetExists) return sendJson(res, 400, { error: 'unknown assetVariantId' })
        await saveGameplayDoc(CLASSES_DIR, id, data)
        const sync = await persistSafe(['data/game/classes/' + id + '.json'], 'admin: update class ' + id)
        return sendJson(res, 200, { ok: true, class: data, git: sync })
      }
      if (req.method === 'DELETE') {
        const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
        if (!exists) return sendJson(res, 404, { error: 'not found' })
        await fs.unlink(file)
        const sync = await persistSafe(['data/game/classes/' + id + '.json'], 'admin: remove class ' + id)
        return sendJson(res, 200, { ok: true, git: sync })
      }
    }

    if (req.method === 'POST' && seg[1] === 'rules') {
      const data = JSON.parse(await readBody(req))
      const errors = validateBattleRules(data)
      if (errors.length) return sendJson(res, 400, { error: 'invalid rules', errors })
      await fs.mkdir(GAME_DIR, { recursive: true })
      await fs.writeFile(RULES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8')
      const sync = await persistSafe(['data/game/rules.json'], 'admin: update gameplay rules')
      return sendJson(res, 200, { ok: true, rules: data, git: sync })
    }
  }


  if (seg[0] === 'ranger' && seg[1]) {
    const id = seg[1]
    if (!ID_RE.test(id)) return sendJson(res, 400, { error: 'bad id' })
    if (req.method === 'GET') {
      const file = path.join(RANGERS_DIR, id, 'ranger.json')
      const data = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
      return sendJson(res, 200, { ranger: data })
    }
    if (req.method === 'POST') {
      const data = JSON.parse(await readBody(req))
      if (data?.id && data.id !== id) return sendJson(res, 400, { error: 'id mismatch' })
      const dir = path.join(RANGERS_DIR, id)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'ranger.json'), JSON.stringify({ ...data, id }, null, 2), 'utf8')
      const sync = await persistSafe(['public/rangers/' + id], 'admin: update ranger ' + id)
      return sendJson(res, 200, { ok: true, git: sync })
    }
    if (req.method === 'DELETE') {
      const src = path.join(RANGERS_DIR, id)
      const exists = await fs.stat(src).then(s => s.isDirectory()).catch(() => false)
      if (!exists) return sendJson(res, 404, { error: 'not found' })
      await fs.mkdir(DELETED_DIR, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const dest = path.join(DELETED_DIR, id + '-' + stamp)
      try {
        await fs.rename(src, dest)
      } catch (err) {
        const code = err?.code
        if (!['EPERM', 'EBUSY', 'EXDEV'].includes(code)) throw err
        await fs.cp(src, dest, { recursive: true })
        await fs.rm(src, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      }
      const movedTo = path.relative(ROOT, dest).split(path.sep).join('/')
      const sync = await persistSafe(['public/rangers/' + id, movedTo], 'admin: remove ranger ' + id)
      return sendJson(res, 200, { ok: true, movedTo, git: sync })
    }
  }

  if (req.method === 'POST' && seg[0] === 'fetch-ranger') {
    const body = JSON.parse(await readBody(req))
    const id = String(body?.id || '').trim().toLowerCase()
    if (!id || !ID_RE.test(id)) return sendJson(res, 400, { error: 'bad id' })
    const result = await fetchRanger(id, RANGERS_DIR)
    const lerico = result.ok ? await fetchLericoData({ ids: [id] }).catch(e => ({ error: String(e) })) : null
    const sync = result.ok ? await persistSafe(['public/rangers/' + id], 'admin: add ranger ' + id) : { ok: true, enabled: false }
    return sendJson(res, result.ok ? 200 : 502, { ...result, lerico, git: sync })
  }

  if (req.method === 'POST' && seg[0] === 'refresh-data') {
    const raw = await readBody(req)
    const body = raw ? JSON.parse(raw) : {}
    const ids = body?.ids
    if (ids && (!Array.isArray(ids) || !ids.every(i => typeof i === 'string' && ID_RE.test(i)))) {
      return sendJson(res, 400, { error: 'bad id' })
    }
    const report = await fetchLericoData({ ids: ids || [], refresh: true })
    const renamed = {}
    const targets = ids?.length
      ? ids
      : (await fs.readdir(RANGERS_DIR, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)

    for (const id of targets) {
      const file = path.join(RANGERS_DIR, id, 'ranger.json')
      const data = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
      const stats = await fs.readFile(path.join(RANGERS_DIR, id, 'stats.json'), 'utf8').then(JSON.parse).catch(() => null)
      const name = gameNameOf(stats)
      if (!data || !name || data.name === name) continue
      const auto = !data.name || data.name === id || data.name === stats?.name?.en || data.name === stats?.name?.th || data.name === stats?.name?.zh
      if (!auto) continue
      data.name = name
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
      renamed[id] = name
    }

    const paths = ids?.length ? ids.map(id => 'public/rangers/' + id) : ['public/rangers']
    const sync = await persistSafe(paths, 'admin: refresh ranger data')
    return sendJson(res, 200, { ...report, renamed, git: sync })
  }

  if (req.method === 'POST' && seg[0] === 'debug-frame' && seg[1]) {
    if (!ID_RE.test(seg[1])) return sendJson(res, 400, { error: 'bad name' })
    const body = JSON.parse(await readBody(req, 12 * 1024 * 1024))
    const b64 = body?.png?.replace(/^data:image\/\w+;base64,/, '')
    if (!b64) return sendJson(res, 400, { error: 'no image' })
    const dir = path.join(ROOT, 'node_modules', '.debug-frames')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, seg[1] + '.png'), Buffer.from(b64, 'base64'))
    return sendJson(res, 200, { ok: true })
  }

  return sendJson(res, 404, { error: 'not found' })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  try {
    if (url.pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, service: 'rangerepic-admin' })
    }

    if (url.pathname === '/login') {
      if (req.method === 'GET') {
        if (isAuthenticated(req)) return redirect(res, '/')
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        return res.end(loginPage())
      }
      if (req.method === 'POST') {
        const ip = clientIp(req)
        if (!canTryLogin(ip)) {
          res.statusCode = 429
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          return res.end(loginPage('登入失敗次數過多，請稍後再試。'))
        }
        const body = new URLSearchParams(await readBody(req, 32 * 1024))
        const password = body.get('password') || ''
        if (!verifyPassword(password)) {
          noteFailedLogin(ip)
          res.statusCode = 401
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(loginPage('密碼錯誤。'))
        }
        loginAttempts.delete(ip)
        res.setHeader('Set-Cookie', sessionCookie(newSession()))
        return redirect(res, '/')
      }
      res.statusCode = 405
      return res.end('Method Not Allowed')
    }

    if ((url.pathname === '/logout') && (req.method === 'POST' || req.method === 'GET')) {
      res.setHeader('Set-Cookie', clearSessionCookie())
      return redirect(res, '/login')
    }

    if (!isAuthenticated(req)) {
      if (url.pathname.startsWith('/api/')) return sendJson(res, 401, { error: 'unauthorized' })
      return redirect(res, '/login')
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url)
    }

    if (url.pathname.startsWith('/rangers/')) {
      const live = safeJoin(path.join(ROOT, 'public'), url.pathname)
      if (live && await serveFile(res, live, false)) return
    }

    let requestPath = url.pathname === '/' ? '/index.html' : url.pathname
    const file = safeJoin(DIST_DIR, requestPath)
    if (file && await serveFile(res, file, true)) return

    if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
      if (await serveFile(res, path.join(DIST_DIR, 'index.html'), false)) return
    }

    res.statusCode = 404
    res.end('Not Found')
  } catch (e) {
    console.error('[request]', req.method, url.pathname, e)
    if (!res.headersSent) sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log('[RangerEpic Admin] http://' + HOST + ':' + PORT)
  console.log('[RangerEpic Admin] repo=' + ROOT)
  console.log('[RangerEpic Admin] auto git push=' + AUTO_GIT_PUSH)
})
