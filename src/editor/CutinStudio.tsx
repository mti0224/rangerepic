// ====================================================
// CutinStudio — เมนู "คัตซีน" ของ editor (แท็บแยก)
//
// กลางจอ (CutinStage) = คัตซีนจริงขนาดเต็ม เห็นเหมือนในจอดวลเป๊ะ
//   ลากตัวละคร = ย้ายตำแหน่ง · ล้อเมาส์ = ซูมเข้า/ออกตรงจุดที่ชี้ · ปุ่มลูกศร = ขยับทีละนิด (Shift = มากขึ้น)
//   แถบรูปเฟรมด้านล่าง = คลิกเลือกท่าที่จะจับภาพ · ▶ = เล่นทั้งลำดับ
// ขวา (CutinPanel) = เลือกสกิล · เปิด/ปิด · เลเยอร์ (ตัวเรนเจอร์ / กระสุน bul) · ข้อความ · ซูม · รีเซ็ต
// มีกระสุน → เลือกได้ว่าจะปรับ "ภาพรวม" (ลาก = ย้ายทั้งภาพ · แถบเฟรม = ท่าของตัว) หรือ "กระสุน" (ลาก = ย้ายกระสุน · แถบเฟรม = เฟรมกระสุน)
// ค่าที่เก็บ = CutinConfig (lib/cutin.ts) — ใช้ตัววาดเดียวกับจอดวล
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CUTIN_FOCUS_PX, CUTIN_SEC, CUTIN_SIZE_MAX, CUTIN_SIZE_MIN, bulletFrames, clampCutin, cutinFrames, defaultBullet, defaultCutin,
  frameBounds, paintCutin, renderCutinArt, type CutinConfig,
} from '@/lib/cutin'
import type { SAMParser } from '@/lib/animation/samParser'
import type { SpriteMap } from '@/lib/animation/samRenderer'
import { DEFAULT_BULLET } from '@/lib/rangerConfig'
import { renderSAMFrame } from '@/lib/animation/samRenderer'
import type { GameInfo } from '@/lib/rangerApi'
import type { RangerAssets } from '@/lib/rangerAssets'
import type { RangerConfig } from '@/lib/rangerConfig'
import type { SkillSlot } from '@/lib/skills'
import { e, gameName, getELang, useELang } from './i18n'
import { properNameZhTw } from '@/play/zhNames'

const W = 1280
const H = 720
/** ภาพนิ่งตอนแก้ = ช่วงที่ทุกอย่างขึ้นครบ */
const STILL_T = 1.2
/** จุดโฟกัสบนจอคัตซีน (ตรงกับ paintCutin: กลางจอ + 90 ไปทางฝั่งผู้ใช้, สูงขึ้น 8) */
const focusScreen = (side: 'left' | 'right') => ({ x: W / 2 + (side === 'left' ? 90 : -90), y: H / 2 - 8 })
const THUMB = 64

export const SLOTS: SkillSlot[] = ['skill1', 'skill2']

/** ชื่อสกิลจากข้อมูลเกม (สกิล 2 บางตัวเก็บในช่อง skill3) */
export function skillNameOf(info: GameInfo | null, slot: SkillSlot): string {
  const s = slot === 'skill1' ? info?.skills.skill1 : info?.skills.skill2 ?? info?.skills.skill3
  return (getELang() === 'zh' ? properNameZhTw(s?.code ?? '') : null) ?? gameName(s?.name) ?? e(slot === 'skill1' ? 'tabSkill1' : 'tabSkill2')
}

/** ไฟล์กระสุนที่โหลดไว้ เรียงชื่อ · ของสกิลนี้ (ตามค่ามาตรฐาน / ที่ตั้งไว้ในท่า) ขึ้นก่อน */
export function bulletFilesFor(assets: RangerAssets, config: RangerConfig, slot: SkillSlot): { file: string; own: boolean }[] {
  const own = config.actions[slot].projectile?.asset ?? DEFAULT_BULLET[slot]
  return Object.keys(assets.bullets).sort().map(file => ({ file, own: file === own })).sort((a, b) => Number(b.own) - Number(a.own))
}

const clampSize = (n: number) => Math.round(Math.max(CUTIN_SIZE_MIN, Math.min(CUTIN_SIZE_MAX, n)))

