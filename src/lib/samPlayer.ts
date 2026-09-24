// ====================================================
// samPlayer.ts — เล่นอนิเมชั่นแบบแยกเฟส cast / release
//
// หัวใจคือ "เร่งความเร็วแบบไม่ทำลายน้ำหนักภาพ":
//   เฟส cast (ร่าย)    = ช่วงรอ ไม่มีข้อมูลสำคัญ → ย่อได้เยอะ
//   เฟส release (ปล่อย) = ช่วงที่ดาเมจออก ต้องรู้สึกได้ → ย่อน้อย
// ข้อมูลจริง: s_attack_ready ของ u1607e-sh ยาว 52 เฟรม @30fps = 1.73 วิ
// ถ้าเร่งทั้งก้อนเท่ากัน ภาพจะกลายเป็นกระตุก — แยกเฟสแล้วยังดูดีที่ x3
// ====================================================

import type { SAMParser, SamFrame } from './animation/samParser'
import { lerpSAMFrame } from './animation/samRenderer'

export type Phase = 'cast' | 'release'

export interface SpeedProfile { cast: number; release: number }

// ตัวคูณความเร็วต่อเฟส ตามปุ่มความเร็ว (จอรบวน x1 → x2 → x4 · editor ใช้ x1 / x2 / x3)
export const SPEED_PROFILES: Record<number, SpeedProfile> = {
  1: { cast: 1,   release: 1   },
  2: { cast: 2.5, release: 1.5 },
  3: { cast: 6,   release: 2   },
  4: { cast: 8,   release: 2.6 },
}

export interface Segment {
  clip: string
  phase: Phase
  frames: SamFrame[]
}

export interface PlayOptions {
  speed?: number              // 1 | 2 | 3
  castSpeedCap?: number | null // เพดานเวลาเฟส cast (วินาที) — เกินแล้วเร่งเพิ่มอัตโนมัติ
  loop?: boolean
  onRelease?: () => void      // ยิงตอนข้ามจากเฟส cast → release (จังหวะดาเมจออก)
  onEnd?: () => void
}

export class SamPlayer {
  private segments: Segment[] = []
  private segIndex = 0
  private cursor = 0            // เฟรมปัจจุบันในเซกเมนต์ (ทศนิยมได้)
  private opts: Required<Omit<PlayOptions, 'onRelease' | 'onEnd'>> & Pick<PlayOptions, 'onRelease' | 'onEnd'>
  private releaseFired = false
  private ended = false
  private holdAtEnd = false     // ค้างเฟรมสุดท้ายแทนที่จะจบ
  private frozen = false        // หยุดอยู่กับที่ (ไม่เดินเฟรม) — ใช้กับชะงัก

  constructor(private sam: SAMParser) {
    this.opts = { speed: 1, castSpeedCap: null, loop: false }
  }

  get fps(): number { return this.sam.animRate || 30 }
  get isEnded(): boolean { return this.ended }
  get phase(): Phase { return this.segments[this.segIndex]?.phase ?? 'release' }
  get clipName(): string { return this.segments[this.segIndex]?.clip ?? '' }

  /** ความยาวรวมเป็นวินาที ตามความเร็วที่ตั้งไว้ */
  get durationSec(): number {
    return this.segments.reduce((s, seg) => s + seg.frames.length / this.effectiveFps(seg.phase), 0)
  }

  private effectiveFps(phase: Phase): number {
    const prof = SPEED_PROFILES[this.opts.speed] ?? SPEED_PROFILES[1]
    let mul = phase === 'cast' ? prof.cast : prof.release
    // เพดานเวลา cast: ถ้ายังยาวเกินที่ตั้งไว้ ให้เร่งเพิ่มจนพอดีเพดาน
    if (phase === 'cast' && this.opts.castSpeedCap) {
      const castFrames = this.segments.filter(s => s.phase === 'cast').reduce((n, s) => n + s.frames.length, 0)
      if (castFrames) {
        const sec = castFrames / (this.fps * mul)
        if (sec > this.opts.castSpeedCap) mul *= sec / this.opts.castSpeedCap
      }
    }
    return this.fps * mul
  }

  /** เปลี่ยนความเร็วของคลิปที่กำลังเล่นอยู่ (ไม่เริ่มคลิปใหม่ เฟรมไม่กระโดด) */
  setSpeed(speed: number): void {
    this.opts.speed = speed
  }

  /** เล่นคลิปเดียว (idle / walk / โดนตี) */
  playClip(clip: string, opts: PlayOptions = {}): this {
    const frames = this.sam.animations[clip] ?? []
    return this.playSegments([{ clip, phase: 'release', frames }], opts)
  }

  /**
   * เล่นแอ็กชันแบบ cast → release โดยยิง onRelease ตรงรอยต่อ
   * castClip รับได้หลายคลิป — ท่าแบบ 3 ส่วนส่ง [part1, part2] มาเล่นต่อกันเป็นช่วงร่ายเดียว
   */
  playAction(castClip: string | null | (string | null)[], releaseClip: string, opts: PlayOptions = {}): this {
    const segs: Segment[] = []
    for (const c of Array.isArray(castClip) ? castClip : [castClip]) {
      if (c && this.sam.animations[c]?.length) {
        segs.push({ clip: c, phase: 'cast', frames: this.sam.animations[c] })
      }
    }
    segs.push({ clip: releaseClip, phase: 'release', frames: this.sam.animations[releaseClip] ?? [] })
    return this.playSegments(segs, opts)
  }

