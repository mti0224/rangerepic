// ====================================================
// previewScene.ts — ฉากทดสอบใน editor (ต้นแบบของฉากรบจริง)
//
// ลำดับเหตุการณ์ตามกฎของ Line Ranger Kiwi:
//   1. body เล่นท่าตั้งแต่ช่วงร่าย
//   2. เฟรม body เดินผ่าน readyLen → วางแผนการยิงจากข้อมูลเกม (shotRules.planShot)
//        ไม่มีไฟล์กระสุน = ตีประชิด เป้าโดนตีทันที
//   3. ช่วง normal: ท่าไม่บินเล่นคาที่เป้าจนครบความยาว / กระสุนบินเคลื่อนที่ (โค้ง/หมุนได้)
//   4. ถึงเป้า → เป้าโดนตี 1 ครั้งต่อนัด (บัฟไม่โดน)
//        มีเป้าเดียว = ตัวที่ผู้เล่นเล็ง ทุกท่ายิงไปหาตัวนี้ (ดาเมจหมู่ต่อคนรอบข้างทำทีหลัง)
//        ตีธรรมดา = หุ่นกะพริบแดง 4 ติ๊ก · สกิล = หุ่นเล่นท่า target
//   5. ช่วง finish: เล่นครั้งเดียวที่จุดกระทบ แล้วลบกระสุน
//   6. body เล่นต่อไปเอง ไม่รอกระสุน — ถ้าวน ก็ปล่อยนัดใหม่ในรอบถัดไป
//
// ท่าที่ติ๊ก "เดินเข้าไปก่อนโจมตี": เดิน(walk) → หยุดที่จุดหยุด → ร่าย/ปล่อย → เดินกลับ(หันหลัง) → ยืน
// กระสุนที่ปล่อยออกไปแล้วจำตำแหน่งตอนปล่อยไว้ ไม่ขยับตามตัวละครตอนเดินกลับ
//
// เวลาทั้งหมดนับเป็น "ติ๊กของ body" (1 ติ๊ก = 1 เฟรมของไฟล์ตัวละคร) เหมือนต้นฉบับ
// พิกัดภายในทั้งหมดเป็น kiwi space (พิกัดดิบของไฟล์ผู้ยิง) — เลื่อนทั้งโลกตอนวาดทีเดียว
// ====================================================

import { renderSAMFrame } from '@/lib/animation/samRenderer'
import { SamPlayer, SPEED_PROFILES } from '@/lib/samPlayer'
import type { RangerAssets } from '@/lib/rangerAssets'
import type { ActionName, RangerConfig, Vec2 } from '@/lib/rangerConfig'
import {
  DUMMY_FLASH_ALPHA, DUMMY_FLASH_TICKS,
  shotExpired, shotFrameIndex, shotPose,
  type HitPlan, type ShotPlan, type ShotPlanData, type TargetPoints,
} from '@/lib/shotRules'
import { KIND_OF, approachOffsetOf, bodyFpsOf, planAction, standOf } from '@/lib/actionPlan'
import { e } from './i18n'

export { KIND_OF }

export type SceneMode = 'loop' | 'fire'

interface ActiveShot { plan: ShotPlanData; spawnTick: number; hitFired: boolean }
type WalkState = 'none' | 'approach' | 'act' | 'return'
interface HitEvent { tick: number; isSkill: boolean }
interface Popup { at: Vec2; text: string; life: number; skill: boolean }

const HIT_EVENT_KEEP = 8
const POPUP_LIFE = 1.1
const POPUP_RISE = 55
const V0: Vec2 = { x: 0, y: 0 }


function pushHit(list: HitEvent[], tick: number, isSkill: boolean): void {
  if (list.some(e => e.tick === tick && e.isSkill === isSkill)) return
  list.push({ tick, isSkill })
  list.sort((a, b) => a.tick - b.tick)
  if (list.length > HIT_EVENT_KEEP) list.splice(0, list.length - HIT_EVENT_KEEP)
}

function activeHit(list: HitEvent[], tick: number): HitEvent | null {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].tick <= tick) return list[i]
  return null
}

