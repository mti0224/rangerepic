// ====================================================
// gear.ts — อุปกรณ์ · เซ็ต · เลเวลฮีโร่ (ตามแผนเกม หน้า 8)
//
// เลเวลฮีโร่      เพิ่มเฉพาะ HP / ATK / DEF (อัตราต่างๆ ไม่เพิ่ม — ไปเพิ่มจากอุปกรณ์แทน)
// อุปกรณ์ 4 ช่อง  อาวุธ · เกราะ · เครื่องประดับ · คัมภีร์ (คัมภีร์ยังไม่มีของ — ช่องล็อกไว้)
// ระดับ 5 ขั้น     common · rare · epic · legend · mythic
// ตีบวกได้ +0 ถึง +20
//
// อุปกรณ์ 1 ชิ้นมีค่าพลัง 3 ส่วน
//   1. ค่าหลัก         ตายตัวตามแบบ (เช่น อาวุธ = ATK%) · ตีบวกแล้วโตเร็ว (+20 = ×2)
//   2. ค่าสุ่ม 3 บรรทัด  สุ่มตอนได้ของ แต่ละชิ้นจึงไม่เหมือนกัน · ตีบวกแล้วโตช้ากว่า (+20 = ×1.5)
//   3. ค่าธาตุ         สุ่มเหมือนกัน แต่ใช้ได้เฉพาะเมื่อธาตุอุปกรณ์ตรงกับธาตุฮีโร่
// + โบนัสเซ็ต (อาวุธ + เกราะ + เครื่องประดับ ชุดเดียวกัน) ครบ 2 ชิ้น / 3 ชิ้น
//
// หน่วยของค่าพลัง: HP / ATK / DEF / Speed = % ของค่าหลังคิดเลเวล · ที่เหลือ (อัตราต่างๆ) = บวกตรงๆ เป็นแต้ม
// ไฟล์นี้เป็นตรรกะล้วน (ไม่มี DOM) — ทั้งหน้าเล่นและชุดทดสอบใช้ร่วมกัน
// ====================================================

import type { Element } from './rangerClass'
import type { Stats } from './rangerConfig'
import type { PassiveDef } from './passives'

export type GearSlot = 'weapon' | 'armor' | 'acc'
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'acc']
export type Rarity = 'common' | 'rare' | 'epic' | 'legend' | 'mythic'
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legend', 'mythic']
export type StatKey = keyof Stats

/** ข้อความหลายภาษา (เรียงเหมือนภาษาของหน้าเล่น) */
export interface Named { en: string; th: string; zh: string; jp: string }

/** ค่าพลัง 1 บรรทัด */
export interface StatLine { stat: StatKey; value: number }

export const GEAR_MAX_LEVEL = 20
export const HERO_MAX_LEVEL = 60

/** ค่าที่คิดเป็น % ของค่าเดิม · นอกนั้นบวกตรงๆ */
export const PCT_STATS: StatKey[] = ['hp', 'atk', 'def', 'spd']
export const isPctStat = (k: StatKey): boolean => PCT_STATS.includes(k)

// ─────────────────────────────── เลเวลฮีโร่ ───────────────────────────────

/** HP / ATK / DEF ที่เลเวลสูงสุด = กี่เท่าของ Lv.1 · โตเป็นเส้นตรงเท่ากันทุกเลเวล (≈ +3.4% ของค่าตั้งต้นต่อเลเวล) */
export const HERO_MAX_MUL = 3
export const HERO_GROWTH = (HERO_MAX_MUL - 1) / (HERO_MAX_LEVEL - 1)
export const clampHeroLevel = (lv: number): number => Math.max(1, Math.min(HERO_MAX_LEVEL, Math.round(lv) || 1))
export const heroLevelMul = (lv: number): number => 1 + HERO_GROWTH * (clampHeroLevel(lv) - 1)
/** ศัตรูในด่านเลเวลเกินเพดานฮีโร่ได้ (สูตรเดียวกัน ไม่ตัดที่ Lv.60) */
export const enemyLevelMul = (lv: number): number => 1 + HERO_GROWTH * (Math.max(1, Math.round(lv) || 1) - 1)

// ─────────────────────────────── ตีบวก ───────────────────────────────

