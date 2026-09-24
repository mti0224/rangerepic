// ====================================================
// EditorStage — canvas ของ editor
//   • เล่นอนิเมชั่นตาม SamPlayer ที่ parent ส่งมา
//   • วาดจุด anchor เป็นหมุดที่ "ลากด้วยเมาส์" ได้ (ไม่ใช่พิมพ์ตัวเลข)
//   • มีหุ่นเป้าฝั่งขวาไว้วางจุดที่กระสุนไปตก
//   • ลากพื้นหลัง = เลื่อนมุมมอง, สกรอลล์ = ซูม
// ====================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { renderGrid, autoFit } from '@/lib/animation/samRenderer'
import type { RangerAssets } from '@/lib/rangerAssets'
import type { Vec2 } from '@/lib/rangerConfig'
import type { PreviewScene } from './previewScene'

export interface AnchorHandle {
  key: string
  label: string
  color: string
  value: Vec2
  /**
   * sprite — พิกัดดิบในไฟล์ .sam (มีแค่ anchors.ground)
   * self   — เทียบจากเท้าของตัวเรา
   * target — เทียบจากเท้าของหุ่นเป้า
   */
  space: 'sprite' | 'self' | 'target'
}

interface View { zoom: number; ox: number; oy: number }

interface Props {
  assets: RangerAssets
  scene: PreviewScene | null
  playing: boolean
  handles: AnchorHandle[]
  targetDistance: number // ระยะหุ่นเป้า (world unit)
  showTarget: boolean
  ground: Vec2           // anchors.ground ของตัวที่กำลังแก้
  groundLocked: boolean  // true = ตัวละครถูกเลื่อนให้เท้าตรงจุดกำเนิด (เหมือนในแมพ)
  impactDistance: number // ระยะถึงเป้าที่ท่านี้เล็งจริง — ใช้วางหมุดจุดตก
  selfOffset: Vec2       // ผู้โจมตีเดินไปยืนที่ไหน (ท่าที่ติ๊กเดินเข้าไป) — หมุดที่เทียบตัวเราย้ายตาม
  onAnchorChange: (key: string, v: Vec2) => void
  onTick: (globalFrame: number, totalFrames: number) => void
}

const HANDLE_R = 7   // รัศมีหมุดบนจอ (พิกเซล canvas)
const GRAB_R = 16    // ระยะที่ถือว่าจับหมุดติด — กว้างกว่าตัวหมุดให้กดง่าย
const LABEL_FONT = '11px LineBold, Krub, ui-sans-serif, system-ui'
const LABEL_PAD_X = 6
const LABEL_H = 18
const LABEL_GAP = 3

interface Box { x: number; y: number; w: number; h: number }

/** ตำแหน่งบนจอของหมุด 1 อัน + กล่องป้ายชื่อที่จัดวางไม่ให้ทับกันแล้ว */
interface HandleLayout { key: string; hx: number; hy: number; label: Box }

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w + LABEL_GAP && b.x < a.x + a.w + LABEL_GAP &&
  a.y < b.y + b.h + LABEL_GAP && b.y < a.y + a.h + LABEL_GAP

/**
 * จัดวางป้ายชื่อหมุด — ลองวางรอบหมุด 4 ทิศก่อน ถ้าชนป้ายอื่นหรือหมุดอื่นทุกทิศ
 * ค่อยเลื่อนลงไปเรื่อยๆ จนเจอที่ว่าง (มีเส้นโยงกลับไปหาหมุด)
 */
export function layoutLabels(
  ctx: CanvasRenderingContext2D, items: { key: string; label: string; hx: number; hy: number }[],
): HandleLayout[] {
  ctx.font = LABEL_FONT
  const placed: Box[] = []
  const dots: Box[] = items.map(it => ({ x: it.hx - HANDLE_R, y: it.hy - HANDLE_R, w: HANDLE_R * 2, h: HANDLE_R * 2 }))
  const out: HandleLayout[] = []

  for (const it of items) {
    const w = ctx.measureText(it.label).width + LABEL_PAD_X * 2
    const candidates: Box[] = [
      { x: it.hx + 12, y: it.hy - LABEL_H - 4, w, h: LABEL_H },      // ขวาบน
      { x: it.hx + 12, y: it.hy + 4, w, h: LABEL_H },                // ขวาล่าง
      { x: it.hx - 12 - w, y: it.hy - LABEL_H - 4, w, h: LABEL_H },  // ซ้ายบน
      { x: it.hx - 12 - w, y: it.hy + 4, w, h: LABEL_H },            // ซ้ายล่าง
    ]
    const free = (b: Box) => !placed.some(o => overlap(b, o)) && !dots.some(o => overlap(b, o))
    let box = candidates.find(free)
    if (!box) {
      box = { ...candidates[0] }
      for (let i = 0; i < 30 && !free(box); i++) box.y += LABEL_H + LABEL_GAP
    }
    placed.push(box)
    out.push({ key: it.key, hx: it.hx, hy: it.hy, label: box })
  }
  return out
}