export class PreviewScene {
  mode: SceneMode = 'loop'
  attacker: SamPlayer
  targetDistance = 480
  showTarget = true
  groundLocked = true
  /** วาดเส้นทางกระสุนของแอ็กชันที่เปิดอยู่ */
  showPlan = false
  /**
   * วาดเครื่องหมาย + ป้าย "ปล่อย / ตก" ด้วยไหม
   * ปิดตอนโหมดตั้งเอง เพราะหมุดที่ลากได้อยู่ตำแหน่งเดียวกันพอดี ป้ายจะซ้อนกันสองชุด
   */
  planLabels = true

  private action: ActionName | null = null
  private actionActive = false
  private spawnedThisRun = false
  private prevFrame = -1
  private tick = 0
  private speed = 1
  private shots: ActiveShot[] = []
  private hits: HitEvent[] = []
  private popups: Popup[] = []
  private fx: HTMLCanvasElement | null = null
  /** ตำแหน่งผู้โจมตีเทียบจากที่ยืนเดิม (เดินเข้าไปแล้วค่านี้จะไม่เป็น 0) */
  private pos: Vec2 = { x: 0, y: 0 }
  private walkState: WalkState = 'none'
  private facingBack = false
  private loopRun = false

  constructor(private assets: RangerAssets, private config: RangerConfig) {
    this.attacker = new SamPlayer(assets.sam)
  }

  setConfig(config: RangerConfig): void { this.config = config }

  // ── ค่าที่คำนวณจากตัวละคร ──

  get bodyFps(): number { return bodyFpsOf(this.assets, this.config) }

  /** จุดยืนผู้ยิง (kiwi space) — ใช้ค่าที่ตั้งเองก่อน ถ้ายังไม่ได้ตั้งใช้ค่าที่หาจากเงาในไฟล์ */
  get stand(): Vec2 { return standOf(this.assets, this.config) }

  /** เลื่อนทั้งโลกให้เท้าผู้ยิงอยู่ที่จุดกำเนิดของเวที */
  private get worldOffset(): Vec2 {
    const s = this.stand
    return this.groundLocked ? { x: -s.x, y: -s.y } : V0
  }

  private get releaseMul(): number {
    return (SPEED_PROFILES[this.speed] ?? SPEED_PROFILES[1]).release
  }

  /** ตำแหน่งวาดของหุ่น (ตัวเดียวกันกลับด้านรอบแกนกลางตัว) ให้จุดยืนอยู่ห่างผู้ยิง gap พอดี */
  private dummyDrawX(gap: number): number {
    const s = this.stand
    return s.x + gap - (2 * this.assets.geometry.pivotX - s.x)
  }

  private dummyPoint(gap: number, raw: Vec2): Vec2 {
    return { x: this.dummyDrawX(gap) + 2 * this.assets.geometry.pivotX - raw.x, y: raw.y }
  }

  targetPoints(gap: number): TargetPoints {
    const geo = this.assets.geometry
    const anchor = this.stand
    const face = geo.faceAnchor ?? anchor
    return {
      main: this.dummyPoint(gap, anchor),
      face: this.dummyPoint(gap, face),
      center: geo.centerY !== null ? this.dummyPoint(gap, { x: anchor.x, y: geo.centerY }) : null,
    }
  }

  // ── การวางแผนการยิง (ตรรกะอยู่ที่ lib/actionPlan ใช้ร่วมกับสนามรบ) ──

  /** ระยะที่ต้องเดินไปถึงจุดหยุด (เทียบจากที่ยืนเดิม) — ท่าที่ไม่ได้ติ๊กเดินคืน 0 */
  approachOffset(name: ActionName): Vec2 {
    return approachOffsetOf(this.config, name, this.stand, this.targetPoints(this.targetDistance).main)
  }

  planFor(name: ActionName): ShotPlan {
    return planAction(this.assets, this.config, name, this.targetPoints(this.targetDistance))
  }

  // ── การเล่น ──