/** ค่าหลักโต 5%/ขั้น (+20 = ×2) · ค่าสุ่มและค่าธาตุโต 2.5%/ขั้น (+20 = ×1.5) */
export const MAIN_GROWTH = 0.05
export const SUB_GROWTH = 0.025
export const clampGearLevel = (lv: number): number => Math.max(0, Math.min(GEAR_MAX_LEVEL, Math.round(lv) || 0))
const round1 = (n: number) => Math.round(n * 10) / 10
export const mainAt = (line: StatLine, lv: number): StatLine => ({ stat: line.stat, value: round1(line.value * (1 + MAIN_GROWTH * clampGearLevel(lv))) })
export const subAt = (line: StatLine, lv: number): StatLine => ({ stat: line.stat, value: round1(line.value * (1 + SUB_GROWTH * clampGearLevel(lv))) })

// ─────────────────────────────── แบบอุปกรณ์ ───────────────────────────────

export interface GearTemplate {
  id: string
  slot: GearSlot
  rarity: Rarity
  element: Element
  set: SetId
  /** ค่าหลักที่ +0 */
  main: StatLine
  name: Named
  /** รูปไอคอน (public/gear/) */
  icon: string
}

export type SetId = 'blaze' | 'tide' | 'gale' | 'dawn' | 'masque'

export interface SetDef {
  id: SetId
  element: Element
  name: Named
  /** ครบ 2 ชิ้น */
  two: SetBonus
  /** ครบ 3 ชิ้น (ได้ของ 2 ชิ้นด้วย) */
  three: SetBonus
}
export interface SetBonus { stats?: StatLine[]; passives?: PassiveDef[] }

const L = (stat: StatKey, value: number): StatLine => ({ stat, value })
const N = (en: string, th: string, zh: string, jp: string): Named => ({ en, th, zh, jp })

/** เซ็ตสมมุติ 5 ชุด (ชุดละธาตุ) — โบนัสไม่ซ้ำกันเลยสักชุด และใช้ได้จริงในจอดวล */
export const SETS: Record<SetId, SetDef> = {
  blaze: {
    id: 'blaze', element: 'fire', name: N('Festival Blaze', 'เทศกาลเพลิง', '祭典烈焰', '祭り炎'),
    two: { stats: [L('atk', 10)] },
    three: { passives: [{ type: 'execute', pct: 25 }] },
  },
  tide: {
    id: 'tide', element: 'water', name: N('Tidewatch', 'ผู้เฝ้าคลื่น', '觀潮', '潮見'),
    two: { stats: [L('hp', 12)] },
    three: { passives: [{ type: 'tough', pct: 12 }] },
  },
  gale: {
    id: 'gale', element: 'wood', name: N('Spring Gale', 'วายุวสันต์', '春日疾風', '春疾風'),
    two: { stats: [L('spd', 8)] },
    three: { passives: [{ type: 'healUp', pct: 25 }] },
  },
  dawn: {
    id: 'dawn', element: 'light', name: N('Dawnguard', 'ผู้พิทักษ์รุ่งอรุณ', '曙光守護', '暁の守護'),
    two: { stats: [L('def', 15)] },
    three: { passives: [{ type: 'lifesteal', pct: 12 }] },
  },
  masque: {
    id: 'masque', element: 'dark', name: N('Midnight Masque', 'หน้ากากเที่ยงคืน', '午夜假面', '真夜中の仮面'),
    two: { stats: [L('crit', 8)] },
    three: { stats: [L('critDmg', 30), L('skillHit', 10)] },
  },
}
export const SET_IDS = Object.keys(SETS) as SetId[]

const G = (id: string, slot: GearSlot, rarity: Rarity, element: Element, set: SetId, main: StatLine, name: Named): GearTemplate =>
  ({ id, slot, rarity, element, set, main, name, icon: `/gear/${id}.png` })

