// ====================================================
// StoryMap — แผนที่ด่านโหมดเนื้อเรื่อง (เปิดจาก PLAY → เนื้อเรื่องหลัก)
//
// ปุ่มด่านเรียงซ้าย → ขวา มีเลขด่านเขียนทับ · ตัวละคร (หัวหน้าทีมที่เลือก) เดินไปหาทีละปุ่ม
//
// สถานะปุ่ม (ปุ่มจาก lerico area2_common · เอฟเฟกต์จาก area_step_effect)
//   ผ่านแล้ว     area2-btn-off.png (บอส: area2-btn-boss-off.png) · ไม่มีเอฟเฟกต์
//   ด่านปัจจุบัน  area2-btn-on.png + ar-btn-eff2.sam (บอส: ar-btn-boss-eff.sam)
//                ยังไม่เคยเปิด → ready (ปลดล็อค) → start (แตก · กดได้) → end วนลูป แล้วจำว่าเปิดแล้ว
//                เปิดแล้ว → end วนลูปเลย
//   ยังล็อค      เฟรมแรกของ ready (ปุ่มหินมีแม่กุญแจ)
//
// กดปุ่มที่ไปได้ → เปิดแผงข้อมูลด่านทันที (ศัตรู · ดาว · รางวัล · เลือกทีม · เริ่ม) ส่วนตัวละครเดินไปทีละปุ่มอยู่ด้านหลัง
// เลขด่าน: อยู่บนหน้าปุ่ม (ตรงที่ตัวละครยืน) · ตัวละครยืน/เดินผ่าน → เลขเลื่อนลงไปขอบล่างของปุ่ม แล้วเลื่อนกลับเมื่อพ้นไป
//          ปุ่มบอสเลขอยู่ขอบล่างตลอด (หน้าปุ่มมีหัวกะโหลก) · ปุ่มที่ยังล็อคเลขอยู่ขอบล่าง (หน้าปุ่มมีแม่กุญแจ)
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { SAMParser } from '@/lib/animation/samParser'
import { lerpSAMFrame, loadSprites, renderSAMFrame, type SpriteMap } from '@/lib/animation/samRenderer'
import { loadRangerAssets, type RangerAssets } from '@/lib/rangerAssets'
import { SamPlayer } from '@/lib/samPlayer'
import { bodyPointsOf } from '@/lib/actionPlan'
import { GEAR_BY_ID } from '@/lib/gear'
import {
  CHAPTERS, CHARGE_ENERGY, DROP_CHANCE, STAGES, STAGES_PER_CHAPTER, currentIndex, stageById, stageState, stagesOf, type StageDef,
} from '@/lib/stages'
import type { RangerConfig } from '@/lib/rangerConfig'
import { TEAM_KEYS, heroLevel, isFavorite, setStory, teamName, useCollection, type TeamPreset } from './collection'
import { localName } from './i18n'
import { IconBack, IconBolt, IconClose, IconCoin, IconGem, IconMap, IconStar, IconSwords } from './icons'
import { CardArt, nameOf, type RangerData } from './TeamBuilder'
import { ui, useLang } from './uiText'
import './story.css'

// ─────────────────────────────── ผังแผนที่ (หน่วยโลก) ───────────────────────────────

const MAP_W = 1300
/** เผื่อที่ด้านบนให้เสาแสงตอนปลดล็อค (~260 หน่วยเหนือปุ่ม) */
const MAP_H = 560
/** จุดกึ่งกลางปุ่มแต่ละด่าน — ซ้าย → ขวา เป็นคลื่นขึ้นลง */
const BTN_Y = [450, 350, 430, 330, 420, 320, 430, 340, 450, 350]
/** ตำแหน่งปุ่มในหนึ่งหน้า (บทละ 10 ด่าน — ทุกบทใช้ผังเดียวกัน) */
const BTN_POS = Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => ({ x: 90 + i * ((MAP_W - 180) / (STAGES_PER_CHAPTER - 1)), y: BTN_Y[i % BTN_Y.length] }))
/** รูปปุ่ม 90×76 · เอฟเฟกต์วางให้ปุ่มหินในเฟรมแรกตรงกับรูปปุ่มพอดี (มุมซ้ายบนของปุ่มอยู่ที่ 56,72 ของเอฟเฟกต์) */
const BTN_W = 90, BTN_H = 76
const FX_OFFSET = { x: 56, y: 72 }
/** ตัวละครยืนบนหน้าปุ่ม (เหนือกึ่งกลางรูปนิดหน่อย) */
const STAND_DY = -8
const WALKER_ZOOM = 0.55
const WALK_SPEED = 330       // หน่วยโลก/วินาที
const TAP_RADIUS = 58
/** เลขด่าน: บนหน้าปุ่ม / ขอบล่างของปุ่ม (เทียบกึ่งกลางปุ่ม) · ตัวละครใกล้กว่า NUM_NEAR = หลบลง */
const NUM_FACE_DY = -1
const NUM_RIM_DY = 20
const NUM_NEAR = 62
/** ความเร็วเลื่อนเลข (ต่อวินาที — ยิ่งมากยิ่งไว) */
const NUM_EASE = 9