export default function EditorStage({
  assets, scene, playing, handles, targetDistance, showTarget, ground, groundLocked, impactDistance, selfOffset,
  onAnchorChange, onTick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<View>({ zoom: 1, ox: 450, oy: 400 })
  const viewRef = useRef(view)
  viewRef.current = view

  const dragRef = useRef<
    | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
    | { kind: 'handle'; key: string; dx: number; dy: number }
    | null
  >(null)
  const [hover, setHover] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)
  hoverRef.current = hover
  const handlesRef = useRef(handles)
  handlesRef.current = handles
  // ตำแหน่งหมุดและป้ายที่วาดไปล่าสุด — ใช้ตัดสินว่าคลิกโดนอะไร ให้ตรงกับที่เห็นบนจอเป๊ะ
  const layoutRef = useRef<HandleLayout[]>([])

  // เก็บใน ref เพราะ ground เป็น object ใหม่ทุกครั้งที่แก้ config
  // ถ้าผูกเป็น dependency ของลูปวาด ลูปจะถูกรีสตาร์ททุกครั้งที่ลากเมาส์ → อนิเมชั่นสะดุด
  const frameCtxRef = useRef({ ground, groundLocked, targetDistance, impactDistance, selfOffset })
  frameCtxRef.current = { ground, groundLocked, targetDistance, impactDistance, selfOffset }

  // ── จัดมุมมองให้พอดีเมื่อเปลี่ยนเรนเจอร์ ──
  // ต้องเผื่อให้หุ่นเป้าที่อยู่ห่างออกไปอยู่ในจอด้วย ไม่ใช่พอดีแค่ตัวเดียว
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const fit = autoFit(assets.sam, assets.sprites, cv.width, cv.height)
    if (!fit) return
    const span = frameCtxRef.current.targetDistance + 260   // ระยะ + เผื่อความกว้างตัวละครสองฝั่ง
    const zoom = Math.min(fit.zoom * 0.7, (cv.width * 0.92) / span)
    setView({ zoom, ox: cv.width * 0.16, oy: cv.height * 0.72 })
  }, [assets])

  const toWorld = useCallback((sx: number, sy: number): Vec2 => {
    const v = viewRef.current
    return { x: (sx - v.ox) / v.zoom, y: (sy - v.oy) / v.zoom }
  }, [])

  // ค่าที่ต้องบวกเข้ากับค่าที่เก็บไว้ เพื่อได้พิกัด world บนเวที
  //   groundLocked = true  → ตัวละครถูกเลื่อน -ground แล้ว เท้าจึงอยู่ที่ (0,0)
  //   groundLocked = false → ตัวละครอยู่ที่ origin ดิบ เท้าจึงอยู่ที่ ground
  const spaceOffset = useCallback((h: AnchorHandle): Vec2 => {
    const { ground: g, groundLocked: locked, impactDistance: td, selfOffset: so } = frameCtxRef.current
    switch (h.space) {
      case 'sprite': return locked ? { x: -g.x, y: -g.y } : { x: 0, y: 0 }
      case 'self':   return locked ? { x: so.x, y: so.y } : { x: g.x, y: g.y }
      case 'target': return { x: td, y: 0 }
    }
  }, [])

  const handleWorldPos = useCallback((h: AnchorHandle): Vec2 => {
    const o = spaceOffset(h)
    return { x: h.value.x + o.x, y: h.value.y + o.y }
  }, [spaceOffset])

  // ── วาดทุกเฟรม ──
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(now - last, 100)   // กันกระโดดตอนสลับแท็บเบราว์เซอร์
      last = now
      try {
        paint(dt)
      } catch (err) {
        // เฟรมเดียวพังต้องไม่ทำให้ลูปตายถาวร — ล้าง transform ที่อาจค้างแล้วไปต่อเฟรมหน้า
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        console.error('[EditorStage] วาดเฟรมไม่สำเร็จ', err)
      }
      raf = requestAnimationFrame(draw)
    }

    const paint = (dt: number) => {
      if (playing && scene) scene.update(dt)

      const v = viewRef.current
      // รีเซ็ต transform ก่อนล้างเสมอ — ถ้ามี transform ค้างจากเฟรมก่อน clearRect จะล้างผิดพื้นที่
      // แล้วภาพเก่าจะค้างซ้อนอยู่ข้างใต้
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, cv.width, cv.height)
      renderGrid(ctx, cv.width, cv.height, v.ox, v.oy, v.zoom)

      // เส้นพื้น = ระดับที่ตัวละครจะยืนในแมพ
      ctx.strokeStyle = 'rgba(120,200,160,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, Math.round(v.oy) + 0.5)
      ctx.lineTo(cv.width, Math.round(v.oy) + 0.5)
      ctx.stroke()

      // โหมดตั้งหมุด: ตัวละครยังอยู่ที่ origin ดิบ วาดเส้นไกด์ผ่านหมุดจุดยืน
      // เพื่อให้เล็งว่าหมุดตรงกับเท้าจริงหรือยัง
      const fc = frameCtxRef.current
      if (!fc.groundLocked) {
        const gx = Math.round(v.ox + fc.ground.x * v.zoom) + 0.5
        const gy = Math.round(v.oy + fc.ground.y * v.zoom) + 0.5
        ctx.strokeStyle = 'rgba(74,222,128,0.45)'
        ctx.setLineDash([6, 5])
        ctx.beginPath()
        ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy)
        ctx.moveTo(gx, 0); ctx.lineTo(gx, cv.height)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // เงาใต้เท้าเป้าหมาย — ทำให้เห็นว่ามันยืนตรงไหนแม้ตัวจะบังอยู่
      if (showTarget) {
        const tx = v.ox + fc.targetDistance * v.zoom
        ctx.fillStyle = 'rgba(255,120,120,0.28)'
        ctx.beginPath()
        ctx.ellipse(tx, v.oy, 24 * v.zoom, 7 * v.zoom, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // ตัวโจมตี + เป้าหมาย + กระสุน + ตัวเลขดาเมจ
      if (scene) scene.render(ctx, v.ox, v.oy, v.zoom)

      // ── หมุด anchor ──
      const d = dragRef.current
      const activeKey = d && d.kind === 'handle' ? d.key : hoverRef.current
      const layout = layoutLabels(ctx, handlesRef.current.map(h => {
        const w = handleWorldPos(h)
        return { key: h.key, label: h.label, hx: v.ox + w.x * v.zoom, hy: v.oy + w.y * v.zoom }
      }))
      layoutRef.current = layout
      const byKey = new Map(handlesRef.current.map(h => [h.key, h]))

      // วาดตัวที่กำลังชี้/ลากทีหลังสุด ให้อยู่บนสุดเสมอ
      const order = [...layout].sort((a, b) => Number(a.key === activeKey) - Number(b.key === activeKey))
      for (const L of order) {
        const h = byKey.get(L.key)
        if (!h) continue
        const active = L.key === activeKey
        const { hx, hy, label: b } = L

        // เส้นเล็ง
        ctx.globalAlpha = active ? 0.8 : 0.35
        ctx.strokeStyle = h.color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(hx - 14, hy); ctx.lineTo(hx + 14, hy)
        ctx.moveTo(hx, hy - 14); ctx.lineTo(hx, hy + 14)
        ctx.stroke()

        // เส้นโยงจากหมุดไปป้าย (เห็นชัดเวลาป้ายถูกเลื่อนหนีกัน)
        const lx = Math.max(b.x, Math.min(hx, b.x + b.w))
        const ly = Math.max(b.y, Math.min(hy, b.y + b.h))
        if (Math.hypot(lx - hx, ly - hy) > HANDLE_R + 4) {
          ctx.globalAlpha = active ? 0.9 : 0.5
          ctx.beginPath()
          ctx.moveTo(hx, hy); ctx.lineTo(lx, ly)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // ตัวหมุด
        ctx.beginPath()
        ctx.arc(hx, hy, active ? HANDLE_R + 2 : HANDLE_R, 0, Math.PI * 2)
        ctx.fillStyle = h.color
        ctx.fill()
        ctx.strokeStyle = active ? '#ffffff' : '#0d1117'
        ctx.lineWidth = 2
        ctx.stroke()

        // ป้ายชื่อ — พื้นทึบกันอ่านไม่ออกเวลาทับตัวละคร และกดลากที่ป้ายได้ด้วย
        ctx.beginPath()
        ctx.roundRect(b.x, b.y, b.w, b.h, 4)
        ctx.fillStyle = active ? h.color : 'rgba(13,17,23,0.88)'
        ctx.fill()
        ctx.strokeStyle = h.color
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.font = (active ? 'bold ' : '') + LABEL_FONT
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = active ? '#0d1117' : h.color
        ctx.fillText(h.label, b.x + LABEL_PAD_X, b.y + b.h / 2 + 0.5)
        ctx.textBaseline = 'alphabetic'
      }

      if (scene) onTick(scene.attacker.globalFrame, scene.attacker.totalFrames)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [assets, scene, playing, showTarget, handleWorldPos, onTick])

  // ── เมาส์ ──

  /** ตำแหน่งเมาส์เป็นพิกเซลของ canvas — canvas อาจถูกย่อด้วย CSS (max-width) ต้องแปลงสเกล */
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget
    const rect = cv.getBoundingClientRect()
    return {
      sx: (e.clientX - rect.left) * (cv.width / rect.width),
      sy: (e.clientY - rect.top) * (cv.height / rect.height),
    }
  }

  /**
   * หาหมุดที่คลิกโดน: ป้ายชื่อก่อน (ป้ายไม่ซ้อนกันแล้ว จึงเลือกหมุดที่ซ้อนกันได้แน่นอน)
   * ถ้าไม่โดนป้าย เลือกหมุดที่ "ใกล้ที่สุด" ในระยะจับ ไม่ใช่ตัวแรกที่เจอ
   */
  const hitTest = (sx: number, sy: number): string | null => {
    const layout = layoutRef.current
    for (let i = layout.length - 1; i >= 0; i--) {
      const b = layout[i].label
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return layout[i].key
    }
    let best: string | null = null
    let bestD = GRAB_R
    for (const L of layout) {
      const dist = Math.hypot(sx - L.hx, sy - L.hy)
      if (dist <= bestD) { bestD = dist; best = L.key }
    }
    return best
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = toCanvas(e)
    const v = viewRef.current
    const key = hitTest(sx, sy)
    const h = key ? handlesRef.current.find(x => x.key === key) : undefined
    if (h) {
      // จับที่ป้ายก็ลากได้ — เก็บระยะห่างจากหมุดไว้ หมุดจะได้ไม่กระโดดมาที่เมาส์
      const world = toWorld(sx, sy)
      const w = handleWorldPos(h)
      dragRef.current = { kind: 'handle', key: h.key, dx: world.x - w.x, dy: world.y - w.y }
      setHover(h.key)
    } else {
      dragRef.current = { kind: 'pan', sx, sy, ox: v.ox, oy: v.oy }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = toCanvas(e)
    const d = dragRef.current

    if (!d) {
      const key = hitTest(sx, sy)
      if (key !== hoverRef.current) setHover(key)
      return
    }

    if (d.kind === 'pan') {
      setView(v => ({ ...v, ox: d.ox + (sx - d.sx), oy: d.oy + (sy - d.sy) }))
    } else {
      const h = handlesRef.current.find(x => x.key === d.key)
      if (!h) return
      const world = toWorld(sx, sy)
      const o = spaceOffset(h)
      let nx = world.x - d.dx - o.x
      let ny = world.y - d.dy - o.y
      if (e.shiftKey) { nx = Math.round(nx); ny = Math.round(ny) } // Shift = ล็อกเป็นจำนวนเต็ม
      onAnchorChange(d.key, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 })
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const { sx, sy } = toCanvas(e)
    setView(v => {
      const zoom = Math.max(0.15, Math.min(6, v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const k = zoom / v.zoom
      return { zoom, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k }
    })
  }

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={520}
      className="stage"
      style={{ cursor: dragRef.current?.kind === 'handle' ? 'grabbing' : hover ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    />
  )
}