  /** ค้างเฟรมสุดท้ายของคลิปไว้ (ใช้ตอนติดสตัน — เล่น target แล้วหยุดค้าง) */
  holdClip(clip: string, opts: PlayOptions = {}): this {
    this.playClip(clip, opts)
    this.holdAtEnd = true
    return this
  }

  /** ค้างไว้ที่เฟรมเดียวของคลิป (ไม่เล่นต่อ) — ใช้ตอนติดชะงัก: ท่า target เฟรมแรก */
  freezeClip(clip: string, frame = 0): this {
    this.playClip(clip)
    this.seek(frame)
    this.frozen = true
    return this
  }

  get isFrozen(): boolean { return this.frozen }

  private playSegments(segs: Segment[], opts: PlayOptions): this {
    this.segments = segs.filter(s => s.frames.length > 0)
    this.opts = { speed: 1, castSpeedCap: null, loop: false, ...opts }
    this.segIndex = 0
    this.cursor = 0
    this.releaseFired = false
    this.ended = this.segments.length === 0
    this.holdAtEnd = false
    this.frozen = false
    // ไม่มีเฟส cast → ถือว่าปล่อยทันทีตั้งแต่เฟรมแรก
    if (!this.ended && this.segments[0].phase === 'release') this.fireRelease()
    return this
  }

  private fireRelease(): void {
    if (this.releaseFired) return
    this.releaseFired = true
    this.opts.onRelease?.()
  }

  /** เดินเวลาไปข้างหน้า — เรียกทุกเฟรมของ requestAnimationFrame */
  update(dtMs: number): void {
    if (this.ended || this.frozen || !this.segments.length) return
    let remaining = (dtMs / 1000) * this.effectiveFps(this.phase)

    while (remaining > 0) {
      const seg = this.segments[this.segIndex]
      const left = seg.frames.length - this.cursor
      if (remaining < left) { this.cursor += remaining; return }

      remaining -= left
      this.segIndex++

      if (this.segIndex >= this.segments.length) {
        if (this.opts.loop) { this.segIndex = 0; this.cursor = 0; this.releaseFired = false; continue }
        this.segIndex = this.segments.length - 1
        this.cursor = this.segments[this.segIndex].frames.length - 1
        if (!this.holdAtEnd) { this.ended = true; this.opts.onEnd?.() }
        return
      }

      this.cursor = 0
      if (this.segments[this.segIndex].phase === 'release') this.fireRelease()
    }
  }

  /** เฟรมที่ต้องวาดตอนนี้ */
  get frame(): SamFrame | null {
    const seg = this.segments[this.segIndex]
    if (!seg) return null
    return seg.frames[Math.min(Math.floor(this.cursor), seg.frames.length - 1)] ?? null
  }

  /**
   * เฟรมที่ผสมกับเฟรมถัดไปตามเศษของ cursor — ลื่นบนจอรีเฟรชสูง (ดู lerpSAMFrame)
   * เฟรมถัดไปของเฟรมสุดท้าย: เซกเมนต์ถัดไป → วนกลับต้น (ถ้า loop) → ไม่มี (ค้างเฟรมสุดท้าย)
   */
  get smoothFrame(): SamFrame | null {
    const seg = this.segments[this.segIndex]
    if (!seg) return null
    const i = Math.min(Math.floor(this.cursor), seg.frames.length - 1)
    const a = seg.frames[i]
    if (!a || this.ended) return a ?? null
    let b: SamFrame | null = seg.frames[i + 1] ?? null
    if (!b) {
      const next = this.segments[this.segIndex + 1]
      b = next ? next.frames[0] : this.opts.loop ? this.segments[0].frames[0] : null
    }
    return lerpSAMFrame(a, b, this.cursor - i)
  }

  /** ตำแหน่งเฟรมรวมทุกเซกเมนต์ (ไว้โชว์ในแถบไทม์ไลน์ของ editor) */
  get globalFrame(): number {
    let n = 0
    for (let i = 0; i < this.segIndex; i++) n += this.segments[i].frames.length
    return n + Math.floor(this.cursor)
  }

  get totalFrames(): number {
    return this.segments.reduce((s, seg) => s + seg.frames.length, 0)
  }

  /** กระโดดไปเฟรมที่ต้องการ (นับรวมทุกเซกเมนต์) — ใช้ตอนลากแถบไทม์ไลน์ใน editor */
  seek(globalFrame: number): void {
    let n = Math.max(0, Math.min(globalFrame, this.totalFrames - 1))
    for (let i = 0; i < this.segments.length; i++) {
      if (n < this.segments[i].frames.length) { this.segIndex = i; this.cursor = n; this.ended = false; return }
      n -= this.segments[i].frames.length
    }
  }
}