/** อุปกรณ์ทดสอบ 15 แบบ (อาวุธ 5 · เกราะ 5 · เครื่องประดับ 5) — เซ็ตละ 3 ชิ้น */
export const GEAR: GearTemplate[] = [
  // ── อาวุธ (ค่าหลัก = ATK%) ──
  G('katana_blaze', 'weapon', 'legend', 'fire', 'blaze', L('atk', 24),
    N('Blazing Festival Katana', 'คาตานะเทศกาลเพลิง', '祭典烈焰武士刀', '祭り炎の刀')),
  G('blade_frost', 'weapon', 'mythic', 'water', 'tide', L('atk', 28),
    N('Frostfeather Blade', 'ดาบขนนกน้ำแข็ง', '霜羽之刃', '霜羽の刃')),
  G('katana_breeze', 'weapon', 'rare', 'wood', 'gale', L('atk', 16),
    N('Breeze Katana', 'คาตานะสายลม', '微風武士刀', 'そよ風の刀')),
  G('sword_dawn', 'weapon', 'epic', 'light', 'dawn', L('atk', 20),
    N('Dawnguard Broadsword', 'ดาบใหญ่ผู้พิทักษ์รุ่งอรุณ', '曙光守護大劍', '暁の守護大剣')),
  G('katana_shade', 'weapon', 'legend', 'dark', 'masque', L('atk', 22),
    N('Shade Katana', 'คาตานะเงามืด', '暗影武士刀', '影の刀')),

  // ── เกราะ (ค่าหลัก = HP% / DEF% / Speed% / หลบ) ──
  G('coat_crimson', 'armor', 'epic', 'fire', 'blaze', L('hp', 20),
    N('Crimson Parade Coat', 'เสื้อคลุมขบวนแห่สีชาด', '緋紅遊行大衣', '緋色のパレードコート')),
  G('haori_tide', 'armor', 'legend', 'water', 'tide', L('hp', 24),
    N('Tidewatch Haori', 'ฮาโอริผู้เฝ้าคลื่น', '觀潮羽織', '潮見の羽織')),
  G('boots_gale', 'armor', 'epic', 'wood', 'gale', L('spd', 8),
    N('Gale Wing Boots', 'รองเท้าปีกวายุ', '疾風之翼靴', '疾風の翼ブーツ')),
  G('plate_dawn', 'armor', 'legend', 'light', 'dawn', L('def', 22),
    N('Dawnguard Plate', 'เกราะผู้พิทักษ์รุ่งอรุณ', '曙光守護鎧', '暁の守護鎧')),
  G('tux_masque', 'armor', 'rare', 'dark', 'masque', L('evade', 8),
    N('Masquerade Tuxedo', 'ทักซิโดงานหน้ากาก', '假面舞會燕尾服', '仮面舞踏会のタキシード')),

  // ── เครื่องประดับ (ค่าหลักหลากหลาย) ──
  G('brush_flame', 'acc', 'rare', 'fire', 'blaze', L('crit', 8),
    N('Ember Brush', 'พู่กันถ่านเพลิง', '餘燼毛筆', '残り火の筆')),
  G('chime_frost', 'acc', 'epic', 'water', 'tide', L('skillRes', 12),
    N('Frost Duck Wind Chime', 'กระดิ่งลมเป็ดน้ำแข็ง', '冰霜小鴨風鈴', '氷鴨の風鈴')),
  G('bouquet_spring', 'acc', 'common', 'wood', 'gale', L('def', 10),
    N('Spring Bouquet', 'ช่อดอกไม้วสันต์', '春日花束', '春のブーケ')),
  G('cookie_brown', 'acc', 'rare', 'light', 'dawn', L('hit', 10),
    N('Brown’s Sunny Cookie', 'คุกกี้ตะวันของบราวน์', '熊大陽光餅乾', 'ブラウンのお日さまクッキー')),
  G('bandana_star', 'acc', 'common', 'dark', 'masque', L('critDmg', 15),
    N('Night Star Bandana', 'ผ้าโพกหัวดาวรัตติกาล', '暗夜之星頭巾', '夜星のバンダナ')),
]
export const GEAR_BY_ID: Record<string, GearTemplate> = Object.fromEntries(GEAR.map(g => [g.id, g]))

// ─────────────────────────────── ค่าสุ่ม ───────────────────────────────

/** ช่วงค่าสุ่มที่ระดับ legend (ระดับอื่นคูณ RARITY_MUL) */
const SUB_RANGE: Record<StatKey, [number, number]> = {
  hp: [4, 8], atk: [4, 8], def: [4, 8], spd: [2, 5],
  crit: [2, 6], critDmg: [4, 10], evade: [2, 5], hit: [2, 5],
  skillEvade: [2, 6], skillHit: [3, 7], skillRes: [3, 7], skillDmgRes: [2, 6],
}
export const SUB_STATS = Object.keys(SUB_RANGE) as StatKey[]
export const RARITY_MUL: Record<Rarity, number> = { common: 0.5, rare: 0.7, epic: 0.85, legend: 1, mythic: 1.2 }
/** ค่าธาตุแรงกว่าค่าสุ่มปกติ (เป็นรางวัลของการจับคู่ธาตุ) */
export const ELEMENT_LINE_MUL = 1.5
export const SUB_COUNT = 3

