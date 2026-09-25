// ====================================================
// stages.ts — ด่านโหมดเนื้อเรื่อง (3 บท × 10 ด่าน) · ดาว 3 ดวง · รางวัล
//
// ด่านเรียงซ้าย → ขวา · ผ่านด่านก่อนหน้า = ปลดล็อคด่านถัดไป
// ด่านบอส (ด่าน 5 และ 10 ของทุกบท) ใช้ปุ่มบอส · ผ่าน 1-10 = ปลดล็อค 2-1 (ต่อเนื่องข้ามบท) และศัตรูตัวบอสมีเลือดคูณ BOSS_HP_MUL
// ศัตรูมีเลเวล (คิดค่าพลังด้วยสูตรเดียวกับฮีโร่ผู้เล่น: lib/gear.ts → effectiveStats) · ยังไม่มีอุปกรณ์
//
// ดาว:  ★ ชนะ · ★★ ไม่มีฮีโร่ฝั่งเราล้ม · ★★★ ชนะภายใน turnGoal เทิร์น
// รางวัล: เงินทุกครั้งที่ชนะ · ผ่านครั้งแรก = เพชร + อุปกรณ์ 1 ชิ้นแน่นอน · เล่นซ้ำ = ลุ้นอุปกรณ์ DROP_CHANCE
// ไฟล์นี้เป็นตรรกะล้วน — หน้าแผนที่ · จอดวล · ชุดทดสอบใช้ร่วมกัน
// ====================================================

import type { Named } from './gear'

/** ช่องในทีมศัตรู (ตรงกับ TeamBuilder / collection) */
export type EnemySlot = 'front-0' | 'front-1' | 'back-0' | 'back-1' | 'back-2'

export interface StageEnemy { slot: EnemySlot; id: string; level: number; boss?: boolean }

export interface StageDef {
  id: string
  /** บทที่ (1–3) */
  chapter: number
  /** ลำดับในบท (1–10) — เขียนบนปุ่ม */
  no: number
  /** ป้ายด่าน เช่น "2-5" */
  label: string
  boss: boolean
  enemies: StageEnemy[]
  /** ★★★ ต้องชนะภายในกี่เทิร์น (เทิร์น = ทุกครั้งที่มีตัวละครได้เล่น นับรวมสองฝั่ง) */
  turnGoal: number
  /** พลังงานที่ใช้ (ตอนทดสอบยังไม่หัก — CHARGE_ENERGY) */
  energy: number
  /** เงินที่ได้ทุกครั้งที่ชนะ */
  gold: number
  /** เพชรครั้งแรกที่ผ่าน */
  firstGem: number
  /** อุปกรณ์ที่อาจดรอป (แบบ) */
  drops: string[]
}

export const CHARGE_ENERGY = false
/** เลือดตัวบอส × เท่านี้ */
export const BOSS_HP_MUL = 2.5
/** เล่นซ้ำ: โอกาสได้อุปกรณ์ */
export const DROP_CHANCE = 0.25
/** ด่านต่อบท (แผนที่หนึ่งหน้า) */
export const STAGES_PER_CHAPTER = 10

export interface ChapterDef { no: number; name: Named }
export const CHAPTERS: ChapterDef[] = [
  { no: 1, name: { en: 'Chapter 1 · Whispering Woods', th: 'บทที่ 1 · ป่ากระซิบ', zh: '第 1 章 · 細語森林', jp: '第1章 · ささやきの森' } },
  { no: 2, name: { en: 'Chapter 2 · Ember Canyon', th: 'บทที่ 2 · หุบเขาเพลิง', zh: '第 2 章 · 餘燼峽谷', jp: '第2章 · 残り火の峡谷' } },
  { no: 3, name: { en: 'Chapter 3 · Shadow Citadel', th: 'บทที่ 3 · ป้อมเงา', zh: '第 3 章 · 暗影要塞', jp: '第3章 · 影の城塞' } },
]

/** [ช่อง, รหัสเรนเจอร์, เป็นบอสไหม] */
type Row = [EnemySlot, string, boolean?]
const F0: EnemySlot = 'front-0', F1: EnemySlot = 'front-1', B0: EnemySlot = 'back-0', B1: EnemySlot = 'back-1', B2: EnemySlot = 'back-2'

