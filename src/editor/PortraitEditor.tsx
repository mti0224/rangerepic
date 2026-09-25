// ====================================================
// PortraitEditor — แท็บ "รูป臉部": ลากกรอบสี่เหลี่ยมจัตุรัสไปครอบ臉部เรนเจอร์บน thumb.png
//
// รูปต้นทาง = thumb.png (รูปเดียวกับในรายชื่อเรนเจอร์ด้านซ้าย)
// กรอบขนาดคงที่ (PORTRAIT_SIZE พิกเซลของ thumb) เท่ากันทุกตัว — ย้ายได้ 不可縮放 · กรอบอยู่ในรูปเสมอ
// ผลลัพธ์ในจอดวล (左下角 + แถบลำดับเทิร์น) = ทั้ง圖片 ไม่ตัดเป็นกรอบ โดยให้กรอบ臉部อยู่กลางช่อง
// ลาก = ย้ายกรอบ · ปุ่มลูกศร = ขยับทีละ 1 px (Shift = 5) · คลิกนอกกรอบ = ย้ายกรอบมาตรงนั้น
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RangerConfig, Vec2 } from '@/lib/rangerConfig'
import { PANEL_FACE_ZOOM, PORTRAIT_SIZE, clampPortrait, defaultPortrait, drawFocused, imageReady, thumbUrl } from '@/lib/portrait'

/** ขนาดแคนวาสบนจอ (px) */
const VIEW = 300
/** ความคมของแคนวาส (วาดใหญ่กว่าที่แสดง) */
const DPR = 2
/** ขนาดตัวอย่างที่แสดง = ขนาดในจอดวล (รูปใหญ่左下角 / รูปในแถบลำดับเทิร์น) */
const PREVIEW_SIZES = [92]

