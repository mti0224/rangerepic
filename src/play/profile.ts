// ====================================================
// profile.ts — ข้อมูลผู้เล่นของหน้าหลัก (Lobby): ชื่อ · เลเวล · เงิน · เพชร · พลังงาน
//
// ตอนนี้เก็บในเครื่อง (localStorage 'lr:profile') เป็นค่าตั้งต้นไว้ก่อน — ยังไม่มีเซิร์ฟเวอร์
// ระบบที่จะมาทีหลัง (ร้านค้า · กาชา · ด่าน) ให้อ่าน/เขียนผ่านไฟล์นี้ที่เดียว
// ย้ายไปเซิร์ฟเวอร์ทีหลังก็แก้แค่ load/save ในไฟล์นี้
// ====================================================

export interface Profile {
  name: string
  level: number
  /** ค่าประสบการณ์ในเลเวลปัจจุบัน */
  exp: number
  gold: number
  gem: number
  energy: number
  energyMax: number
}

const KEY = 'lr:profile'

export const DEFAULT_PROFILE: Profile = {
  name: 'Commander',
  level: 1,
  exp: 0,
  gold: 12500,
  gem: 2000,
  energy: 60,
  energyMax: 60,
}

/** ค่าประสบการณ์ที่ต้องใช้เพื่อขึ้นเลเวลถัดไป (สูตรชั่วคราว) */
export const expToNext = (level: number): number => 100 + (level - 1) * 80

export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null
    if (raw && typeof raw === 'object') return { ...DEFAULT_PROFILE, ...raw }
  } catch { /* ไม่มีค่าที่จำไว้ → ใช้ค่าตั้งต้น */ }
  return { ...DEFAULT_PROFILE }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* จำไม่ได้ก็เล่นได้ */ }
}

/** ตัวเลขแบบย่อ: 999 · 12,500 · 1.2M (ใช้กับเงิน/เพชรบนแถบบน) */
export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 100_000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('en-US')
}