type FxKind = 'normal' | 'boss'
interface Fx { sam: SAMParser; sprites: SpriteMap }
interface Assets {
  fx: Record<FxKind, Fx>
  img: Record<'on' | 'off' | 'bossOn' | 'bossOff', HTMLImageElement>
}

async function loadFx(name: string): Promise<Fx> {
  const [sam, plist, png] = await Promise.all([
    fetch(`/stage/${name}.sam`).then(r => r.arrayBuffer()),
    fetch(`/stage/${name}.plist`).then(r => r.arrayBuffer()),
    fetch(`/stage/${name}.png`).then(r => r.blob()),
  ])
  return { sam: new SAMParser(sam), sprites: await loadSprites(plist, png) }
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const im = new Image()
  im.onload = () => ok(im)
  im.onerror = fail
  im.src = src
})
let assetsPromise: Promise<Assets> | null = null
/** โหลดครั้งเดียวทั้งเกม (เข้าออกแผนที่บ่อยก็ไม่โหลดซ้ำ) */
function loadMapAssets(): Promise<Assets> {
  assetsPromise ??= (async () => {
    const [normal, boss, on, off, bossOn, bossOff] = await Promise.all([
      loadFx('ar-btn-eff2'), loadFx('ar-btn-boss-eff'),
      loadImg('/stage/area2-btn-on.png'), loadImg('/stage/area2-btn-off.png'),
      loadImg('/stage/area2-btn-boss-on.png'), loadImg('/stage/area2-btn-boss-off.png'),
    ])
    return { fx: { normal, boss }, img: { on, off, bossOn, bossOff } }
  })()
  assetsPromise.catch(() => { assetsPromise = null })
  return assetsPromise
}

/** ผลการดวลด่าน (แสดงในหน้าจบด่านของจอดวล) */
export interface StoryResult {
  stageId: string
  win: boolean
  stars: number
  firstClear: boolean
  reward: { gold: number; gem: number; gear: string | null } | null
}

/** หัวหน้าทีม = ตัวที่เดินบนแผนที่ (ช่องแรกที่มีฮีโร่ · ไม่มีทีม → ตัวที่ชอบ → ตัวแรกในคลัง) */
function leaderOf(team: TeamPreset | null, data: RangerData[], favorites: string[]): string | null {
  const ids = new Set(data.map(d => d.item.id))
  const fromTeam = team ? TEAM_KEYS.map(k => team.slots[k]).find(id => id && ids.has(id)) : null
  return fromTeam ?? favorites.find(id => ids.has(id)) ?? data[0]?.item.id ?? null
}

