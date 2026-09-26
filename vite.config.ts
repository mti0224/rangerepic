import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetchRanger } from './scripts/fetch-ranger.mjs'
import { fetchLericoData } from './scripts/fetch-lerico.mjs'
import { DEFAULT_BATTLE_RULES, GAMEPLAY_ID_RE, validateBattleRules, validateCharacter, validateClass } from './scripts/gameplay-schema.mjs'
import { validateEnemy, validateStage } from './scripts/adventure-schema.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RANGERS_DIR = path.join(ROOT, 'public', 'rangers')
/** ชื่อตัวละครจากข้อมูลเกม (stats.json): ไทยก่อน ไม่มีค่อยใช้อังกฤษ */
const gameNameOf = (stats: { name?: { th?: string | null; en?: string | null; zh?: string | null } } | null): string | null =>
  stats?.name?.th?.trim() || stats?.name?.en?.trim() || null
/** ถังขยะของเรนเจอร์ที่ลบจาก editor — ย้ายโฟลเดอร์มาไว้ที่นี่ (กู้คืนได้ด้วยการย้ายกลับ) ไม่ลบถาวร */
const DELETED_DIR = path.join(ROOT, 'data', 'deleted-rangers')
const GAME_DIR = path.join(ROOT, 'data', 'game')
const CHARACTERS_DIR = path.join(GAME_DIR, 'characters')
const CLASSES_DIR = path.join(GAME_DIR, 'classes')
const ENEMIES_DIR = path.join(GAME_DIR, 'enemies')
const STAGES_DIR = path.join(GAME_DIR, 'stages')
const RULES_FILE = path.join(GAME_DIR, 'rules.json')
const GAMEPLAY_ICON_DIR = path.join(ROOT, 'public', 'gameplay-icons')
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i

/**
 * รายชื่อเรนเจอร์ (ใช้ทั้ง GET /api/rangers และไฟล์ rangers/index.json ตอน build)
 * withGameNames = แนบชื่อจากเกมทุกภาษามาด้วย (editor ใช้แสดงรายชื่อตามภาษาที่เลือก · ไฟล์ index.json ไม่ต้องการ)
 */
async function listRangerItems(withGameNames = false) {
  const dirs = (await fs.readdir(RANGERS_DIR, { withFileTypes: true })).filter(d => d.isDirectory())
  return Promise.all(dirs.map(async d => {
    const dir = path.join(RANGERS_DIR, d.name)
    const data = await fs.readFile(path.join(dir, 'ranger.json'), 'utf8').then(JSON.parse).catch(() => null)
    // ระดับดาว (1–9) จากข้อมูลเกม lerico · Evolution ฝั่ง client ดูจาก ID เอง
    const stats = await fs.readFile(path.join(dir, 'stats.json'), 'utf8').then(JSON.parse).catch(() => null)
    // ไฟล์กระสุนมีไม่เท่ากันทุกตัว — บอก client ไปเลยว่ามีอันไหนบ้าง จะได้ไม่ต้องยิง 404 เดา
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const bullets = files
      .map(f => (f.match(/^(bul\d*)\.sam$/) ?? [])[1])
      .filter((b): b is string => !!b)
      .sort()
    const gameNames = withGameNames && stats?.name
      ? { th: stats.name.th ?? null, en: stats.name.en ?? null, zh: stats.name.zh ?? null }
      : undefined
    return { id: d.name, configured: !!data, approved: data?.approved === true, grade: typeof stats?.grade === 'number' ? stats.grade : null, name: data?.name && data.name !== d.name ? data.name : gameNameOf(stats) ?? d.name, gameNames, bullets, role: data?.role ?? null, element: data?.element ?? null, category: data?.category ?? null }
  }))
}

const readJson = async <T = unknown>(file: string, fallback: T | null = null): Promise<T | null> =>
  fs.readFile(file, 'utf8').then(v => JSON.parse(v) as T).catch(() => fallback)

async function listGameplayDocs<T>(dir: string): Promise<T[]> {
  await fs.mkdir(dir, { recursive: true })
  const files = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(d => d.isFile() && d.name.endsWith('.json'))
    .map(d => d.name)
    .sort()
  const out: T[] = []
  for (const file of files) {
    const data = await readJson<T>(path.join(dir, file))
    if (data) out.push(data)
  }
  return out
}

async function saveGameplayDoc(dir: string, id: string, data: unknown): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, id + '.json'), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

