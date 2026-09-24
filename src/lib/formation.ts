// ====================================================
// formation.ts — โบนัสตามช่องที่วาง (แบบ Seven Knights Rebirth)
//
// แถวหน้า   รับหน้าแทนทีม → ถึกขึ้น (DEF / HP)       เหมาะกับ แทงค์ · ไฟเตอร์
// แถวหลัง   อยู่ปลอดภัยกว่า → ตีแรงขึ้น (ATK / คริ)   เหมาะกับ นักยิง · นักฆ่า · นักเวท · ซัพพอร์ต
//
// ทุกช่องในแถวเดียวกันได้โบนัสเท่ากัน (ช่องกลางแถวหลังไม่พิเศษ)
// สิทธิพิเศษเช่นตีข้ามแถวเป็นของ "ตำแหน่ง" ไม่ใช่ของช่อง — ดู lib/roleTraits.ts
//
// ตัวคูณ (mult) ใช้กับค่าเป็นจำนวน: HP / ATK / DEF / Speed
// ค่าบวก (add) ใช้กับค่าที่เป็น % อยู่แล้ว เช่น คริ 8 = +8 จุด
// ค่าพลังจริงคำนวณตอนเริ่มรบ (play/battle.ts) — ใน editor ยังเห็นค่าดิบตามที่ตั้งไว้
// ====================================================

import type { Row, Stats } from './rangerConfig'
import type { Role } from './rangerClass'

export interface PositionBonus {
  /** ชื่อแถวที่แสดงในหน้าจัดทีม */
  label: string
  mult: Partial<Record<keyof Stats, number>>
  add: Partial<Record<keyof Stats, number>>
  /** ตำแหน่ง (role) ที่เข้ากับแถวนี้ */
  fits: Role[]
}

export const FRONT_BONUS: PositionBonus = {
  label: 'แถวหน้า',
  mult: { def: 1.3, hp: 1.15 },
  add: {},
  fits: ['tank', 'fighter'],
}
export const BACK_BONUS: PositionBonus = {
  label: 'แถวหลัง',
  mult: { atk: 1.15 },
  add: { crit: 8 },
  fits: ['shooter', 'assassin', 'mage', 'support'],
}

export function positionBonus(row: Row, _lane?: number): PositionBonus {
  return row === 'front' ? FRONT_BONUS : BACK_BONUS
}

/** ค่าพลังหลังรวมโบนัสตำแหน่ง (ปัดเป็นจำนวนเต็ม) */
export function statsWithPosition(stats: Stats, row: Row, lane?: number): Stats {
  const b = positionBonus(row, lane)
  const out = { ...stats }
  for (const k of Object.keys(b.mult) as (keyof Stats)[]) out[k] = Math.round((out[k] ?? 0) * (b.mult[k] ?? 1))
  for (const k of Object.keys(b.add) as (keyof Stats)[]) out[k] = Math.round((out[k] ?? 0) + (b.add[k] ?? 0))
  return out
}

const STAT_SHORT: Partial<Record<keyof Stats, string>> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'Speed',
  crit: 'คริ', critDmg: 'คริดาเมจ', evade: 'หลบ', hit: 'แม่นยำ',
  skillEvade: 'หลบสกิล', skillHit: 'แม่นสกิล', skillRes: 'ต้านสกิล',
}

/** ข้อความโบนัสสั้นๆ เช่น "DEF +30% · HP +15%" */
export function bonusText(b: PositionBonus): string {
  const parts: string[] = []
  for (const k of Object.keys(b.mult) as (keyof Stats)[]) {
    parts.push(`${STAT_SHORT[k]} +${Math.round(((b.mult[k] ?? 1) - 1) * 100)}%`)
  }
  for (const k of Object.keys(b.add) as (keyof Stats)[]) {
    parts.push(`${STAT_SHORT[k]} +${b.add[k]}`)
  }
  return parts.join(' · ')
}

export const fitsSlot = (role: Role, row: Row, lane?: number): boolean => positionBonus(row, lane).fits.includes(role)