export default function StoryMap({ data, wallet, onClose, onPlay, onTeams }: {
  data: RangerData[]
  wallet?: React.ReactNode
  onClose: () => void
  onPlay: (stageId: string, teamId: string) => void
  onTeams: () => void
}) {
  useLang()
  const col = useCollection()
  const story = col.story
  const byId = useMemo(() => new Map(data.map(d => [d.item.id, d])), [data])
  const team = col.teams.find(t => t.id === story.team) ?? col.teams[0] ?? null
  const leader = leaderOf(team, data, col.favorites)
  const [panel, setPanel] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 1600); return () => window.clearTimeout(t) }, [toast])

  // บทที่เปิดตอนเข้า: ด่านปัจจุบันยังไม่เคยเปิด (เพิ่งปลดล็อค) → บทนั้นเลย · ไม่งั้น = บทที่ตัวละครยืนอยู่
  const cur = currentIndex(story.stars)
  const curStage = cur >= 0 ? STAGES[cur] : null
  const [chapter, setChapter] = useState(() => {
    const at = stageById(story.at ?? '')
    if (curStage && !story.opened.includes(curStage.id)) return curStage.chapter
    return at?.chapter ?? curStage?.chapter ?? CHAPTERS.length
  })
  const inChapter = stagesOf(chapter)
  const atLocal = (() => {
    const i = inChapter.findIndex(s => s.id === story.at)
    if (i >= 0) return i
    const c = curStage ? inChapter.indexOf(curStage) : -1
    return c >= 0 ? c : 0
  })()
  const stage = panel ? STAGES.find(s => s.id === panel) ?? null : null
  const chapterStars = inChapter.reduce((n, s) => n + (story.stars[s.id] ?? 0), 0)

  return (
    <div className="hp st" onContextMenu={e => e.preventDefault()}>
      <div className="hp-bg" aria-hidden="true"><i className="hp-glow" /><i className="hp-grid" /></div>
      <header className="hp-top">
        <button className="hp-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1>
          <IconMap size={20} />{ui('modeStory')}
          <span className="st-progress">
            <IconStar size={14} filled />{Object.values(story.stars).reduce((a, b) => a + b, 0)}/{STAGES.length * 3}
          </span>
          <small>{localName(CHAPTERS[chapter - 1].name)}</small>
        </h1>
        {wallet}
      </header>

      <main className={'st-main ch' + chapter}>
        <MapCanvas
          key={chapter}
          chapter={chapter}
          stars={story.stars}
          opened={story.opened}
          atIndex={atLocal}
          leader={leader ? byId.get(leader) ?? null : null}
          onOpened={id => { if (!story.opened.includes(id)) setStory({ opened: [...story.opened, id] }) }}
          onPick={i => { setStory({ at: inChapter[i].id }); setPanel(inChapter[i].id) }}
          onLocked={() => setToast(ui('stageLocked'))}
        />
        {/* เปลี่ยนบท */}
        <div className="st-chapters">
          <button className="st-chap-btn" disabled={chapter <= 1} onClick={() => setChapter(c => c - 1)} aria-label="prev">‹</button>
          <span className="st-chap-name">
            <b>{localName(CHAPTERS[chapter - 1].name)}</b>
            <small><IconStar size={11} filled />{chapterStars}/{inChapter.length * 3}</small>
          </span>
          <button className="st-chap-btn" disabled={chapter >= CHAPTERS.length} onClick={() => setChapter(c => c + 1)} aria-label="next">›</button>
        </div>
        {toast && <div className="st-toast">{toast}</div>}
      </main>

      {stage && (
        <StagePanel
          stage={stage}
          best={story.stars[stage.id] ?? 0}
          team={team}
          teams={col.teams}
          byId={byId}
          onTeam={id => setStory({ team: id })}
          onTeams={onTeams}
          onClose={() => setPanel(null)}
          onStart={() => { if (team) onPlay(stage.id, team.id) }}
        />
      )}

    </div>
  )
}

// ─────────────────────────────── แคนวาสแผนที่ ───────────────────────────────