/**
 * ด่านทั้งหมด 30 ด่าน (บทละ 10 · บอสด่าน 5 และ 10 ของทุกบท)
 * lv = เลเวลศัตรู (บอส +3) · ศัตรูเลเวลเกิน 60 ได้ (ใช้สูตรเดียวกับฮีโร่แต่ไม่ตัดเพดาน)
 */
const PLAN: { chapter: number; lv: number; boss?: boolean; team: Row[]; drops: string[] }[] = [
  // ── บทที่ 1 · ป่ากระซิบ ──
  { chapter: 1, lv: 1, team: [[F0, 'u1341e-brown'], [B0, 'u1052h-sonic']], drops: ['bouquet_spring', 'bandana_star'] },
  { chapter: 1, lv: 3, team: [[F0, 'u1150h-shion'], [B0, 'u1031h-kagome'], [B1, 'u1096h-natsumi']], drops: ['bouquet_spring', 'katana_breeze'] },
  { chapter: 1, lv: 6, team: [[F0, 'u1068h-gourry'], [F1, 'u1216h-towa'], [B0, 'u1112h-sakura'], [B1, 'u1116h-claris']], drops: ['brush_flame', 'cookie_brown'] },
  { chapter: 1, lv: 9, team: [[F0, 'u1227h-adam'], [F1, 'u1129h-meliodas'], [B0, 'u1032h-kikyou'], [B1, 'u1156h-ais'], [B2, 'u1183h-priestess']], drops: ['tux_masque', 'katana_breeze'] },
  { chapter: 1, lv: 13, boss: true, team: [[F0, 'u1315e-moon', true], [B0, 'u1317e-brown'], [B1, 'u1550e-moon']], drops: ['coat_crimson', 'boots_gale', 'sword_dawn'] },
  { chapter: 1, lv: 17, team: [[F0, 'u1129h-meliodas'], [F1, 'u1347h-hc'], [B0, 'u1199h-erza'], [B1, 'u1157h-ryuu'], [B2, 'u1217h-setsuna']], drops: ['boots_gale', 'chime_frost'] },
  { chapter: 1, lv: 21, team: [[F0, 'u1225h-lubu'], [F1, 'u1470e-la'], [B0, 'u1263e-em'], [B1, 'u1114h-azami'], [B2, 'u1069h-zelga']], drops: ['chime_frost', 'sword_dawn'] },
  { chapter: 1, lv: 25, team: [[F0, 'u1451e-sg'], [F1, 'u1277e-brown'], [B0, 'u1281e-lv'], [B1, 'u1357e-mg'], [B2, 'u1447e-jessica']], drops: ['katana_blaze', 'coat_crimson'] },
  { chapter: 1, lv: 30, team: [[F0, 'u1251e-ov'], [F1, 'u1279e-er'], [B0, 'u1247e-bk'], [B1, 'u1294e-rt'], [B2, 'u1378e-se']], drops: ['plate_dawn', 'haori_tide', 'katana_shade'] },
  { chapter: 1, lv: 36, boss: true, team: [[F0, 'u1296e-db', true], [F1, 'u1353e-brown'], [B0, 'u1306e-az'], [B1, 'u1438e-iz'], [B2, 'u1297h-sn']], drops: ['blade_frost', 'katana_blaze', 'plate_dawn', 'haori_tide'] },
  // ── บทที่ 2 · หุบเขาเพลิง ──
  { chapter: 2, lv: 39, team: [[F0, 'u1544h-ja'], [F1, 'u1113h-hatsuho'], [B0, 'u1111h-seijuro'], [B1, 'u1032h-kikyou'], [B2, 'u1096h-natsumi']], drops: ['brush_flame', 'coat_crimson'] },
  { chapter: 2, lv: 41, team: [[F0, 'u1233h-yoh'], [F1, 'u1277e-brown'], [B0, 'u1149h-milim'], [B1, 'u1031h-kagome'], [B2, 'u1112h-sakura']], drops: ['katana_blaze', 'brush_flame'] },
  { chapter: 2, lv: 43, team: [[F0, 'u1546e-brown'], [F1, 'u1451e-sg'], [B0, 'u286u-brown'], [B1, 'u1147h-benimaru'], [B2, 'u1436e-uz']], drops: ['coat_crimson', 'katana_blaze'] },
  { chapter: 2, lv: 45, team: [[F0, 'u1296e-db'], [F1, 'u1315e-moon'], [B0, 'u1447e-jessica'], [B1, 'u1357e-mg'], [B2, 'u1505e-so']], drops: ['katana_blaze', 'sword_dawn'] },
  { chapter: 2, lv: 48, boss: true, team: [[F0, 'u1546e-brown', true], [F1, 'u1113h-hatsuho'], [B0, 'u1524e-ak'], [B1, 'u1306e-az'], [B2, 'u1297h-sn']], drops: ['katana_blaze', 'coat_crimson', 'blade_frost'] },
  { chapter: 2, lv: 50, team: [[F0, 'u1225h-lubu'], [F1, 'u1216h-towa'], [B0, 'u1075h-ken'], [B1, 'u1116h-claris'], [B2, 'u1114h-azami']], drops: ['haori_tide', 'chime_frost'] },
  { chapter: 2, lv: 52, team: [[F0, 'u1068h-gourry'], [F1, 'u1355e-aq'], [B0, 'u1046h-build'], [B1, 'u1046h-build'], [B2, 'u1183h-priestess']], drops: ['chime_frost', 'blade_frost'] },
  { chapter: 2, lv: 54, team: [[F0, 'u1194h-ghislaine'], [F1, 'u1470e-la'], [B0, 'u1069h-zelga'], [B1, 'u1438e-iz'], [B2, 'u1588e-es']], drops: ['haori_tide', 'blade_frost'] },
  { chapter: 2, lv: 56, team: [[F0, 'u1520e-de'], [F1, 'u1541e-ri'], [B0, 'u1052h-sonic'], [B1, 'u1294e-rt'], [B2, 'u1156h-ais']], drops: ['blade_frost', 'haori_tide', 'plate_dawn'] },
  { chapter: 2, lv: 60, boss: true, team: [[F0, 'u1618e-ka', true], [F1, 'u1341e-brown'], [B0, 'u1263e-em'], [B1, 'u1342h-bd'], [B2, 'u1378e-se']], drops: ['blade_frost', 'haori_tide', 'plate_dawn', 'katana_shade'] },
  // ── บทที่ 3 · ป้อมเงา ──
  { chapter: 3, lv: 61, team: [[F0, 'u1353e-brown'], [F1, 'u1483e-brown'], [B0, 'u1292e-moon'], [B1, 'u1051h-yomi'], [B2, 'u1339e-moon']], drops: ['katana_shade', 'tux_masque'] },
  { chapter: 3, lv: 63, team: [[F0, 'u1341e-brown'], [F1, 'u1050h-ama'], [B0, 'u1317e-brown'], [B1, 'u1260e-brown'], [B2, 'u1518e-ron']], drops: ['plate_dawn', 'sword_dawn'] },
  { chapter: 3, lv: 65, team: [[F0, 'u1111h-seijuro'], [F1, 'u1129h-meliodas'], [B0, 'u1421e-tk'], [B1, 'u1103h-taiga'], [B2, 'u1148h-souei']], drops: ['boots_gale', 'katana_breeze'] },
  { chapter: 3, lv: 67, team: [[F0, 'u1227h-adam'], [F1, 'u1347h-hc'], [B0, 'u1031h-kagome'], [B1, 'u1115h-anastasia'], [B2, 'u1217h-setsuna']], drops: ['bouquet_spring', 'boots_gale'] },
  { chapter: 3, lv: 70, boss: true, team: [[F0, 'u1279e-er', true], [F1, 'u1507e-sz'], [B0, 'u1395e-brown'], [B1, 'u1434e-boss'], [B2, 'u1298h-vt']], drops: ['katana_shade', 'plate_dawn', 'blade_frost'] },
  { chapter: 3, lv: 72, team: [[F0, 'u1251e-ov'], [F1, 'u1150h-shion'], [B0, 'u1550e-moon'], [B1, 'u1329e-moon'], [B2, 'u1199h-erza']], drops: ['katana_shade', 'bandana_star'] },
  { chapter: 3, lv: 74, team: [[F0, 'u1225h-lubu'], [F1, 'u1129h-meliodas'], [B0, 'u1387e-sally'], [B1, 'u1096h-natsumi'], [B2, 'u1281e-lv']], drops: ['cookie_brown', 'plate_dawn'] },
  { chapter: 3, lv: 76, team: [[F0, 'u1296e-db'], [F1, 'u1451e-sg'], [B0, 'u1247e-bk'], [B1, 'u1372e-fr'], [B2, 'u1543e-za']], drops: ['katana_blaze', 'katana_shade'] },
  { chapter: 3, lv: 78, team: [[F0, 'u1470e-la'], [F1, 'u1355e-aq'], [B0, 'u1631e-sally'], [B1, 'u1209h-shinmon'], [B2, 'u1487e-moon']], drops: ['blade_frost', 'plate_dawn', 'katana_shade'] },
  { chapter: 3, lv: 82, boss: true, team: [[F0, 'u1353e-brown', true], [F1, 'u1341e-brown'], [B0, 'u1306e-az'], [B1, 'u1294e-rt'], [B2, 'u1297h-sn']], drops: ['blade_frost', 'katana_shade', 'plate_dawn', 'haori_tide'] },
]