/** ตัวสุ่มแบบกำหนดเมล็ดได้ (mulberry32) — ของชิ้นเดิมสุ่มกี่ครั้งก็ได้ผลเดิม */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** สุ่มค่าสุ่ม 3 บรรทัด + ค่าธาตุ 1 บรรทัด (ไม่ซ้ำกันและไม่ซ้ำค่าหลัก) */
export function rollLines(tpl: GearTemplate, seed: number): { subs: StatLine[]; elem: StatLine } {
  const r = seededRandom(seed)
  const pool = SUB_STATS.filter(k => k !== tpl.main.stat)
  const take = (): StatKey => pool.splice(Math.floor(r() * pool.length), 1)[0]
  const roll = (k: StatKey, mul: number): StatLine => {
    const [lo, hi] = SUB_RANGE[k]
    const v = (lo + r() * (hi - lo)) * RARITY_MUL[tpl.rarity] * mul
    return { stat: k, value: Math.max(1, Math.round(v)) }
  }
  const subs = Array.from({ length: SUB_COUNT }, () => roll(take(), 1))
  return { subs, elem: roll(take(), ELEMENT_LINE_MUL) }
}

// ─────────────────────────────── ของในกระเป๋า ───────────────────────────────

/** อุปกรณ์ 1 ชิ้นที่ผู้เล่นมี */
export interface GearItem {
  uid: string
  tpl: string
  /** +0 ถึง +20 */
  level: number
  subs: StatLine[]
  elem: StatLine
}

/** ค่าพลังทุกบรรทัดของชิ้นนี้ ณ ขั้นตีบวกปัจจุบัน (ค่าธาตุนับเฉพาะเมื่อธาตุตรง) */
export function itemLines(item: GearItem, heroElement?: Element): { main: StatLine; subs: StatLine[]; elem: StatLine; elemOn: boolean } {
  const tpl = GEAR_BY_ID[item.tpl]
  return {
    main: mainAt(tpl.main, item.level),
    subs: item.subs.map(s => subAt(s, item.level)),
    elem: subAt(item.elem, item.level),
    elemOn: !!heroElement && heroElement === tpl.element,
  }
}

/** เซ็ตที่ใส่อยู่ → จำนวนชิ้น */
export function setCounts(items: GearItem[]): Partial<Record<SetId, number>> {
  const out: Partial<Record<SetId, number>> = {}
  for (const it of items) {
    const s = GEAR_BY_ID[it.tpl]?.set
    if (s) out[s] = (out[s] ?? 0) + 1
  }
  return out
}

/** โบนัสเซ็ตที่ทำงานอยู่ */
export function activeSetBonuses(items: GearItem[]): SetBonus[] {
  const out: SetBonus[] = []
  for (const [id, n] of Object.entries(setCounts(items)) as [SetId, number][]) {
    if (n >= 2) out.push(SETS[id].two)
    if (n >= 3) out.push(SETS[id].three)
  }
  return out
}

/** ทุกบรรทัดที่มีผลจริงกับฮีโร่ (อุปกรณ์ + ค่าธาตุที่ตรง + โบนัสเซ็ต) */
export function gearStatLines(items: GearItem[], heroElement?: Element): StatLine[] {
  const lines: StatLine[] = []
  for (const it of items) {
    if (!GEAR_BY_ID[it.tpl]) continue
    const l = itemLines(it, heroElement)
    lines.push(l.main, ...l.subs)
    if (l.elemOn) lines.push(l.elem)
  }
  for (const b of activeSetBonuses(items)) lines.push(...(b.stats ?? []))
  return lines
}

/** พาสซีฟจากโบนัสเซ็ต 3 ชิ้น */
export const gearPassives = (items: GearItem[]): PassiveDef[] =>
  activeSetBonuses(items).flatMap(b => b.passives ?? [])

/**
 * ค่าพลังจริงของฮีโร่ = ค่าตั้งต้น → เลเวล (HP/ATK/DEF) → อุปกรณ์
 * HP/ATK/DEF/Speed ของอุปกรณ์เป็น % ของค่าหลังคิดเลเวล · อัตราต่างๆ บวกตรงๆ
 */
export function effectiveStats(base: Stats, level: number, items: GearItem[], heroElement?: Element, uncapped = false): Stats {
  const mul = uncapped ? enemyLevelMul(level) : heroLevelMul(level)
  const s: Stats = { ...base, skillDmgRes: base.skillDmgRes ?? 0 }
  s.hp = base.hp * mul
  s.atk = base.atk * mul
  s.def = base.def * mul
  const pct: Partial<Record<StatKey, number>> = {}
  const flat: Partial<Record<StatKey, number>> = {}
  for (const l of gearStatLines(items, heroElement)) {
    const bag = isPctStat(l.stat) ? pct : flat
    bag[l.stat] = (bag[l.stat] ?? 0) + l.value
  }
  for (const k of Object.keys(s) as StatKey[]) {
    const v = (s[k] ?? 0) * (1 + (pct[k] ?? 0) / 100) + (flat[k] ?? 0)
    s[k] = Math.round(v)
  }
  return s
}