// ─────────────────────────────── กลางจอ ───────────────────────────────

export function CutinStage({ assets, config, info, slot, onChange: emit }: {
  assets: RangerAssets
  config: RangerConfig
  info: GameInfo | null
  slot: SkillSlot
  onChange: (next: CutinConfig | undefined) => void
}) {
  useELang()
  const { sam, sprites } = assets
  const action = config.actions[slot]
  const cfg = config.cutins?.[slot]
  // ทุกการแก้ผ่าน clampCutin — ตัวละครไม่หลุดออกนอกคัตซีน
  const onChange = (next: CutinConfig | undefined) => emit(next && clampCutin(assets, action, next))
  const frames = useMemo(() => cutinFrames(sam, action), [sam, action])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [enemySide, setEnemySide] = useState(false)
  const [playing, setPlaying] = useState(false)
  const drag = useRef<{ x: number; y: number; focus: { x: number; y: number }; offset: { x: number; y: number } | null } | null>(null)
  /** ปรับอะไรอยู่: ภาพรวม (ย้ายทั้งภาพ + เฟรมของตัว) หรือกระสุน (ย้ายกระสุน + เฟรมกระสุน) */
  const [target, setTarget] = useState<'all' | 'bullet'>('all')
  const hasBullet = !!cfg?.bullet && !!assets.bullets[cfg.bullet.file]
  const hasBody = cfg?.body !== false
  const editBullet = hasBullet && (target === 'bullet' || !hasBody)
  const moveBullet = hasBullet && hasBody && target === 'bullet'
  const [dragging, setDragging] = useState(false)
  const side: 'left' | 'right' = enemySide ? 'right' : 'left'

  const art = useMemo(() => (cfg ? renderCutinArt(assets, action, cfg, enemySide) : null), [sam, sprites, action, cfg, enemySide])
  const title = cfg?.title?.trim() || skillNameOf(info, slot)

  // ── วาด (นิ่ง / เล่น) ──
  useEffect(() => {
    const g = canvasRef.current?.getContext('2d')
    if (!g) return
    const draw = (t: number) => {
      g.setTransform(1, 0, 0, 1, 0, 0)
      const bg = g.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#1e3a5f')
      bg.addColorStop(1, '#14532d')
      g.fillStyle = bg
      g.fillRect(0, 0, W, H)
      if (!art) return
      paintCutin(g, { art, title, element: config.element, side }, t)
      if (!playing) {
        // เครื่องหมายจุดโฟกัส (ช่วยกะตำแหน่ง · ไม่มีในเกม)
        const f = focusScreen(side)
        g.strokeStyle = 'rgba(255,255,255,0.55)'
        g.lineWidth = 1.5
        g.setLineDash([6, 6])
        g.strokeRect(f.x - CUTIN_FOCUS_PX / 2, f.y - CUTIN_FOCUS_PX / 2, CUTIN_FOCUS_PX, CUTIN_FOCUS_PX)
        g.setLineDash([])
      }
    }
    if (!playing) { draw(STILL_T); return }
    let raf = 0
    const start = performance.now()
    const tick = () => {
      const t = (performance.now() - start) / 1000
      draw(Math.min(t, CUTIN_SEC))
      if (t < CUTIN_SEC + 0.4) raf = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [art, title, config.element, side, playing])

  // ล้อเมาส์ = ซูม (ผูกเองแบบ non-passive ไม่ให้หน้าเลื่อน)
  const wheelRef = useRef<(ev: WheelEvent) => void>(() => {})
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const h = (ev: WheelEvent) => { ev.preventDefault(); wheelRef.current(ev) }
    cv.addEventListener('wheel', h, { passive: false })
    return () => cv.removeEventListener('wheel', h)
  }, [])

  const toCanvas = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) }
  }
  /** ทีมขวากลับด้าน → ทิศแกน x ของโลกกลับ */
  const flipX = enemySide ? -1 : 1

  wheelRef.current = (ev: WheelEvent) => {
    if (!cfg) return
    // ซูมรอบจุดที่ชี้: จุดโลกใต้เมาส์อยู่ที่เดิม
    const p = toCanvas(ev.clientX, ev.clientY)
    const f = focusScreen(side)
    const k = CUTIN_FOCUS_PX / cfg.size
    const size = clampSize(cfg.size * (ev.deltaY > 0 ? 1.1 : 1 / 1.1))
    const k2 = CUTIN_FOCUS_PX / size
    const wx = cfg.focus.x + flipX * (p.x - f.x) / k, wy = cfg.focus.y + (p.y - f.y) / k
    onChange({ ...cfg, size, focus: { x: Math.round(wx - flipX * (p.x - f.x) / k2), y: Math.round(wy - (p.y - f.y) / k2) } })
  }

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cfg || playing) return
    try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* ไม่เป็นไร */ }
    ev.currentTarget.focus()
    const p = toCanvas(ev.clientX, ev.clientY)
    drag.current = { x: p.x, y: p.y, focus: { ...cfg.focus }, offset: cfg.bullet ? { ...cfg.bullet.offset } : null }
    setDragging(true)
  }
  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || !cfg) return
    const p = toCanvas(ev.clientX, ev.clientY)
    const k = CUTIN_FOCUS_PX / cfg.size
    if (moveBullet && d.offset && cfg.bullet) {
      // ลากกระสุนไปทางขวา = เยื้องไปทางขวา (ฝั่งศัตรูกลับด้าน)
      onChange({ ...cfg, bullet: { ...cfg.bullet, offset: { x: Math.round(d.offset.x + flipX * (p.x - d.x) / k), y: Math.round(d.offset.y + (p.y - d.y) / k) } } })
      return
    }
    // ลากภาพไปทางขวา = จุดโฟกัสในโลกเลื่อนไปทางซ้าย
    onChange({ ...cfg, focus: { x: Math.round(d.focus.x - flipX * (p.x - d.x) / k), y: Math.round(d.focus.y - (p.y - d.y) / k) } })
  }
  const onUp = () => { drag.current = null; setDragging(false) }
  const onKey = (ev: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!cfg) return
    const step = ev.shiftKey ? 10 : 2
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[ev.key]
    if (!d) return
    ev.preventDefault()
    if (moveBullet && cfg.bullet) {
      const o = cfg.bullet.offset
      onChange({ ...cfg, bullet: { ...cfg.bullet, offset: { x: o.x - d[0] * flipX, y: o.y - d[1] } } })
      return
    }
    onChange({ ...cfg, focus: { x: cfg.focus.x + d[0] * flipX, y: cfg.focus.y + d[1] } })
  }

  if (!frames.length) return <div className="placeholder">{e('noClipToCapture')}</div>

  return (
    <div className="cutin-studio">
      <div className="cutin-stage-box">
        <canvas
          ref={canvasRef}
          className="cutin-stage"
          width={W}
          height={H}
          tabIndex={0}
          style={{ cursor: cfg ? (dragging ? 'grabbing' : 'grab') : 'default' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        />
        {cfg?.enabled && !art && (
          <div className="cutin-off"><p>{e('frameNoArt')}</p></div>
        )}
        {!cfg?.enabled && (
          <div className="cutin-off">
            <p>{e('noCutinFor', { skill: skillNameOf(info, slot) })}</p>
            <button className="primary" onClick={() => onChange(cfg ? { ...cfg, enabled: true } : defaultCutin(sam, sprites, action))}>
              {e('enableCutin')}
            </button>
          </div>
        )}
      </div>
      {cfg?.enabled && (
        <>
          <div className="transport">
            <button onClick={() => setPlaying(true)} disabled={playing}>{e('playPreview')}</button>
            <label className="check"><input type="checkbox" checked={enemySide} onChange={ev => setEnemySide(ev.target.checked)} /> {e('enemySideView')}</label>
            {hasBullet && hasBody && (
              <div className="seg seg-inline">
                <button className={target === 'all' ? 'sel' : ''} onClick={() => setTarget('all')}>{e('adjustAll')}</button>
                <button className={target === 'bullet' ? 'sel' : ''} onClick={() => setTarget('bullet')}>{e('adjustBullet', { f: cfg.bullet!.file })}</button>
              </div>
            )}
            <span className="hint-inline">
              {moveBullet ? e('dragBullet') : e('dragAll')} · {e('cutinHintTail')}
            </span>
          </div>
          {(() => {
            // เลเยอร์ที่กำลังเลือกเฟรม: กระสุน (ตอนปรับกระสุน / เปิดแค่กระสุน) หรือตัวเรนเจอร์
            const bl = editBullet && cfg.bullet ? cfg.bullet : null
            const list = bl ? bulletFrames(assets, bl.file) : frames
            const cur = Math.max(0, Math.min(list.length - 1, bl ? bl.frame : cfg.frame))
            const pick = (i: number) => {
              const n = Math.max(0, Math.min(list.length - 1, i))
              onChange(bl ? { ...cfg, bullet: { ...bl, frame: n } } : { ...cfg, frame: n })
            }
            return (
              <>
                <div className="frame-scrub">
                  <span className="scrub-label">{bl ? e('bulletFrameLabel', { f: bl.file }) : e('bodyFrameLabel')}</span>
                  <button title={e('prevFrame')} disabled={cur <= 0} onClick={() => pick(cur - 1)}>◀</button>
                  <input type="range" min={0} max={Math.max(0, list.length - 1)} value={cur} onChange={ev => pick(Number(ev.target.value))} />
                  <button title={e('nextFrame')} disabled={cur >= list.length - 1} onClick={() => pick(cur + 1)}>▶</button>
                  <span className="meta">{cur + 1}/{list.length} · {list[cur]?.clip} #{list[cur]?.index}</span>
                </div>
                {bl ? (
                  <FrameStrip
                    key={'bul-' + bl.file}
                    sam={assets.bullets[bl.file].sam}
                    sprites={assets.bullets[bl.file].sprites}
                    frames={list}
                    fitAll
                    selected={cur}
                    onSelect={pick}
                  />
                ) : (
                  <FrameStrip key="body" sam={sam} sprites={sprites} frames={frames} selected={cur} onSelect={pick} />
                )}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}

/** แถบรูปย่อทุกเฟรม — คลิกเลือก · แบ่งกลุ่มตามคลิป · fitAll = ย่อให้พอดีทุกเฟรม (กระสุนที่เฟรมแรกเล็ก/ว่าง) */
function FrameStrip({ sam, sprites, frames, selected, onSelect, fitAll = false }: {
  sam: SAMParser
  sprites: SpriteMap
  frames: ReturnType<typeof cutinFrames>
  selected: number
  onSelect: (i: number) => void
  fitAll?: boolean
}) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])
  const selRef = useRef<HTMLButtonElement | null>(null)
  // มาตราส่วนเดียวกันทุกเฟรม (เทียบเฟรมแรก) — เห็นตัวละครขยับจริง ไม่ซูมเข้าออกไปมา
  const view = useMemo(() => {
    let b: ReturnType<typeof frameBounds> = null
    for (const f of fitAll ? frames : frames.slice(0, 1)) {
      const fb = frameBounds(sam, sprites, f.frame)
      if (fb) b = b ? { x0: Math.min(b.x0, fb.x0), y0: Math.min(b.y0, fb.y0), x1: Math.max(b.x1, fb.x1), y1: Math.max(b.y1, fb.y1) } : fb
    }
    if (!b) return { k: 0.2, cx: 0, cy: -100 }
    return { k: (THUMB * 0.8) / Math.max(b.x1 - b.x0, b.y1 - b.y0, 1), cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }
  }, [sam, sprites, frames, fitAll])
  useEffect(() => {
    frames.forEach((f, i) => {
      const cv = refs.current[i]
      const g = cv?.getContext('2d')
      if (!cv || !g) return
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, THUMB * 2, THUMB * 2)
      renderSAMFrame(g, f.frame, sam.images, sprites, THUMB - view.cx * view.k * 2, THUMB - view.cy * view.k * 2, view.k * 2)
      g.setTransform(1, 0, 0, 1, 0, 0)
    })
  }, [sam, sprites, frames, view])
  useEffect(() => { selRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [selected])
  return (
    <div className="frame-strip">
      {frames.map((f, i) => (
        <button
          key={i}
          ref={i === selected ? selRef : undefined}
          className={'frame-thumb' + (i === selected ? ' sel' : '') + (i > 0 && frames[i - 1].clip !== f.clip ? ' clip-start' : '')}
          title={`${f.clip} #${f.index}`}
          onClick={() => onSelect(i)}
        >
          <canvas ref={el => { refs.current[i] = el }} width={THUMB * 2} height={THUMB * 2} style={{ width: THUMB, height: THUMB }} />
          <span>{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────── แผงขวา ───────────────────────────────

export function CutinPanel({ assets, config, info, slot, onSlot, onChange }: {
  assets: RangerAssets
  config: RangerConfig
  info: GameInfo | null
  slot: SkillSlot
  onSlot: (s: SkillSlot) => void
  onChange: (slot: SkillSlot, next: CutinConfig | undefined) => void
}) {
  useELang()
  const cfg = config.cutins?.[slot]
  const action = config.actions[slot]
  const set = (patch: Partial<CutinConfig>) => { if (cfg) onChange(slot, clampCutin(assets, action, { ...cfg, ...patch })) }
  const files = bulletFilesFor(assets, config, slot)
  const hasBody = cfg?.body !== false
  const bullet = cfg?.bullet && assets.bullets[cfg.bullet.file] ? cfg.bullet : null
  const zoom = cfg ? CUTIN_FOCUS_PX / cfg.size : 1
  return (
    <div className="cutin-panel">
      <div className="seg">
        {SLOTS.map(s => (
          <button key={s} className={s === slot ? 'sel' : ''} onClick={() => onSlot(s)}>
            {e(s === 'skill1' ? 'tabSkill1' : 'tabSkill2')}
            <small>{config.cutins?.[s]?.enabled ? e('hasCutin') : e('noCutinShort')}</small>
          </button>
        ))}
      </div>
      <p className="note" style={{ margin: 0 }}>{skillNameOf(info, slot)}</p>

      <label className="check">
        <input type="checkbox" checked={!!cfg?.enabled}
          onChange={ev => onChange(slot, ev.target.checked
            ? (cfg ? { ...cfg, enabled: true } : defaultCutin(assets.sam, assets.sprites, action))
            : cfg ? { ...cfg, enabled: false } : undefined)} />
        <span>{e('cutinEnable')}</span>
      </label>

      {cfg?.enabled && (
        <>
          <div className="cutin-layers">
            <b>{e('layers')}</b>
            <label className="check">
              <input type="checkbox" checked={hasBody} disabled={hasBody && !bullet}
                onChange={ev => set({ body: ev.target.checked })} />
              <span>{e('layerBody')}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={!!bullet} disabled={!files.length || (!!bullet && !hasBody)}
                onChange={ev => set({ bullet: ev.target.checked ? defaultBullet(assets, files[0].file, cfg.focus) : null })} />
              <span>{e('layerBullet')}</span>
              {bullet && (
                <select value={bullet.file} onChange={ev => set({ bullet: defaultBullet(assets, ev.target.value, cfg.focus) })}>
                  {files.map(f => <option key={f.file} value={f.file}>{f.file}{f.own ? e('ownBullet') : ''}</option>)}
                </select>
              )}
            </label>
            {!files.length && <span className="note" style={{ margin: 0 }}>{e('noBulletForThis')}</span>}
            <span className="note" style={{ margin: 0 }}>{e('layerNote')}</span>
          </div>
          <label className="cutin-row">
            <span>{e('cutinTitle')}</span>
            <input type="text" value={cfg.title ?? ''} placeholder={skillNameOf(info, slot)}
              onChange={ev => set({ title: ev.target.value === '' ? null : ev.target.value })} />
            <button title={e('backToSkillName')} disabled={cfg.title === null} onClick={() => set({ title: null })}>↺</button>
          </label>
          <label className="cutin-row">
            <span>{e('zoom')}</span>
            <input type="range" min={0.3} max={6} step={0.05} value={zoom}
              onChange={ev => set({ size: clampSize(CUTIN_FOCUS_PX / Number(ev.target.value)) })} />
            <span className="meta">×{zoom.toFixed(2)}</span>
          </label>
          <div className="cutin-actions">
            <button onClick={() => {
              const base = defaultCutin(assets.sam, assets.sprites, action)
              onChange(slot, { ...base, title: cfg.title, body: cfg.body, bullet: bullet ? defaultBullet(assets, bullet.file, base.focus) : null })
            }}>{e('resetPosZoomFrame')}</button>
          </div>
          <p className="note">
            {e('cutinNote1')}<br />
            {e('cutinNote2')}
          </p>
        </>
      )}
    </div>
  )
}