export const STAGES: StageDef[] = PLAN.map((p, i) => {
  const no = (i % STAGES_PER_CHAPTER) + 1
  const boss = !!p.boss
  return {
    id: `c${p.chapter}-${no}`,
    chapter: p.chapter,
    no,
    label: `${p.chapter}-${no}`,
    boss,
    enemies: p.team.map(([slot, id, isBoss]) => ({ slot, id, level: isBoss ? p.lv + 3 : p.lv, ...(isBoss ? { boss: true } : {}) })),
    turnGoal: 20 + no * 2 + (p.chapter - 1) * 4,
    energy: 5 + Math.floor((i + 1) / 3),
    gold: (300 + (i + 1) * 150) * (boss ? 2 : 1),
    firstGem: boss ? 100 + (p.chapter - 1) * 50 : 30 + (p.chapter - 1) * 10,
    drops: p.drops,
  }
})
export const stageById = (id: string): StageDef | undefined => STAGES.find(s => s.id === id)
export const stagesOf = (chapter: number): StageDef[] => STAGES.filter(s => s.chapter === chapter)

// ─────────────────────────────── ความคืบหน้า ───────────────────────────────

/** ดาวที่ได้ของแต่ละด่าน (ไม่เคยผ่าน = ไม่มีคีย์) */
export type StarMap = Record<string, number>