const readBody = async (req: import('node:http').IncomingMessage): Promise<string> => {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

type GameplayIconKind = 'skill' | 'ability'
type GameplayIconSource = 'builtin' | 'custom'
type GameplayIconAsset = { kind: GameplayIconKind; name: string; url: string; source: GameplayIconSource }

async function listGameplayIconDir(kind: GameplayIconKind, source: GameplayIconSource): Promise<GameplayIconAsset[]> {
  const dir = source === 'builtin'
    ? path.join(GAMEPLAY_ICON_DIR, kind, 'builtin')
    : path.join(GAMEPLAY_ICON_DIR, kind, 'custom')
  const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
  return files
    .filter(item => item.isFile() && /\.(png|jpe?g|webp)$/i.test(item.name))
    .map(item => ({
      kind,
      name: item.name,
      url: '/gameplay-icons/' + kind + '/' + source + '/' + encodeURIComponent(item.name),
      source,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function listGameplayIcons(): Promise<{ skill: GameplayIconAsset[]; ability: GameplayIconAsset[] }> {
  const [skillCustom, abilityBuiltin, abilityCustom] = await Promise.all([
    listGameplayIconDir('skill', 'custom'),
    listGameplayIconDir('ability', 'builtin'),
    listGameplayIconDir('ability', 'custom'),
  ])
  return { skill: skillCustom, ability: [...abilityBuiltin, ...abilityCustom] }
}

async function saveGameplayIcon(kind: GameplayIconKind, name: string, dataUrl: string): Promise<GameplayIconAsset> {
  if (kind !== 'skill' && kind !== 'ability') throw new Error('bad icon kind')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('only PNG, JPEG and WebP icons are supported')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > 1024 * 1024) throw new Error('icon must be between 1 byte and 1 MB')
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const base = path.basename(name || kind, path.extname(name || '')).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || kind
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 10)
  const fileName = base + '-' + hash + '.' + ext
  const dir = path.join(GAMEPLAY_ICON_DIR, kind, 'custom')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), buffer)
  return { kind, name: fileName, url: '/gameplay-icons/' + kind + '/custom/' + encodeURIComponent(fileName), source: 'custom' }
}

// ── Dev API: อ่าน/เขียน ranger.json ลงดิสก์จริง + โหลด asset จาก lerico ──
// เว็บเขียนไฟล์เองไม่ได้ จึงให้ dev server เป็นคนเขียนให้ (มีเฉพาะตอน dev เท่านั้น)
function rangerApi(): Plugin {
  return {
    name: 'ranger-api',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res) => {
        const send = (code: number, data: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }
        const url = new URL(req.url ?? '/', 'http://x')
        const seg = url.pathname.split('/').filter(Boolean)   // req.url ถูกตัด '/api/' ออกแล้ว

        try {
          // GET /api/rangers → รายชื่อเรนเจอร์ที่มีในเครื่อง
          if (req.method === 'GET' && seg[0] === 'rangers') {
            await fs.mkdir(RANGERS_DIR, { recursive: true })
            const list = await listRangerItems(true)
            return send(200, { rangers: list })
          }
          // RangerEpic Gameplay Data API — 與正式 admin server 保持相同格式
          if (seg[0] === 'gameplay') {
            if (req.method === 'GET' && seg[1] === 'icons' && !seg[2]) {
              return send(200, await listGameplayIcons())
            }
            if (req.method === 'POST' && seg[1] === 'icon' && (seg[2] === 'skill' || seg[2] === 'ability')) {
              const data = JSON.parse(await readBody(req)) as { name?: string; dataUrl?: string }
              if (!data.name || !data.dataUrl) return send(400, { error: 'name and dataUrl are required' })
              const icon = await saveGameplayIcon(seg[2], data.name, data.dataUrl)
              return send(200, { ok: true, icon })
            }
            if (req.method === 'GET' && seg[1] === 'characters' && !seg[2]) {
              return send(200, { characters: await listGameplayDocs(CHARACTERS_DIR) })
            }
            if (req.method === 'GET' && seg[1] === 'classes' && !seg[2]) {
              return send(200, { classes: await listGameplayDocs(CLASSES_DIR) })
            }
            if (req.method === 'GET' && seg[1] === 'rules') {
              return send(200, { rules: await readJson(RULES_FILE, DEFAULT_BATTLE_RULES) })
            }
            if (req.method === 'GET' && seg[1] === 'enemies' && !seg[2]) {
              return send(200, { enemies: await listGameplayDocs(ENEMIES_DIR) })
            }
            if (req.method === 'GET' && seg[1] === 'stages' && !seg[2]) {
              return send(200, { stages: await listGameplayDocs(STAGES_DIR) })
            }

            if (seg[1] === 'character' && seg[2]) {
              const id = seg[2]
              if (!GAMEPLAY_ID_RE.test(id)) return send(400, { error: 'bad gameplay id' })
              const file = path.join(CHARACTERS_DIR, id + '.json')
              if (req.method === 'GET') return send(200, { character: await readJson(file) })
              if (req.method === 'POST') {
                const data: unknown = JSON.parse(await readBody(req))
                const errors = validateCharacter(data, id)
                if (errors.length) return send(400, { error: 'invalid character', errors })
                await saveGameplayDoc(CHARACTERS_DIR, id, data)
                return send(200, { ok: true, character: data })
              }
              if (req.method === 'DELETE') {
                const classes = await listGameplayDocs<{ characterId?: string }>(CLASSES_DIR)
                if (classes.some(c => c.characterId === id)) return send(409, { error: 'character is used by a class' })
                const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
                if (!exists) return send(404, { error: 'not found' })
                await fs.unlink(file)
                return send(200, { ok: true })
              }
            }

            if (seg[1] === 'class' && seg[2]) {
              const id = seg[2]
              if (!GAMEPLAY_ID_RE.test(id)) return send(400, { error: 'bad gameplay id' })
              const file = path.join(CLASSES_DIR, id + '.json')
              if (req.method === 'GET') return send(200, { class: await readJson(file) })
              if (req.method === 'POST') {
                const data = JSON.parse(await readBody(req)) as { characterId?: string; assetVariantId?: string }
                const errors = validateClass(data, id)
                if (errors.length) return send(400, { error: 'invalid class', errors })
                if (!data.characterId || !await readJson(path.join(CHARACTERS_DIR, data.characterId + '.json'))) return send(400, { error: 'unknown characterId' })
                if (!data.assetVariantId || !await fs.stat(path.join(RANGERS_DIR, data.assetVariantId)).then(s => s.isDirectory()).catch(() => false)) return send(400, { error: 'unknown assetVariantId' })
                await saveGameplayDoc(CLASSES_DIR, id, data)
                return send(200, { ok: true, class: data })
              }
              if (req.method === 'DELETE') {
                const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
                if (!exists) return send(404, { error: 'not found' })
                await fs.unlink(file)
                return send(200, { ok: true })
              }
            }

            if (seg[1] === 'enemy' && seg[2]) {
              const id = seg[2]
              if (!GAMEPLAY_ID_RE.test(id)) return send(400, { error: 'bad gameplay id' })
              const file = path.join(ENEMIES_DIR, id + '.json')
              if (req.method === 'GET') return send(200, { enemy: await readJson(file) })
              if (req.method === 'POST') {
                const data = JSON.parse(await readBody(req)) as any
                const errors = validateEnemy(data, id)
                if (errors.length) return send(400, { error: 'invalid enemy', errors })
                if (!await fs.stat(path.join(RANGERS_DIR, data.assetVariantId)).then(s => s.isDirectory()).catch(() => false)) return send(400, { error: 'unknown assetVariantId' })
                await saveGameplayDoc(ENEMIES_DIR, id, data)
                return send(200, { ok: true, enemy: data })
              }
              if (req.method === 'DELETE') {
                const stages = await listGameplayDocs<any>(STAGES_DIR)
                if (stages.some(stage => stage.waves?.some((w: any) => w.enemies?.some((row: any) => row.enemyId === id)))) return send(409, { error: 'enemy is used by a stage' })
                const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
                if (!exists) return send(404, { error: 'not found' })
                await fs.unlink(file)
                return send(200, { ok: true })
              }
            }

            if (seg[1] === 'stage' && seg[2]) {
              const id = seg[2]
              if (!GAMEPLAY_ID_RE.test(id)) return send(400, { error: 'bad gameplay id' })
              const file = path.join(STAGES_DIR, id + '.json')
              if (req.method === 'GET') return send(200, { stage: await readJson(file) })
              if (req.method === 'POST') {
                const data = JSON.parse(await readBody(req)) as any
                const errors = validateStage(data, id)
                const enemyIds = new Set((await listGameplayDocs<any>(ENEMIES_DIR)).map(row => row.id))
                for (const wave of data?.waves ?? []) for (const row of wave?.enemies ?? []) if (!enemyIds.has(row.enemyId)) errors.push('unknown enemyId: ' + row.enemyId)
                if (errors.length) return send(400, { error: 'invalid stage', errors })
                await saveGameplayDoc(STAGES_DIR, id, data)
                return send(200, { ok: true, stage: data })
              }
              if (req.method === 'DELETE') {
                const exists = await fs.stat(file).then(s => s.isFile()).catch(() => false)
                if (!exists) return send(404, { error: 'not found' })
                await fs.unlink(file)
                return send(200, { ok: true })
              }
            }

            if (req.method === 'POST' && seg[1] === 'rules') {
              const data: unknown = JSON.parse(await readBody(req))
              const errors = validateBattleRules(data)
              if (errors.length) return send(400, { error: 'invalid rules', errors })
              await fs.mkdir(GAME_DIR, { recursive: true })
              await fs.writeFile(RULES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8')
              return send(200, { ok: true, rules: data })
            }
          }


          // GET /api/ranger/<id> → ranger.json ของตัวนั้น
          if (req.method === 'GET' && seg[0] === 'ranger' && seg[1]) {
            if (!ID_RE.test(seg[1])) return send(400, { error: 'bad id' })
            const p = path.join(RANGERS_DIR, seg[1], 'ranger.json')
            const data = await fs.readFile(p, 'utf8').then(JSON.parse).catch(() => null)
            return send(200, { ranger: data })
          }

          // POST /api/ranger/<id> → เขียน ranger.json
          if (req.method === 'POST' && seg[0] === 'ranger' && seg[1]) {
            if (!ID_RE.test(seg[1])) return send(400, { error: 'bad id' })
            const data = JSON.parse(await readBody(req))
            const dir = path.join(RANGERS_DIR, seg[1])
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(path.join(dir, 'ranger.json'), JSON.stringify(data, null, 2), 'utf8')
            return send(200, { ok: true })
          }

          // DELETE /api/ranger/<id> → ย้ายโฟลเดอร์เรนเจอร์ไปถังขยะ data/deleted-rangers/<id>-<เวลา> (ไม่ลบถาวร)
          if (req.method === 'DELETE' && seg[0] === 'ranger' && seg[1]) {
            if (!ID_RE.test(seg[1])) return send(400, { error: 'bad id' })
            const src = path.join(RANGERS_DIR, seg[1])
            const exists = await fs.stat(src).then(s => s.isDirectory()).catch(() => false)
            if (!exists) return send(404, { error: 'not found' })
            await fs.mkdir(DELETED_DIR, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const dest = path.join(DELETED_DIR, `${seg[1]}-${stamp}`)
            // Windows ย้ายโฟลเดอร์ที่ dev server เฝ้าไฟล์อยู่ไม่ได้ (EPERM/EBUSY) → คัดลอกไปถังขยะก่อน แล้วค่อยลบต้นฉบับ
            try {
              await fs.rename(src, dest)
            } catch (err) {
              const code = (err as NodeJS.ErrnoException).code
              if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EXDEV') throw err
              await fs.cp(src, dest, { recursive: true })
              await fs.rm(src, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
            }
            return send(200, { ok: true, movedTo: path.relative(ROOT, dest).split(path.sep).join('/') })
          }

          // POST /api/fetch-ranger {id} → โหลด asset จาก lerico มาเก็บในเครื่อง
          if (req.method === 'POST' && seg[0] === 'fetch-ranger') {
            const { id } = JSON.parse(await readBody(req)) as { id?: string }
            if (!id || !ID_RE.test(id)) return send(400, { error: 'bad id' })
            const result = await fetchRanger(id, RANGERS_DIR)
            // ข้อมูลเกม (ธาตุ ชนิด สกิล ไอคอน) — API ล่มก็ไม่ทำให้การเพิ่มเรนเจอร์ล้ม
            const lerico = result.ok ? await fetchLericoData({ ids: [id] }).catch(e => ({ error: String(e) })) : null
            return send(result.ok ? 200 : 502, { ...result, lerico })
          }

          // POST /api/refresh-data {ids?} → ดึงข้อมูลเกมจาก lerico ใหม่ (ธาตุ ชนิด สกิล ไอคอน) ทุกตัวหรือเฉพาะที่ระบุ
          if (req.method === 'POST' && seg[0] === 'refresh-data') {
            const body = await readBody(req)
            const { ids } = (body ? JSON.parse(body) : {}) as { ids?: string[] }
            if (ids && !ids.every(i => ID_RE.test(i))) return send(400, { error: 'bad id' })
            const report = await fetchLericoData({ ids: ids ?? [], refresh: true })
            // ตั้งชื่อตัวละครตามข้อมูลเกม — เฉพาะตัวที่ยังไม่ได้ตั้งชื่อเอง (ชื่อ = id / ว่าง / เป็นชื่อเกมอีกภาษา)
            const renamed: Record<string, string> = {}
            const targets = ids?.length ? ids : (await fs.readdir(RANGERS_DIR, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)
            for (const id of targets) {
              const file = path.join(RANGERS_DIR, id, 'ranger.json')
              const data = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
              const stats = await fs.readFile(path.join(RANGERS_DIR, id, 'stats.json'), 'utf8').then(JSON.parse).catch(() => null)
              const name = gameNameOf(stats)
              if (!data || !name || data.name === name) continue
              const auto = !data.name || data.name === id || data.name === stats?.name?.en || data.name === stats?.name?.th
              if (!auto) continue
              data.name = name
              await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
              renamed[id] = name
            }
            return send(200, { ...report, renamed })
          }

          // POST /api/debug-frame/<name> {png: dataURL} → บันทึกภาพเฟรมไว้ตรวจ (node_modules/.debug-frames)
          if (req.method === 'POST' && seg[0] === 'debug-frame' && seg[1]) {
            if (!ID_RE.test(seg[1])) return send(400, { error: 'bad name' })
            const { png } = JSON.parse(await readBody(req)) as { png?: string }
            const b64 = png?.replace(/^data:image\/\w+;base64,/, '')
            if (!b64) return send(400, { error: 'no image' })
            const dir = path.join(ROOT, 'node_modules', '.debug-frames')
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(path.join(dir, seg[1] + '.png'), Buffer.from(b64, 'base64'))
            return send(200, { ok: true })
          }

          return send(404, { error: 'not found' })
        } catch (err) {
          return send(500, { error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
  }
}

/**
 * เส้นทางของหน้าเล่น (/lobby · /team) ตอน dev — ส่งไปที่ play.html เหมือนที่ Netlify ส่งทุกเส้นทางมาที่ index.html
 * (ไม่มีอันนี้ กด F5 ที่ /lobby แล้วจะ 404 ตอน dev)
 */
function playRoutes(): Plugin {
  const ROUTES = new Set(['/lobby', '/team', '/characters'])
  return {
    name: 'play-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const p = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
        if (ROUTES.has(p.toLowerCase())) req.url = '/play.html'
        next()
      })
    },
  }
}

/** ตอน build: สร้างดัชนีแบบไฟล์นิ่งให้หน้าเล่นใช้ได้โดยไม่ต้องมี Admin API */
function rangerIndex(): Plugin {
  return {
    name: 'ranger-index',
    apply: 'build',
    async generateBundle() {
      const [rangers, characters, classes, enemies, stages, rules] = await Promise.all([
        listRangerItems(),
        listGameplayDocs(CHARACTERS_DIR),
        listGameplayDocs(CLASSES_DIR),
        listGameplayDocs(ENEMIES_DIR),
        listGameplayDocs(STAGES_DIR),
        readJson(RULES_FILE, DEFAULT_BATTLE_RULES),
      ])
      this.emitFile({ type: 'asset', fileName: 'rangers/index.json', source: JSON.stringify({ rangers }) })
      this.emitFile({
        type: 'asset',
        fileName: 'gameplay/index.json',
        source: JSON.stringify({ characters, classes, rules: rules ?? DEFAULT_BATTLE_RULES }),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'gameplay/adventure.json',
        source: JSON.stringify({ enemies, stages }),
      })
    },
  }
}

/** โหมด play: build เฉพาะหน้าทดลองเล่น แล้วเปลี่ยนชื่อ play.html → index.html (อัปขึ้นเว็บแล้วเปิดได้ทันที · ไม่มี editor ติดไป) */
function playOnly(outDir: string): Plugin {
  return {
    name: 'play-only',
    apply: 'build',
    async closeBundle() {
      await fs.rename(path.join(outDir, 'play.html'), path.join(outDir, 'index.html')).catch(() => {})
    },
  }
}

export default defineConfig(({ mode }) => {
  const play = mode === 'play'
  const outDir = path.join(ROOT, play ? 'dist-play' : 'dist')
  const input: Record<string, string> = play
    ? { play: path.join(ROOT, 'play.html') }
    : { main: path.join(ROOT, 'index.html'), play: path.join(ROOT, 'play.html') }
  return {
    plugins: [react(), rangerApi(), rangerIndex(), playRoutes(), ...(play ? [playOnly(outDir)] : [])],
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    server: { port: 5174 },
    build: {
      outDir,
      rollupOptions: {
        // editor = index.html · หน้าทดลองเล่น = play.html (คนละ bundle — หน้าเล่นไม่มีโค้ด editor)
        input,
      },
    },
  }
})