  private resetShots(): void {
    this.shots = []
    this.hits = []
    this.popups = []
    this.prevFrame = -1
    this.spawnedThisRun = false
  }

  private castClips(name: ActionName): (string | null)[] {
    const a = this.config.actions[name]
    return [a.castPre, a.cast]
  }

  /** โหมดแก้ไข: เล่นคลิปวน (ไม่มีการยิง) */
  loopClip(clip: string, speed: number): void {
    this.mode = 'loop'
    this.speed = speed
    this.action = null
    this.actionActive = false
    this.walkState = 'none'
    this.pos = { x: 0, y: 0 }
    this.facingBack = false
    this.resetShots()
    this.attacker.playClip(clip, { speed, loop: true })
  }

  /** โหมดแก้ไข: เล่นท่าโจมตีวน — ปล่อยนัดใหม่ทุกรอบ (ถ้าติ๊กเดิน ก็เดินไป-ตี-เดินกลับ วนไป) */
  loopAction(name: ActionName, speed: number): void {
    this.startRun(name, speed, true)
  }

  /** ยิง 1 ครั้งแล้วกลับไปยืน */
  fire(name: ActionName, speed: number): void {
    this.startRun(name, speed, false)
  }

  private startRun(name: ActionName, speed: number, loop: boolean): void {
    this.mode = loop ? 'loop' : 'fire'
    this.speed = speed
    this.action = name
    this.loopRun = loop
    this.pos = { x: 0, y: 0 }
    this.facingBack = false
    this.resetShots()
    if (this.config.actions[name].approach?.enabled) this.beginApproach()
    else this.beginAct()
  }

  private get walkClip(): string {
    return this.config.clips.walk ?? this.config.clips.idle
  }

  private beginApproach(): void {
    this.walkState = 'approach'
    this.actionActive = false
    this.facingBack = false
    this.attacker.playClip(this.walkClip, { speed: this.speed, loop: true })
  }

  private beginReturn(): void {
    this.walkState = 'return'
    this.actionActive = false
    // หันหลังเฉพาะตอนบ้านอยู่ข้างหลัง (เดินเข้าไปหาเป้า) · ถอยไปตีแล้วกลับ = บ้านอยู่ข้างหน้า เดินหน้าตรงๆ ไม่ moonwalk
    this.facingBack = this.pos.x > 0
    this.attacker.playClip(this.walkClip, { speed: this.speed, loop: true })
  }

  private goIdle(): void {
    this.walkState = 'none'
    this.actionActive = false
    this.facingBack = false
    this.attacker.playClip(this.config.clips.idle, { speed: this.speed, loop: true })
  }

  private beginAct(): void {
    const name = this.action
    if (!name) return
    const a = this.config.actions[name]
    const walks = !!a.approach?.enabled
    this.walkState = 'act'
    this.facingBack = false
    this.actionActive = true
    this.prevFrame = -1
    this.spawnedThisRun = false

    // ไม่เดิน + วน = ให้ตัวเล่นท่าวนเอง (ยิงทุกรอบที่เฟรมเดินผ่านจุดปล่อย)
    if (!walks && this.loopRun) {
      this.attacker.playAction(this.castClips(name), a.release, { speed: this.speed, loop: true, castSpeedCap: a.castSpeedCap })
      return
    }

    this.attacker.playAction(this.castClips(name), a.release, {
      speed: this.speed,
      castSpeedCap: a.castSpeedCap,
      onEnd: () => {
        // ท่าจบก่อนเฟรมเดินผ่านจุดปล่อย (อัปเดตเดียวกระโดดข้าม) → ยังต้องปล่อยนัดนี้
        if (!this.spawnedThisRun) this.spawn()
        this.actionActive = false
        if (walks && a.approach.returnHome) this.beginReturn()
        else if (this.loopRun) this.beginAct()
        else this.goIdle()
      },
    })
  }

  /** ลากแถบเวลา — ต้องจำเฟรมใหม่ ไม่งั้นอัปเดตถัดไปจะนับว่า "เดินผ่านจุดปล่อย" */
  seek(frame: number): void {
    this.attacker.seek(frame)
    this.prevFrame = this.attacker.globalFrame
  }