function MapCanvas({ chapter, stars, opened, atIndex, leader, onOpened, onPick, onLocked }: {
  /** บทที่แสดง — เปลี่ยนบท = สร้างแคนวาสใหม่ (key) ตัวละคร/อนิเมชั่นเริ่มใหม่ */
  chapter: number
  stars: Record<string, number>
  opened: string[]
  atIndex: number
  leader: RangerData | null
  onOpened: (stageId: string) => void
  /** กดด่านที่ไปได้ → เปิดแผงทันที (ตัวละครเดินต่อเองด้านหลัง) */
  onPick: (index: number) => void
  onLocked: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  /** ด่านของบทนี้ · base = ลำดับของด่านแรกในทั้งเกม (ใช้เช็คสถานะด่าน) */
  const stages = stagesOf(chapter)
  const base = STAGES.indexOf(stages[0])
  const [assets, setAssets] = useState<Assets | null>(null)
  useEffect(() => { let alive = true; void loadMapAssets().then(a => { if (alive) setAssets(a) }); return () => { alive = false } }, [])

  // ค่าล่าสุดของ props (ลูปวาดอ่านจาก ref ไม่ต้องสร้างลูปใหม่ทุกครั้งที่เปลี่ยน)
  const live = useRef({ stars, opened, onOpened, onPick, onLocked })
  live.current = { stars, opened, onOpened, onPick, onLocked }
  /** เลขด่านแต่ละปุ่ม: 0 = บนหน้าปุ่ม · 1 = ขอบล่าง (ตัวละครอยู่ใกล้) — เลื่อนนุ่มๆ */
  const numDown = useRef<number[]>(stages.map((_, i) => (i === atIndex ? 1 : 0)))

  /** เวลาเริ่มอนิเมชั่นปลดล็อคของด่านปัจจุบัน (null = ยังไม่เริ่ม / ไม่ต้องเล่น) */
  const unlock = useRef<{ id: string; t0: number } | null>(null)
  /** ตัวละคร: ตำแหน่ง · ทิศ · เส้นทางที่เหลือ (ลำดับปุ่ม) */
  const walker = useRef({ x: BTN_POS[atIndex].x, y: BTN_POS[atIndex].y + STAND_DY, index: atIndex, path: [] as number[], face: 1 as 1 | -1 })
  /** ขนาด/ตำแหน่งของแผนที่บนแคนวาส (ใช้แปลงตำแหน่งคลิก) */
  const view = useRef({ s: 1, ox: 0, oy: 0 })

  // ── ตัวละครเดิน ──
  const walkerAssets = useRef<{ assets: RangerAssets; config: RangerConfig | null; player: SamPlayer; clip: string; stand: { x: number; y: number } } | null>(null)
  useEffect(() => {
    if (!leader) return
    let alive = true
    let loaded: RangerAssets | null = null
    void (async () => {
      let a: RangerAssets
      try { a = await loadRangerAssets(leader.item.id, []) } catch { return }
      if (!alive) { a.dispose(); return }
      loaded = a
      const config = leader.config
      const stand = config ? bodyPointsOf(a, config).stand : { x: 0, y: 0 }
      const player = new SamPlayer(a.sam)
      const idle = config?.clips.idle && a.sam.animations[config.clips.idle] ? config.clips.idle : a.sam.animNames.find(n => n !== '_all') ?? ''
      player.playClip(idle, { loop: true })
      const prev = walkerAssets.current
      walkerAssets.current = { assets: a, config, player, clip: idle, stand }
      // ปลดตัวเก่าหลังเฟรมถัดไป (ยังอาจถูกวาดอยู่)
      if (prev) setTimeout(() => prev.assets.dispose(), 100)
    })()
    return () => { alive = false; void loaded }
  }, [leader])
  useEffect(() => () => { walkerAssets.current?.assets.dispose() }, [])

  // ── ลูปวาด ──
  useEffect(() => {
    const cv = ref.current
    if (!cv || !assets) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(now - last, 100)
      last = now
      const w = cv.clientWidth, h = cv.clientHeight
      if (w < 2 || h < 2) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const s = Math.min(w / MAP_W, h / MAP_H)
      const ox = (w - MAP_W * s) / 2, oy = (h - MAP_H * s) / 2
      view.current = { s, ox, oy }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)
      step(dt, now)
      paint(ctx, now)
    }

    const step = (dt: number, now: number) => {
      const L = live.current
      // อนิเมชั่นปลดล็อค: เริ่มเมื่อด่านปัจจุบันยังไม่เคยเปิด และไม่ได้ค้างหน้าต่างสรุปผล
      const cur = currentIndex(L.stars)
      const curId = cur >= 0 && STAGES[cur].chapter === chapter ? STAGES[cur].id : null
      if (curId && !L.opened.includes(curId) && unlock.current?.id !== curId) unlock.current = { id: curId, t0: now }
      // เดิน
      const wk = walker.current
      const wa = walkerAssets.current
      if (wk.path.length) {
        const next = wk.path[0]
        const tx = BTN_POS[next].x, ty = BTN_POS[next].y + STAND_DY
        const dx = tx - wk.x, dy = ty - wk.y
        const d = Math.hypot(dx, dy)
        const move = WALK_SPEED * dt / 1000
        if (Math.abs(dx) > 1) wk.face = dx > 0 ? 1 : -1
        if (d <= move) {
          wk.x = tx; wk.y = ty; wk.index = next; wk.path.shift()
        } else { wk.x += dx / d * move; wk.y += dy / d * move }
      }
      // เลขด่าน: ตัวละครอยู่ใกล้ปุ่ม → เลื่อนลง · พ้นไปแล้ว → เลื่อนกลับขึ้น
      const k = Math.min(1, NUM_EASE * dt / 1000)
      BTN_POS.forEach((p, i) => {
        const near = Math.hypot(wk.x - p.x, wk.y - (p.y + STAND_DY)) < NUM_NEAR ? 1 : 0
        numDown.current[i] += (near - numDown.current[i]) * k
      })
      if (wa) {
        const walking = wk.path.length > 0
        const want = (walking ? wa.config?.clips.walk : null) ?? wa.config?.clips.idle ?? wa.clip
        if (want && want !== wa.player.clipName && wa.assets.sam.animations[want]) wa.player.playClip(want, { loop: true })
        wa.player.update(dt)
      }
    }

    const fxFrame = (fx: Fx, clip: string, t: number, loop: boolean) => {
      const frames = fx.sam.animations[clip]
      const pos = t * (fx.sam.animRate || 30)
      const i = Math.floor(pos)
      if (loop) return lerpSAMFrame(frames[i % frames.length], frames[(i + 1) % frames.length], pos - i)
      if (i >= frames.length - 1) return frames[frames.length - 1]
      return lerpSAMFrame(frames[i], frames[i + 1], pos - i)
    }

    const paint = (ctx: CanvasRenderingContext2D, now: number) => {
      const L = live.current
      const cur = currentIndex(L.stars)
      // เส้นทางประเชื่อมปุ่ม (ส่วนที่ผ่านแล้วสว่างกว่า)
      ctx.save()
      ctx.lineCap = 'round'
      for (let i = 0; i < BTN_POS.length - 1; i++) {
        const a = BTN_POS[i], b = BTN_POS[i + 1]
        const done = cur === -1 || base + i < cur
        ctx.setLineDash([2, 16])
        ctx.lineWidth = 9
        ctx.strokeStyle = done ? 'rgba(255, 224, 138, 0.9)' : 'rgba(148, 166, 207, 0.35)'
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      ctx.restore()

      stages.forEach((stg, i) => {
        const p = BTN_POS[i]
        const bx = p.x - BTN_W / 2, by = p.y - BTN_H / 2
        const kind: FxKind = stg.boss ? 'boss' : 'normal'
        const fx = assets.fx[kind]
        const st = stageState(base + i, L.stars)
        if (st === 'cleared') {
          ctx.drawImage(stg.boss ? assets.img.bossOff : assets.img.off, bx, by)
        } else {
          ctx.drawImage(stg.boss ? assets.img.bossOn : assets.img.on, bx, by)
          let frame = fx.sam.animations.ready[0]
          if (st === 'current') {
            const u = unlock.current
            // กำลังเล่นปลดล็อครอบนี้ → เล่นต่อให้จบลำดับ (แม้จะจำว่าเปิดแล้วระหว่างทาง) ไม่งั้นช่วงแตกถูกตัดทิ้ง
            if (u && u.id === stg.id) {
              const t = (now - u.t0) / 1000
              const rate = fx.sam.animRate || 30
              const tReady = fx.sam.animations.ready.length / rate
              const tStart = fx.sam.animations.start.length / rate
              if (t < tReady) frame = fxFrame(fx, 'ready', t, false)
              else if (t < tReady + tStart) frame = fxFrame(fx, 'start', t - tReady, false)
              else frame = fxFrame(fx, 'end', t - tReady - tStart, true)
              // แตกแล้ว (เลยช่วง ready) = กดเล่นได้ · จำไว้ว่าเปิดแล้ว (ครั้งหน้าวนลูปเลย)
              // เช็คด้วย ≥ ไม่ใช่เฉพาะช่วง start — เฟรมกระตุก/สลับแท็บพอดีก็ยังบันทึกได้
              if (t >= tReady && !L.opened.includes(stg.id)) L.onOpened(stg.id)
            } else if (L.opened.includes(stg.id)) frame = fxFrame(fx, 'end', now / 1000, true)
          }
          renderSAMFrame(ctx, frame, fx.sam.images, fx.sprites, bx - FX_OFFSET.x, by - FX_OFFSET.y, 1)
        }
        // เลขด่านทับขอบหน้าปุ่ม · ดาวที่ได้ใต้ปุ่ม
        ctx.save()
        ctx.font = '800 24px LineBold, Krub, ui-sans-serif, system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(8, 12, 30, 0.9)'
        ctx.fillStyle = st === 'locked' ? '#cbd5e1' : '#ffffff'
        // บนหน้าปุ่ม (หลบลงตอนตัวละครอยู่) · ปุ่มบอส/ปุ่มล็อค = ขอบล่างตลอด
        const down = stg.boss || st === 'locked' ? 1 : numDown.current[i]
        const ny = p.y + NUM_FACE_DY + (NUM_RIM_DY - NUM_FACE_DY) * down
        ctx.strokeText(String(stg.no), p.x, ny)
        ctx.fillText(String(stg.no), p.x, ny)
        const got = L.stars[stg.id] ?? 0
        if (got > 0) {
          ctx.font = '20px ui-sans-serif, system-ui'
          ctx.lineWidth = 4
          for (let k = 0; k < 3; k++) {
            const sx = p.x + (k - 1) * 20
            ctx.strokeText('★', sx, p.y + 50)
            ctx.fillStyle = k < got ? '#fcd34d' : 'rgba(148, 163, 184, 0.55)'
            ctx.fillText('★', sx, p.y + 50)
          }
        }
        ctx.restore()
      })

      // ตัวละคร (วาดทับปุ่ม) — บทที่ยังล็อคทั้งบท (ด่านแรกยังไปไม่ได้) = ไม่มีตัวละครยืน
      const wk = walker.current
      const wa = walkerAssets.current
      const f = wa?.player.smoothFrame ?? wa?.player.frame
      if (wa && f && !wa.assets.disposed && stageState(base, live.current.stars) !== 'locked') {
        renderSAMFrame(ctx, f, wa.assets.sam.images, wa.assets.sprites,
          wk.x - wa.stand.x * WALKER_ZOOM, wk.y - wa.stand.y * WALKER_ZOOM, WALKER_ZOOM, undefined, wk.face === -1, wa.stand.x)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [assets])

  // กดปุ่มด่าน: ไปได้ → เดินไปทีละปุ่ม · ยังล็อค → บอก
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const { s, ox, oy } = view.current
    const x = (e.clientX - r.left - ox) / s, y = (e.clientY - r.top - oy) / s
    const i = BTN_POS.findIndex(p => Math.hypot(p.x - x, p.y - y) <= TAP_RADIUS)
    if (i < 0) return
    const L = live.current
    const st = stageState(base + i, L.stars)
    const u = unlock.current
    // ด่านปัจจุบันที่ยังแตกไม่เสร็จ (ช่วง ready) = ยังล็อคอยู่
    const cracking = st === 'current' && !L.opened.includes(stages[i].id) && !(u && u.id === stages[i].id && performance.now() - u.t0 > 700)
    if (st === 'locked' || cracking) { L.onLocked(); return }
    L.onPick(i)
    // เดินไปทีละปุ่ม — กำลังเดินอยู่ก็เปลี่ยนเป้าได้ (เดินให้ถึงปุ่มที่กำลังมุ่งไปก่อน แล้วค่อยเลี้ยว)
    const wk = walker.current
    const from = wk.path.length ? wk.path[0] : wk.index
    const path = wk.path.length ? [from] : []
    if (from !== i) {
      const dir = i > from ? 1 : -1
      for (let k = from + dir; ; k += dir) { path.push(k); if (k === i) break }
    }
    wk.path = path
  }

  return <canvas ref={ref} className="st-canvas" onPointerDown={onDown} />
}

// ─────────────────────────────── แผงข้อมูลด่าน ───────────────────────────────

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="st-stars">
      {[0, 1, 2].map(k => <IconStar key={k} size={size} filled={k < n} className={k < n ? 'on' : ''} />)}
    </span>
  )
}

