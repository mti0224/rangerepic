// ====================================================
// seasonPass.ts — ซีซั่นพาส 60 เลเวล: แถวล่าง = ฟรี · แถวบน = พรีเมียม (เติมเงิน)
//
// ของดีทุก 10 เลเวล (ช่องใหญ่): ฟรี = อุปกรณ์ระดับสูง / เพชรก้อนใหญ่ · พรีเมียม = เรนเจอร์
// เลเวลอื่น: เงิน · เพชร · อุปกรณ์เล็กๆ สลับกันไป
// ตอนทดสอบ: ปรับเลเวลได้อิสระ · ปลดล็อคพรีเมียมฟรี (collection.ts → pass)
// ไฟล์นี้เป็นตรรกะล้วน — หน้าซีซั่นพาสและชุดทดสอบใช้ร่วมกัน
// ====================================================

import type { Named } from './gear'

export const PASS_MAX = 60
/** ของดีทุกกี่เลเวล */
export const PASS_MILESTONE = 10

export type PassReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'gem'; amount: number }
  | { kind: 'gear'; tpl: string }
  | { kind: 'ranger'; id: string }

export interface PassLevel {
  level: number
  /** ช่องใหญ่ (ทุก 10 เลเวล) */
  big: boolean
  free: PassReward
  premium: PassReward
}

export const SEASON: { no: number; name: Named; days: number } = {
  no: 1,
  name: { en: 'Season 1 · Dawn of Rangers', th: 'ซีซั่น 1 · รุ่งอรุณแห่งเรนเจอร์', zh: '第 1 季 · 遊俠黎明', jp: 'シーズン1 · レンジャーの夜明け' },
  days: 30,
}

/** ของดีทุก 10 เลเวล */
const FREE_BIG: PassReward[] = [
  { kind: 'gear', tpl: 'katana_blaze' }, { kind: 'gem', amount: 300 }, { kind: 'gear', tpl: 'plate_dawn' },
  { kind: 'gem', amount: 500 }, { kind: 'gear', tpl: 'haori_tide' }, { kind: 'gear', tpl: 'blade_frost' },
]
const PREMIUM_BIG: PassReward[] = [
  { kind: 'ranger', id: 'u1618e-ka' }, { kind: 'ranger', id: 'u1541e-ri' }, { kind: 'ranger', id: 'u1306e-az' },
  { kind: 'ranger', id: 'u1279e-er' }, { kind: 'ranger', id: 'u1631e-sally' }, { kind: 'ranger', id: 'u1296e-db' },
]
/** อุปกรณ์เล็ก (ฟรี) · อุปกรณ์กลาง (พรีเมียม) วนตามลำดับ */
const FREE_GEAR = ['bouquet_spring', 'bandana_star', 'brush_flame', 'cookie_brown', 'katana_breeze', 'tux_masque']
const PREMIUM_GEAR = ['sword_dawn', 'coat_crimson', 'boots_gale', 'chime_frost', 'katana_shade', 'haori_tide']

export const PASS_LEVELS: PassLevel[] = Array.from({ length: PASS_MAX }, (_, i) => {
  const level = i + 1
  const big = level % PASS_MILESTONE === 0
  const m = level / PASS_MILESTONE - 1
  const free: PassReward = big ? FREE_BIG[m]
    : level % 5 === 0 ? { kind: 'gem', amount: 50 }
      : level % 3 === 0 ? { kind: 'gear', tpl: FREE_GEAR[Math.floor(level / 3) % FREE_GEAR.length] }
        : { kind: 'gold', amount: 500 + level * 50 }
  const premium: PassReward = big ? PREMIUM_BIG[m]
    : level % 5 === 0 ? { kind: 'gear', tpl: PREMIUM_GEAR[Math.floor(level / 5) % PREMIUM_GEAR.length] }
      : level % 2 === 0 ? { kind: 'gem', amount: 100 }
        : { kind: 'gold', amount: 2000 + level * 100 }
  return { level, big, free, premium }
})

export type PassTrack = 'free' | 'premium'
/** รหัสช่อง เช่น "f12" / "p30" (ใช้จำว่ารับไปแล้ว) */
export const passKey = (track: PassTrack, level: number): string => (track === 'free' ? 'f' : 'p') + level
export const clampPassLevel = (lv: number): number => Math.max(1, Math.min(PASS_MAX, Math.round(lv) || 1))

/** ช่องนี้รับได้ไหม (ถึงเลเวล · ยังไม่รับ · พรีเมียมต้องปลดล็อคก่อน) */
export function canClaim(track: PassTrack, level: number, state: { level: number; premium: boolean; claimed: string[] }): boolean {
  if (level > state.level) return false
  if (track === 'premium' && !state.premium) return false
  return !state.claimed.includes(passKey(track, level))
}
