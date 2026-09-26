import { bodyPointsOf } from '../lib/actionPlan'
import { useEffect, useRef, useState } from 'react'
import { loadRangerAssets, type RangerAssets } from '../lib/rangerAssets'
import type { RangerConfig } from '../lib/rangerConfig'
import { SamPlayer } from '../lib/samPlayer'
import { animBBox, renderSAMFrame } from '../lib/animation/samRenderer'
const CAMERA_ZOOM = 1
const HERO_ZOOM = 3
const VIEW_H = 720
export default function HeroArt({ id, config }: { id: string; config: RangerConfig | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    setPainted(false)
    let alive = true
    let firstFrame = true
    let raf = 0
    let assets: RangerAssets | null = null
    void (async () => {
      let a: RangerAssets
      try { a = await loadRangerAssets(id, []) } catch { return }
      if (!alive) { a.dispose(); return }
      assets = a
      const clip = config?.clips.idle && a.sam.animations[config.clips.idle]?.length ? config.clips.idle : Object.keys(a.sam.animations)[0]
      const box = animBBox(a.sam, a.sprites, clip)
      // จุดยืนที่ตั้งไว้ใน editor (เท้าเหยียบพื้น) — ใช้เป็นหลักแทนขอบล่างของกรอบภาพ
      const stand = config ? bodyPointsOf(a, config).stand : null
      const player = new SamPlayer(a.sam)
      player.playClip(clip, { loop: true })
      let last = performance.now()
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        const cv = ref.current
        if (!cv || !assets || assets.disposed || !box) return
        player.update(Math.min(now - last, 100))
        last = now
        const w = cv.clientWidth, h = cv.clientHeight
        if (w < 2 || h < 2) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
        const ctx = cv.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const f = player.smoothFrame ?? player.frame
        if (!f) return
        // ขนาดเท่าที่เห็นในสนามรบจริง (กล้องชุดเดียวกัน) แล้วขยายอีก HERO_ZOOM เท่าให้เต็มกรอบพอดี
        // ถ้าตัวยังล้นกรอบ ค่อยย่อลงตามกรอบภาพ
        const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0)
        // อ้างอิงความสูงหน้าต่าง (ไม่ใช่ความสูงกรอบ) → ขนาดตัวเท่าที่เห็นในสนามรบจริงบนจอเดียวกัน
        const natural = CAMERA_ZOOM * HERO_ZOOM * (window.innerHeight / VIEW_H)
        const zoom = Math.min(natural, (w * 0.92) / bw, (h * 0.92) / bh)
        const ax = stand ? stand.x : (box.x0 + box.x1) / 2
        const ay = stand ? stand.y : box.y1
        renderSAMFrame(
          ctx, f, a.sam.images, a.sprites,
          w / 2 - ax * zoom,
          h * 0.92 - ay * zoom,     // จุดยืนอยู่บนเส้นพื้นของกรอบ
          zoom,
        )
        if (firstFrame) { firstFrame = false; setPainted(true) }
      }
      raf = requestAnimationFrame(frame)
    })()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      assets?.dispose()
    }
  }, [id, config])
  return <div className="ep-hero-visual">{!painted && <img className="ep-hero-fallback" src={`/rangers/${id}/thumb.png`} alt="" />}<canvas ref={ref} className="ep-hero-canvas" /></div>
}