function GearIcon({ tpl }: { tpl: string }) {
  const g = GEAR_BY_ID[tpl]
  if (!g) return null
  return (
    <span className={`st-gear r-${g.rarity}`} title={localName(g.name) ?? tpl}>
      <img src={g.icon} alt="" />
    </span>
  )
}

/** ช่องฮีโร่เล็กในแผงด่าน */
function Mini({ id, byId }: { id: string | null; byId: Map<string, RangerData> }) {
  const col = useCollection()
  const d = id ? byId.get(id) : undefined
  return (
    <span className="st-mini">
      {d ? <CardArt d={d} small /> : null}
      {d && <i>Lv.{heroLevel(col, d.item.id)}</i>}
      {d && isFavorite(col, d.item.id) && <b className="st-mini-fav"><IconStar size={9} filled /></b>}
    </span>
  )
}

function StagePanel({ stage, best, team, teams, byId, onTeam, onTeams, onClose, onStart }: {
  stage: StageDef
  best: number
  team: TeamPreset | null
  teams: TeamPreset[]
  byId: Map<string, RangerData>
  onTeam: (id: string) => void
  onTeams: () => void
  onClose: () => void
  onStart: () => void
}) {
  const cleared = best > 0
  const fieldCount = team ? (['front-0', 'front-1', 'back-0', 'back-1', 'back-2'] as const).filter(k => team.slots[k] && byId.has(team.slots[k]!)).length : 0
  return (
    <div className="gr-modal st-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gr-modal-box st-panel" onClick={e => e.stopPropagation()}>
        <header className="gr-modal-head">
          <button className="gr-icobtn" onClick={onClose} title={ui('close')}><IconClose size={16} /></button>
          <h2>{stage.label}{stage.boss && <i className="st-boss-tag">{ui('stageBoss')}</i>}</h2>
          <span className="st-best">{ui('stageBest')} <Stars n={best} /></span>
        </header>

        <div className="st-panel-body">
          <section className="st-sec">
            <h5>{ui('stageEnemies')}</h5>
            <div className="st-enemies">
              {stage.enemies.map(en => {
                const d = byId.get(en.id)
                return (
                  <div key={en.slot} className={'st-enemy' + (en.boss ? ' boss' : '')} title={d ? nameOf(d) : en.id}>
                    {d ? <CardArt d={d} small flip /> : <span className="st-enemy-missing">?</span>}
                    <i className="st-enemy-lv">Lv.{en.level}</i>
                    {en.boss && <i className="st-enemy-boss">{ui('stageBoss')}</i>}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="st-sec">
            <h5>{ui('stageGoals')}</h5>
            <ul className="st-goals">
              <li><Stars n={1} size={13} />{ui('star1')}</li>
              <li><Stars n={2} size={13} />{ui('star2')}</li>
              <li><Stars n={3} size={13} />{ui('star3', { n: String(stage.turnGoal) })}</li>
            </ul>
          </section>

          <section className="st-sec">
            <h5>{ui('stageRewards')}</h5>
            <div className="st-rewards">
              <span className="st-rw gold"><IconCoin size={15} />{stage.gold.toLocaleString()}</span>
              {!cleared && <span className="st-rw gem"><IconGem size={15} />{stage.firstGem} <small>{ui('stageFirstClear')}</small></span>}
              <span className="st-rw drops">
                {stage.drops.map(t => <GearIcon key={t} tpl={t} />)}
                <small>{cleared ? ui('stageDropChance', { n: String(Math.round(DROP_CHANCE * 100)) }) : ui('stageFirstClear')}</small>
              </span>
            </div>
          </section>

          <section className="st-sec st-team">
            <h5>{ui('stageTeam')}</h5>
            {teams.length ? (
              <>
                <select value={team?.id ?? ''} onChange={e => onTeam(e.target.value)}>
                  {teams.map((t, i) => <option key={t.id} value={t.id}>{teamName(t, i)}</option>)}
                </select>
                {team && (
                  <div className="st-team-line">
                    <div className="st-team-row">{TEAM_KEYS.slice(0, 5).map(k => <Mini key={k} id={team.slots[k]} byId={byId} />)}</div>
                    <div className="st-team-sup">
                      <small>{ui('rowSpecial')}</small>
                      <div className="st-team-row sup">{TEAM_KEYS.slice(5).map(k => <Mini key={k} id={team.slots[k]} byId={byId} />)}</div>
                    </div>
                  </div>
                )}
                {!fieldCount && <p className="st-warn">{ui('stageEmptyTeam')}</p>}
              </>
            ) : (
              <div className="st-noteam">
                <p>{ui('stageNoTeam')}</p>
                <button className="gr-btn ghost" onClick={onTeams}>{ui('stageMakeTeam')}</button>
              </div>
            )}
          </section>
        </div>

        <footer className="st-panel-foot">
          <span className="st-energy">
            <IconBolt size={14} />{ui('stageEnergy', { n: String(stage.energy) })}
            {!CHARGE_ENERGY && <small>{ui('stageEnergyFree')}</small>}
          </span>
          <button className="gr-btn st-start" disabled={!team || !fieldCount} onClick={onStart}>
            <IconSwords size={18} />{ui('stageStart')}
          </button>
        </footer>
      </div>
    </div>
  )
}