/** ด่านปัจจุบัน = ด่านแรกที่ยังไม่ผ่าน · ผ่านหมดแล้ว = -1 */
export function currentIndex(stars: StarMap): number {
  return STAGES.findIndex(s => !(stars[s.id] > 0))
}

export type StageState = 'cleared' | 'current' | 'locked'
export function stageState(index: number, stars: StarMap): StageState {
  const cur = currentIndex(stars)
  if (cur === -1 || index < cur) return 'cleared'
  return index === cur ? 'current' : 'locked'
}

/** ผลการดวล → ดาว (แพ้ = 0) */
export function starsFor(result: { win: boolean; alliesLost: number; turns: number }, stage: StageDef): number {
  if (!result.win) return 0
  return 1 + (result.alliesLost === 0 ? 1 : 0) + (result.turns <= stage.turnGoal ? 1 : 0)
}

/** รางวัลของการชนะครั้งนี้ · rand = ตัวสุ่ม 0–1 (ส่งเข้ามาเพื่อให้ทดสอบได้) */
export function rewardFor(stage: StageDef, firstClear: boolean, rand: () => number): { gold: number; gem: number; gear: string | null } {
  const pickDrop = () => stage.drops[Math.floor(rand() * stage.drops.length)] ?? null
  return {
    gold: stage.gold,
    gem: firstClear ? stage.firstGem : 0,
    gear: firstClear ? pickDrop() : rand() < DROP_CHANCE ? pickDrop() : null,
  }
}