export default function PortraitEditor({ config, onChange }: {
  config: RangerConfig
  onChange: (p: Vec2 | undefined) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [missing, setMissing] = useState(false)
  const [drag, setDrag] = useState<Vec2 | null>(null)

  // โหลด thumb.png ของตัวที่เลือก
  useEffect(() => {
    setImg(null)
    setMissing(false)
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => setMissing(true)
    im.src = thumbUrl(config.id)
  }, [config.id])

  const auto = useMemo(() => (imageReady(img) ? defaultPortrait(img) : null), [img])
  const center = imageReady(img) && auto ? (config.face ? clampPortrait(img, config.face) : auto) : null

  // มุมมอง: ขยายทั้งรูปให้พอดีแคนวาส (ตำแหน่ง/สเกลคงที่ ลากกรอบแล้วรูปไม่วิ่ง)
  const view = useMemo(() => {
    if (!imageReady(img)) return null
    const w = img.naturalWidth, h = img.naturalHeight
    const scale = Math.min(3, (VIEW - 20) / Math.max(w, h))
    return { scale, ox: (VIEW - w * scale) / 2, oy: (VIEW - h * scale) / 2 }
  }, [img])

  // ── วาด圖片 + กรอบ ──
  useEffect(() => {
    const cv = canvasRef.current
    const g = cv?.getContext('2d')
    if (!cv || !g || !imageReady(img) || !view || !center) return
    g.setTransform(DPR, 0, 0, DPR, 0, 0)
    g.clearRect(0, 0, VIEW, VIEW)
    for (let y = 0; y < VIEW; y += 15) for (let x = 0; x < VIEW; x += 15) {
      g.fillStyle = ((x + y) / 15) % 2 ? '#1c2233' : '#232a3d'
      g.fillRect(x, y, 15, 15)
    }
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, view.ox, view.oy, img.naturalWidth * view.scale, img.naturalHeight * view.scale)

    const side = PORTRAIT_SIZE * view.scale
    const sx = view.ox + center.x * view.scale - side / 2
    const sy = view.oy + center.y * view.scale - side / 2
    // มืดรอบนอกกรอบ
    g.beginPath()
    g.rect(0, 0, VIEW, VIEW)
    g.rect(sx, sy, side, side)
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.fill('evenodd')
    // กรอบทอง + มุม + กากบาทกลาง
    g.lineWidth = 2
    g.strokeStyle = '#f5c542'
    g.strokeRect(sx, sy, side, side)
    const c = 12
    g.lineWidth = 4
    for (const [x, y, dx, dy] of [[sx, sy, 1, 1], [sx + side, sy, -1, 1], [sx, sy + side, 1, -1], [sx + side, sy + side, -1, -1]]) {
      g.beginPath()
      g.moveTo(x, y + dy * c); g.lineTo(x, y); g.lineTo(x + dx * c, y)
      g.stroke()
    }
    g.lineWidth = 1
    g.strokeStyle = 'rgba(245,197,66,0.6)'
    g.beginPath()
    g.moveTo(sx + side / 2 - 6, sy + side / 2); g.lineTo(sx + side / 2 + 6, sy + side / 2)
    g.moveTo(sx + side / 2, sy + side / 2 - 6); g.lineTo(sx + side / 2, sy + side / 2 + 6)
    g.stroke()
  }, [img, view, center?.x, center?.y])

  // ── ตัวอย่างขนาดจริงในจอดวล ──
  useEffect(() => {
    if (!imageReady(img) || !center) return
    PREVIEW_SIZES.forEach((px, i) => {
      const cv = previewRefs.current[i]
      const g = cv?.getContext('2d')
      if (!cv || !g) return
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, cv.width, cv.height)
      // เหมือนจอดวล: ทั้ง圖片 臉部อยู่กลางกล่อง (ไม่ตัดเป็นกรอบ臉部)
      g.imageSmoothingQuality = 'high'
      drawFocused(g, img, center, (px * DPR) / 2, (px * DPR) / 2, px * DPR * PANEL_FACE_ZOOM)
    })
  }, [img, center?.x, center?.y])

  if (missing) return <p className="note">找不到此 Ranger 的 thumb.png — 請先重新從 lerico 下載 Ranger 資源</p>
  if (!imageReady(img) || !view || !center) return <p className="note">正在載入圖片…</p>

  const set = (p: Vec2) => {
    const c = clampPortrait(img, p)
    onChange({ x: Math.round(c.x), y: Math.round(c.y) })
  }
  const pointer = (e: React.PointerEvent<HTMLCanvasElement>): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect()
    const sx = (e.clientX - r.left) * (VIEW / r.width), sy = (e.clientY - r.top) * (VIEW / r.height)
    return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ไม่เป็นไร */ }
    e.currentTarget.focus()
    const p = pointer(e)
    const half = PORTRAIT_SIZE / 2
    const inside = Math.abs(p.x - center.x) <= half && Math.abs(p.y - center.y) <= half
    // จับในกรอบ = ลากโดยคงระยะจับ · คลิกนอกกรอบ = ย้ายกรอบมาตรงนั้นแล้วลากต่อ
    const grab = inside ? { x: p.x - center.x, y: p.y - center.y } : { x: 0, y: 0 }
    if (!inside) set(p)
    setDrag(grab)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return
    const p = pointer(e)
    set({ x: p.x - drag.x, y: p.y - drag.y })
  }
  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 5 : 1
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    set({ x: center.x + d[0], y: center.y + d[1] })
  }

  return (
    <div className="portrait-editor">
      <p className="note">
        拖曳金色框以框住<b>臉部</b>；所有 Ranger 使用相同框大小 ({PORTRAIT_SIZE}×{PORTRAIT_SIZE} px) 不可縮放<br />
        此圖片會用於戰鬥畫面的 Ranger 頭像（左下角與回合順序列）；方向鍵每次移動 1 px（Shift = 5）
      </p>
      <canvas
        ref={canvasRef}
        className="portrait-canvas"
        width={VIEW * DPR}
        height={VIEW * DPR}
        style={{ width: VIEW, height: VIEW, cursor: drag ? 'grabbing' : 'grab' }}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKey}
      />
      <div className="portrait-previews">
        {PREVIEW_SIZES.map((px, i) => (
          <div key={px} className="portrait-preview">
            <canvas
              ref={el => { previewRefs.current[i] = el }}
              width={px * DPR}
              height={px * DPR}
              style={{ width: px, height: px }}
            />
            <span>左下角</span>
          </div>
        ))}
        <div className="portrait-actions">
          <div className="meta">中心 ({center.x}, {center.y}) · 圖片 {img.naturalWidth}×{img.naturalHeight}{config.face ? '' : ' · 自動推測'}</div>
          <button onClick={() => onChange(undefined)} disabled={!config.face}>↺ 恢復自動位置</button>
        </div>
      </div>
    </div>
  )
}