  private spawn(): void {
    if (!this.action) return
    this.spawnedThisRun = true
    const plan = this.planFor(this.action)
    if (plan.type === 'melee') {
      if (plan.hit) this.applyHit(plan.hit)
      return
    }
    this.shots.push({ plan, spawnTick: this.tick, hitFired: false })
  }

  /** เป้าที่เล็งโดนตี — ดาเมจหมู่ (h.areaWorld) ยังไม่ใช้ รอทำระบบคนรอบข้างทีหลัง */
  private applyHit(h: HitPlan): void {
    pushHit(this.hits, this.tick, h.isSkill)
    this.popHit(this.targetDistance, h.isSkill)
  }

  private popHit(gap: number, isSkill: boolean): void {
    const pts = this.targetPoints(gap)
    const oh = this.config.anchors.overhead
    const at = oh.x !== 0 || oh.y !== 0
      ? { x: pts.main.x + oh.x, y: pts.main.y + oh.y }
      : { x: pts.face.x, y: pts.face.y - 40 }
    const atk = this.config.stats.atk * (isSkill ? 2 : 1)
    this.popups.push({ at, text: String(Math.round(atk * (0.9 + Math.random() * 0.2))), life: POPUP_LIFE, skill: isSkill })
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000
    this.attacker.update(dtMs)
    this.tick += dt * this.bodyFps * this.releaseMul

    // ── เดินไป / เดินกลับ ──
    if (this.action && (this.walkState === 'approach' || this.walkState === 'return')) {
      const goal = this.walkState === 'approach' ? this.approachOffset(this.action) : { x: 0, y: 0 }
      const step = (this.config.actions[this.action].approach?.speed ?? 600) * dt * this.releaseMul
      const dx = goal.x - this.pos.x, dy = goal.y - this.pos.y
      const dist = Math.hypot(dx, dy)
      if (dist <= step || dist === 0) {
        this.pos = goal
        if (this.walkState === 'approach') this.beginAct()
        else if (this.loopRun) this.beginApproach()
        else this.goIdle()
      } else {
        this.pos = { x: this.pos.x + (dx / dist) * step, y: this.pos.y + (dy / dist) * step }
      }
    }

    // ── จังหวะปล่อย: เฟรม body เดินผ่าน readyLen ──
    if (this.action && this.actionActive) {
      const a = this.config.actions[this.action]
      const readyLen = Math.min(a.releaseFrame, Math.max(0, this.attacker.totalFrames - 1))
      const cur = this.attacker.globalFrame
      const prev = this.prevFrame
      const wrapped = prev >= 0 && cur < prev      // อัปเดตเดินหน้าอย่างเดียว ถอยได้แปลว่าวนรอบ
      const crossed = (prev < readyLen && cur >= readyLen)
        || (wrapped && (readyLen === 0 || cur >= readyLen))
      if (crossed) this.spawn()
      this.prevFrame = cur
    }

    // ── กระสุน ──
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      const T = this.tick - s.spawnTick
      // เช็คชนก่อนลบ — ไฟล์ที่ไม่มี finish จะหมดอายุพร้อมจังหวะชนพอดี
      if (T >= s.plan.travelTicks && !s.hitFired && s.plan.hit) {
        s.hitFired = true
        this.applyHit(s.plan.hit)
      }
      if (shotExpired(s.plan, T)) this.shots.splice(i, 1)
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life -= dt
      if (this.popups[i].life <= 0) this.popups.splice(i, 1)
    }
  }

  get isIdle(): boolean {
    return this.mode === 'loop'
      || (this.walkState === 'none' && !this.actionActive && !this.shots.length && !this.popups.length)
  }

  /** ตำแหน่งผู้โจมตีตอนนี้ เทียบจากที่ยืนเดิม */
  get attackerOffset(): Vec2 { return { ...this.pos } }
  get state(): WalkState { return this.walkState }

  get shotCount(): number { return this.shots.length }
  get hitCount(): number { return this.hits.length }

  // ── การวาด ──

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number, zoom: number): void {
    // asset ถูกปลดไปแล้ว (กำลังเปลี่ยนเรนเจอร์) — ImageBitmap ปิดแล้ว วาดจะ throw กลางคัน
    if (this.assets.disposed) return

    const off = this.worldOffset
    const sx = (x: number) => ox + (x + off.x) * zoom
    const sy = (y: number) => oy + (y + off.y) * zoom

    const { sam, sprites } = this.assets

    // เงาจาง ๆ ที่จุดหยุดเดิน — ดูระยะได้โดยไม่ต้องกดยิง
    if (this.showPlan && this.action && this.config.actions[this.action].approach?.enabled) {
      const stop = this.approachOffset(this.action)
      const ghost = sam.animations[this.config.clips.idle]?.[0]
      if (ghost) renderSAMFrame(ctx, ghost, sam.images, sprites, sx(stop.x), sy(stop.y), zoom, undefined, false, 0, 0, 0.28)
    }

    // ลำดับเลเยอร์ (ล่าง → บน): เป้า → ผู้โจมตี → กระสุน/เอฟเฟกต์/บัฟ (เหมือนสนามรบ)
    const paintShots = (buff: boolean) => {
      for (const s of this.shots) {
        if (s.plan.isBuff !== buff) continue
        const T = this.tick - s.spawnTick
        const idx = shotFrameIndex(s.plan, T)
        const bullet = this.assets.bullets[s.plan.suffix]
        if (!idx || !bullet) continue
        const frame = (idx.clip === 'normal' ? bullet.flight : bullet.impact)[idx.index]
        if (!frame) continue

        const pose = shotPose(s.plan, T)
        const anchor = idx.clip === 'finish' ? s.plan.finishAnchor : s.plan.anchor
        // renderSAMFrame หมุนรอบ origin ไม่ใช่รอบหมุด → หมุนเวกเตอร์หมุดด้วยมุมเดียวกันก่อนหักลบ
        const ca = Math.cos(pose.angle), sa = Math.sin(pose.angle)
        const fx = ca * anchor.x - sa * anchor.y
        const fy = sa * anchor.x + ca * anchor.y
        renderSAMFrame(ctx, frame, bullet.sam.images, bullet.sprites,
          sx(pose.pos.x - fx), sy(pose.pos.y - fy), zoom, undefined, false, 0, pose.angle)
      }
    }
    const paintAttacker = () => {
      const af = this.attacker.frame
      if (!af) return
      // หันหลังเดินกลับ: พลิกกระจกรอบ "จุดยืน" (เท้า) ไม่ใช่กึ่งกลางกรอบภาพ
      // กรอบภาพของหลายตัวไม่ได้อยู่ตรงเท้า ถ้าพลิกรอบกรอบภาพ ทั้งตัวจะกระโดดไปด้านข้าง
      // เท่ากับ 2 × (กึ่งกลางกรอบ − จุดยืน) — พลิกรอบเท้าแล้วเท้าอยู่ที่เดิมเป๊ะ
      renderSAMFrame(ctx, af, sam.images, sprites, sx(this.pos.x), sy(this.pos.y), zoom,
        undefined, this.facingBack, this.stand.x)
    }

    if (this.showTarget) this.paintDummy(ctx, this.targetDistance, this.hits, sx, sy, zoom)
    paintAttacker()
    paintShots(false)
    paintShots(true)

    if (this.showPlan && this.action) this.paintPlan(ctx, this.planFor(this.action), sx, sy)

    for (const p of this.popups) {
      const k = 1 - p.life / POPUP_LIFE
      const x = sx(p.at.x)
      const y = sy(p.at.y - POPUP_RISE * k)
      ctx.save()
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2)
      ctx.textAlign = 'center'
      ctx.font = (p.skill ? 'bold 21px' : 'bold 17px') + ' LineBold, Krub, ui-sans-serif, system-ui'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(p.text, x, y)
      ctx.fillStyle = p.skill ? '#fbbf24' : '#ffffff'
      ctx.fillText(p.text, x, y)
      ctx.restore()
    }
  }

  private paintDummy(
    ctx: CanvasRenderingContext2D, gap: number, hits: HitEvent[],
    sx: (x: number) => number, sy: (y: number) => number, zoom: number,
  ): void {
    const { sam, sprites, geometry: geo } = this.assets
    const idle = sam.animations[geo.idleName] ?? []
    let frames = idle
    let fi = idle.length ? Math.floor(this.tick) % idle.length : 0
    let red = 0

    const hit = activeHit(hits, this.tick)
    if (hit) {
      const age = this.tick - hit.tick
      if (hit.isSkill) {
        const hitName = geo.hitName ?? this.config.clips.hitLight
        const hitFrames = hitName ? sam.animations[hitName] ?? [] : []
        if (age < hitFrames.length) { frames = hitFrames; fi = Math.floor(age) }
      } else if (age < DUMMY_FLASH_TICKS) {
        red = DUMMY_FLASH_ALPHA
      }
    }
    const frame = frames[Math.min(fi, frames.length - 1)]
    if (!frame) return

    const dx = sx(this.dummyDrawX(gap))
    const dy = sy(0)
    const draw = (c: CanvasRenderingContext2D) =>
      renderSAMFrame(c, frame, sam.images, sprites, dx, dy, zoom, undefined, true, geo.pivotX)
    draw(ctx)

    if (red > 0 && typeof document !== 'undefined') {
      // ย้อมแดงเฉพาะพิกเซลของหุ่น: วาดลง canvas แยก เติมสีแบบ source-in แล้วค่อยวางทับ
      const W = ctx.canvas.width, H = ctx.canvas.height
      if (!this.fx) this.fx = document.createElement('canvas')
      if (this.fx.width !== W) this.fx.width = W
      if (this.fx.height !== H) this.fx.height = H
      const f = this.fx.getContext('2d')
      if (!f) return
      f.setTransform(1, 0, 0, 1, 0, 0)
      f.clearRect(0, 0, W, H)
      draw(f)
      f.setTransform(1, 0, 0, 1, 0, 0)
      f.globalCompositeOperation = 'source-in'
      f.fillStyle = '#ff2d2d'
      f.fillRect(0, 0, W, H)
      f.globalCompositeOperation = 'source-over'
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = red
      ctx.drawImage(this.fx, 0, 0)
      ctx.restore()
    }
  }

  /** เครื่องหมายจุดปล่อย (ฟ้า) และจุดตก (ชมพู) — ไม่มีสำหรับท่าประชิด */
  private paintPlan(
    ctx: CanvasRenderingContext2D, plan: ShotPlan,
    sx: (x: number) => number, sy: (y: number) => number,
  ): void {
    if (plan.type !== 'shot') return
    const cross = (p: Vec2, color: string, label: string) => {
      const x = sx(p.x), y = sy(p.y)
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y)
      ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = '11px LineBold, Krub, ui-sans-serif, system-ui'
      ctx.fillText(label, x + 10, y - 8)
      ctx.restore()
    }
    if (!plan.isInstant) {
      // เส้นทางบิน
      ctx.save()
      ctx.strokeStyle = 'rgba(96,165,250,0.45)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      for (let i = 0; i <= 24; i++) {
        const pose = shotPose(plan, (plan.travelTicks * i) / 24 - (i === 24 ? 0.0001 : 0))
        if (i === 0) ctx.moveTo(sx(pose.pos.x), sy(pose.pos.y))
        else ctx.lineTo(sx(pose.pos.x), sy(pose.pos.y))
      }
      ctx.stroke()
      ctx.restore()
      if (this.planLabels) cross(plan.start, '#60a5fa', e('planRelease'))
    }
    if (this.planLabels) cross(plan.end, '#f472b6', e(plan.isBuff ? 'planBuff' : plan.isInstant ? 'planHere' : 'planLand'))
    if (this.planLabels && plan.finishAt) cross(plan.finishAt, '#f97316', e('planBurst'))
  }
}
