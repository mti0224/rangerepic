// ====================================================
// rangerClass.ts — ธาตุ ชนิด ตำแหน่ง และการสุ่มค่าพลังที่เหมาะกับตำแหน่ง
//
// ธาตุ: fire / water / wood วนชนะกัน · light กับ dark ชนะกันเอง
//   ชนะทาง ×2 · ธาตุเดียวกัน ×1 · แพ้ทาง ×0.5 · ไม่เกี่ยวกัน (เช่น light ตี fire) ×1
//
// ชนิด (ใช้จัดกลุ่มตำแหน่ง · ดาเมจใช้ ATK/DEF ชุดเดียวกันทุกชนิด)
//   str (พลัง)    สายกายภาพเลือดเยอะ  · ตำแหน่ง 坦克 / 戰士
//   agi (ว่องไว)  สายกายภาพคริ        · ตำแหน่ง 射手 / 刺客
//   int (ไหวพริบ) สายเวท              · ตำแหน่ง 法師 / 輔助
// ====================================================

import type { Stats } from './rangerConfig'

export type Element = 'fire' | 'water' | 'wood' | 'light' | 'dark'
export type Category = 'str' | 'agi' | 'int'
export type Role = 'tank' | 'fighter' | 'shooter' | 'assassin' | 'mage' | 'support'

export const ELEMENTS: Element[] = ['fire', 'water', 'wood', 'light', 'dark']
export const ELEMENT_LABEL: Record<Element, string> = {
  fire: '火（Fire）', water: '水（Water）', wood: '木（Wood）', light: '光（Light）', dark: '暗（Dark）',
}

/** ธาตุที่ธาตุนี้ชนะ */
const BEATS: Record<Element, Element[]> = {
  fire: ['wood'],
  wood: ['water'],
  water: ['fire'],
  light: ['dark'],
  dark: ['light'],
}

export const ELEMENT_WIN = 1.5
export const ELEMENT_LOSE = 0.5

/** ตัวคูณดาเมจตามธาตุ ผู้โจมตี → เป้า */
export function elementMultiplier(attacker: Element | undefined, target: Element | undefined): number {
  if (!attacker || !target || attacker === target) return 1
  if (BEATS[attacker].includes(target)) return ELEMENT_WIN
  if (BEATS[target].includes(attacker)) return ELEMENT_LOSE
  return 1
}

export const CATEGORY_LABEL: Record<Category, string> = {
  str: '力量型（STR）',
  agi: '敏捷型（AGI）',
  int: '智慧型（INT）',
}

export interface RoleInfo { category: Category; label: string; hint: string }

export const ROLES: Record<Role, RoleInfo> = {
  tank:     { category: 'str', label: '坦克',      hint: '體力高、耐打、攻擊較低' },
  fighter:  { category: 'str', label: '戰士',    hint: 'เลือดเยอะรองจาก坦克 แต่ตีแรงกว่า' },
  shooter:  { category: 'agi', label: '射手',     hint: '物理攻擊高、爆擊率高' },
  assassin: { category: 'agi', label: '刺客',     hint: '物理爆發高、爆擊率高、體力較低、速度快' },
  mage:     { category: 'int', label: '法師',     hint: '魔法攻擊高，通常擅長範圍攻擊' },
  support:  { category: 'int', label: '輔助',   hint: '魔法攻擊較低，偏重狀態效果與我方增益' },
}

export const rolesOf = (c: Category): Role[] => (Object.keys(ROLES) as Role[]).filter(r => ROLES[r].category === c)

/** ช่วงค่า [ต่ำสุด, สูงสุด] ของแต่ละค่าพลัง ต่อตำแหน่ง (อัตราต่างๆ เป็น %) */
type Range = [number, number]
type Profile = Record<keyof Stats, Range>

export const ROLE_PROFILES: Record<Role, Profile> = {
  tank:     { hp: [6500, 8000], atk: [220, 300], def: [400, 520], spd: [85, 100],  crit: [0, 5],   critDmg: [130, 150], evade: [5, 10],  hit: [0, 10],  skillEvade: [5, 15],  skillHit: [0, 10],  skillRes: [25, 40], skillDmgRes: [10, 20] },
  fighter:  { hp: [5000, 6000], atk: [380, 460], def: [260, 340], spd: [95, 110],  crit: [5, 15],  critDmg: [150, 170], evade: [5, 12],  hit: [5, 15],  skillEvade: [5, 12],  skillHit: [5, 15],  skillRes: [15, 25], skillDmgRes: [5, 15] },
  shooter:  { hp: [3500, 4200], atk: [470, 560], def: [160, 220], spd: [105, 120], crit: [15, 30], critDmg: [170, 200], evade: [8, 15],  hit: [15, 25], skillEvade: [5, 12],  skillHit: [5, 15],  skillRes: [5, 15],  skillDmgRes: [0, 10] },
  assassin: { hp: [2800, 3400], atk: [480, 560], def: [130, 190], spd: [110, 122], crit: [22, 37], critDmg: [170, 210], evade: [10, 18], hit: [10, 20], skillEvade: [8, 15],  skillHit: [5, 15],  skillRes: [0, 10],  skillDmgRes: [0, 8] },
  mage:     { hp: [3000, 3700], atk: [500, 600], def: [140, 200], spd: [95, 110],  crit: [5, 15],  critDmg: [150, 170], evade: [5, 10],  hit: [5, 15],  skillEvade: [5, 12],  skillHit: [20, 35], skillRes: [10, 25], skillDmgRes: [5, 15] },
  support:  { hp: [3800, 4500], atk: [360, 440], def: [200, 260], spd: [110, 125], crit: [0, 10],  critDmg: [140, 160], evade: [8, 15],  hit: [5, 15],  skillEvade: [10, 20], skillHit: [20, 35], skillRes: [20, 35], skillDmgRes: [5, 15] },
}

/** ปัดให้ตัวเลขดูเป็นค่าที่คนตั้ง: HP ลงหลัก 10 · ATK/DEF ลงหลัก 5 · ที่เหลือเป็นจำนวนเต็ม */
const STEP: Record<keyof Stats, number> = { hp: 10, atk: 5, def: 5, spd: 1, crit: 1, critDmg: 5, evade: 1, hit: 1, skillEvade: 1, skillHit: 1, skillRes: 1, skillDmgRes: 1 }

/** สุ่มค่าพลังในช่วงที่เหมาะกับตำแหน่ง · rand คืน 0–1 (ใส่เองได้เพื่อให้เทสได้ผลเดิม) */
export function randomStats(role: Role, rand: () => number = Math.random): Stats {
  const p = ROLE_PROFILES[role]
  const out = {} as Stats
  for (const k of Object.keys(p) as (keyof Stats)[]) {
    const [lo, hi] = p[k]
    const step = STEP[k]
    const v = lo + rand() * (hi - lo)
    out[k] = Math.min(hi, Math.max(lo, Math.round(v / step) * step))
  }
  return out
}

/** ชื่อค่าพลังที่แสดงในหน้า editor (ลำดับนี้ = ลำดับที่แสดง) */
export const STAT_LABEL: Record<keyof Stats, string> = {
  hp: '體力 (HP)', atk: '攻擊力 (ATK)', def: '防禦力 (DEF)', spd: '速度',
  crit: '爆擊率 %', critDmg: '爆擊傷害 %',
  evade: '閃避率 %', hit: '命中率 %',
  skillEvade: '技能閃避率 %', skillHit: '技能命中率 %', skillRes: '技能抗性 %',
  skillDmgRes: '技能傷害抗性 %',
}
