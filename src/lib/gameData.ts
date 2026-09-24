// ====================================================
// gameData.ts — ข้อมูลเกมของเรนเจอร์ 1 ตัว (public/rangers/<id>/gamedata.json)
// สร้างโดย scripts/fetch-gamedata.mjs จาก warmycat (projectile_data + Rangers_data)
// ====================================================

import type { Vec2 } from './rangerConfig'

export type AttackKind = 'normal' | 'skill1' | 'skill2'

export interface MoveData {
  /** ชื่อไฟล์กระสุนจริงที่ต้องใช้ (bul / bul2 / bul3) */
  animationPart: string | null
  /** จุดปล่อย — x นับจาก origin ของ .sam, y นับ "ขึ้นจากพื้น" (0 = ไม่ได้ระบุ) */
  start: Vec2
  /** หน่วยต่อ 1 ติ๊กของเกม — ไม่ใช่ต่อวินาที */
  moveSpeed: number
  angle: { start: number; end: number }
  motion: {
    type: string          // LINEAR / CURVE / DIRECT / NONE
    enabled: boolean
    rotation: string      // FIXED / ANGLE_LERP / ...
    loopNormal: boolean
  }
  /** 0 = ลงพื้น · 0<rate≤1 = บังคับชน FACE · อื่นๆ (เช่น 100) = ปกติ */
  hitPointRate: number | null
}

export type BasisType = 'self' | 'front' | 'rear'

export interface SkillInfo {
  /** 觸發基準 — self = บัฟ, front/rear = โจมตี */
  basis: { type: BasisType; multiplier?: number } | null
  /** รัศมีสกิล (หน่วย pt ของเกม) */
  area: number | null
}

export interface GameData {
  id: string
  render: { shadowCenter: Vec2 | null; faceCenter: Vec2 | null } | null
  attackRangePt: number | null
  moves: Record<AttackKind, MoveData | null>
  skills: Record<'skill1' | 'skill2', SkillInfo>
}

export async function loadGameData(id: string): Promise<GameData | null> {
  try {
    const res = await fetch(`/rangers/${encodeURIComponent(id)}/gamedata.json`)
    if (!res.ok) return null
    return (await res.json()) as GameData
  } catch {
    return null
  }
}
