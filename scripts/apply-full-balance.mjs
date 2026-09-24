// ====================================================
// apply-full-balance.mjs — ตั้งค่าสมดุลใหม่ให้เรนเจอร์ที่อนุมัติแล้วทุกตัว (ranger.json)
//   node scripts/apply-full-balance.mjs [--dry]
//
// ไม่แตะ: ชื่อ · ธาตุ · ชนิด · ตำแหน่ง · ท่าทาง · ประเภทสกิล (โจมตี/บัฟ) — สคริปต์เช็คให้ ถ้าประเภทไม่ตรงจะหยุด
// ปรับ:   ค่าพลัง · Cost · ความกว้าง · ความสามารถของสกิล (ออกแบบจากชื่อ/คำอธิบายสกิลในเกม + ธาตุ/ชนิด/ตำแหน่ง)
// ไฟล์เดิมสำรองไว้ที่ data/backup/before-full-balance/<id>.json (ครั้งแรกที่รันเท่านั้น — รันซ้ำไม่ทับของเดิม)
//
// ── งบพลังของสกิล (ดาเมจ % ของ ATK) ──
//   Cost 2: เดี่ยว ~300 · ทั้งแถว ~200 · ทั้งหมด ~140
//   Cost 3: เดี่ยว ~400 · ทั้งแถว ~270 · ทั้งหมด ~190
//   Cost 4: เดี่ยว ~500 · ทั้งแถว ~340 · ทั้งหมด ~240
//   ความสามารถเสริมหักจากดาเมจ: ชะงัก ~80 · ห้ามใช้ทักษะ ~40 · ลด ATK ~40 · ลดความเร็ว ~35 · ยกเลิกบัฟ ~30 ·
//   ดาเมจต่อเนื่อง ~50 · ลดค่าอื่นๆ 20% ~20–25 · ห้ามฟื้นฟู ~20 · ยกเลิกอมตะ ~20 (ทั้งแถว ×1.6 · ทั้งหมด ×2.5)
// ── งบบัฟ (แต้ม) Cost 2 ~300 · Cost 3 ~400 · Cost 4 ~500 ──
//   ต่อ 1 ตัว: ฮีล 20% ~60 · โล่ 20% ~60 · ฟื้นต่อเนื่อง 8%×3 ~55 · บาเรีย ~120 · ATK+25% ~60 · เร่งความเร็ว 20% ~45 ·
//   ล้างผลด้านลบ ~40 · คริ+20% ~35 · หลบ/หลบทักษะ +20% ~30 · ต้านทักษะ +25% ~25 · แม่นยำ +20% ~15
//   แถวตัวเอง ×1.8 · ทั้งทีม ×3.5 · เพิ่ม Cost ให้ทีม +1 ~100
// ── ค่าพลัง ── คงรูปแบบเดิมของแต่ละตัว แต่ดึงค่าที่โด่ง/ต่ำผิดปกติเข้าหากลางของตำแหน่งครึ่งทาง (ROLE_PROFILES)
// ผลที่วัดได้ดูใน scripts/analyze-rules.mjs --all (ทีมสุ่มหลายพันเกม)
// ── ผลล่าสุด (2026-09-20 · 16,000 เกม · ทีมสุ่ม 66 ตัว) ──
//   ก่อนปรับ: อัตราชนะรายตัว 36–71% (SD 6.6%) · ซัพพอร์ต 47% · นักฆ่า 54%
//   หลังปรับ: อัตราชนะรายตัว 46–54% (SD 1.7%) · ทุกตำแหน่ง 50–52% · เกมยาวเฉลี่ย ~46 เทิร์น
//   ข้อสังเกต: เพดานดาเมจต่อครั้ง (50% HP) ทำให้สกิลเดี่ยวแรงๆ เสียดาเมจส่วนเกิน → นักเวทเดี่ยวชดเชยด้วย Cost ต่ำ/ความสามารถเสริม/ค่าพลัง
//              นักฆ่าได้เปรียบจากความสามารถตำแหน่ง (ตีข้ามแถว + เป้าเลือดน้อย +30%) → ลดดาเมจสกิล/ค่าพลังแทน
// ====================================================

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DRY = process.argv.includes('--dry')
const DIR = path.join(ROOT, 'public', 'rangers')
const BACKUP = path.join(ROOT, 'data', 'backup', 'before-full-balance')

// ── ความสามารถ: 'damage:300' · 'stun:1t' · 'atkUp:25:2t' · 'breakInvincible' · 'energyGain:+1' · 'lifesteal:20:self' ──
const ATTACK_FX = new Set(['damage', 'trueDamage', 'breakInvincible', 'stun', 'skillEvadeDown', 'skillResDown', 'evadeDown', 'dispelBuffs', 'atkDown', 'healBlock', 'silence', 'speedDown', 'critDown', 'critDmgDown', 'hitDown', 'skillHitDown', 'poison', 'burn', 'bleed', 'lifesteal'])
const BUFF_FX = new Set(['atkUp', 'heal', 'regen', 'shield', 'barrier', 'evadeUp', 'skillEvadeUp', 'skillResUp', 'speedUp', 'actionAdvance', 'critDmgUp', 'critUp', 'hitUp', 'skillHitUp', 'cleanse', 'energyGain'])
const ATTACK_AREAS = new Set(['single_front', 'single_any', 'row', 'all'])
const BUFF_AREAS = new Set(['self', 'own_row', 'ally_single', 'ally_all'])

function fx(spec) {
  const [type, ...args] = spec.split(':')
  const e = { type }
  for (const a of args) {
    if (/^\d+t$/.test(a)) e.turns = Number(a.slice(0, -1))
    else if (/^\+\d+$/.test(a)) e.amount = Number(a.slice(1))
    else if (/^\d+$/.test(a)) e.pct = Number(a)
    else e.scope = a
  }
  return e
}
/** สกิล: Cost · ความกว้าง · ความสามารถ */
const s = (cost, area, ...effects) => ({ cost, area, effects: effects.map(fx) })

// ── ค่าพลัง: กลางของตำแหน่ง (จาก ROLE_PROFILES) ──
const PROFILES = {
  tank:     { hp: [6500, 8000], atk: [220, 300], def: [400, 520], spd: [85, 100],  crit: [0, 5],   critDmg: [130, 150], evade: [5, 10],  hit: [0, 10],  skillEvade: [5, 15],  skillHit: [0, 10],  skillRes: [25, 40] },
  fighter:  { hp: [5000, 6000], atk: [380, 460], def: [260, 340], spd: [95, 110],  crit: [5, 15],  critDmg: [150, 170], evade: [5, 12],  hit: [5, 15],  skillEvade: [5, 12],  skillHit: [5, 15],  skillRes: [15, 25] },
  shooter:  { hp: [3500, 4200], atk: [470, 560], def: [160, 220], spd: [105, 120], crit: [15, 30], critDmg: [170, 200], evade: [8, 15],  hit: [15, 25], skillEvade: [5, 12],  skillHit: [5, 15],  skillRes: [5, 15] },
  assassin: { hp: [2800, 3400], atk: [480, 560], def: [130, 190], spd: [110, 122], crit: [22, 37], critDmg: [170, 210], evade: [10, 18], hit: [10, 20], skillEvade: [8, 15],  skillHit: [5, 15],  skillRes: [0, 10] },
  mage:     { hp: [3000, 3700], atk: [500, 600], def: [140, 200], spd: [95, 110],  crit: [5, 15],  critDmg: [150, 170], evade: [5, 10],  hit: [5, 15],  skillEvade: [5, 12],  skillHit: [20, 35], skillRes: [10, 25] },
  support:  { hp: [3800, 4500], atk: [360, 440], def: [200, 260], spd: [110, 125], crit: [0, 10],  critDmg: [140, 160], evade: [8, 15],  hit: [5, 15],  skillEvade: [10, 20], skillHit: [20, 35], skillRes: [20, 35] },
}
const STEP = { hp: 10, atk: 5, def: 5, spd: 1, crit: 1, critDmg: 5, evade: 1, hit: 1, skillEvade: 1, skillHit: 1, skillRes: 1 }
/** ดึงค่าเข้าหากลางของตำแหน่งเท่านี้ (0 = คงเดิม · 1 = กลางเป๊ะ) */
const PULL = 0.5
const round = (k, v) => Math.round(v / STEP[k]) * STEP[k]

function normalizeStats(role, old, over = {}) {
  const p = PROFILES[role]
  const out = {}
  for (const k of Object.keys(p)) {
    const [lo, hi] = p[k]
    const mid = (lo + hi) / 2
    const v = old[k] ?? mid
    out[k] = round(k, Math.min(hi, Math.max(lo, v + (mid - v) * PULL)))
  }
  // ปรับรายตัว: ตัวเลข = ค่าใหม่ · 'x1.05' = คูณ (หลังดึงเข้ากลาง)
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === 'string' ? round(k, out[k] * Number(v.slice(1))) : v
  return out
}

// ── ทีละตัว: skill1 / skill2 (+ stats = ปรับค่าพลังเพิ่มหลังดึงเข้ากลาง · base = ค่าตั้งต้นแทนค่าเดิม) ──
const BALANCE = {
  // Brown 13 (EVA) · น้ำ/พลัง/ไฟเตอร์ — สายเคเบิลเสริมพลัง · หอกลองกินุสทะลุอมตะ + ห้ามใช้ทักษะ
  'u1023h-brown': {
    skill1: s(2, 'self', 'skillEvadeUp:30:2t', 'atkUp:30:2t', 'regen:8:3t'),
    skill2: s(3, 'single_any', 'damage:330', 'breakInvincible', 'silence:1t'),
  },
  // อินุยาฉะ · น้ำ/พลัง/ไฟเตอร์ — แผลแห่งลม: คลื่นกระแทกวงกว้างทะลุอมตะ · แปลงร่างอสูร
  'u1029h-inu': {
    skill1: s(4, 'all', 'damage:220', 'breakInvincible'),
    skill2: s(2, 'self', 'atkUp:35:2t', 'speedUp:20:2t', 'skillEvadeUp:20:2t'),
  },
  // เส็ตโชมารู · ไฟ/ไหวพริบ/นักเวท — เมโดะซังเก็ตสึฮะ: ทางสู่ปรโลก ทะลุอมตะ + ชะงัก · เท็นเซย์งะ ฮีลแถว + ต้านทักษะ
  'u1030h-setshou': {
    skill1: s(3, 'row', 'damage:190', 'breakInvincible', 'stun:1t'),
    skill2: s(2, 'own_row', 'heal:25', 'skillResUp:30:2t', 'regen:6:2t'),
  },
  // คาโงเมะ · ไม้/ว่องไว/นักยิง — ธนูยกเลิกบัฟ · จักรยานพุ่งชน ลด ATK + ลดความเร็ว
  'u1031h-kagome': {
    skill1: s(2, 'single_front', 'damage:270', 'dispelBuffs'),
    skill2: s(3, 'single_any', 'damage:270', 'atkDown:30:2t', 'speedDown:20:2t'),
  },
  // คิเคียว · ไฟ/ว่องไว/นักยิง — ธนูห้ามฟื้นฟู · ผู้เก็บวิญญาณ ลดหลบ/หลบทักษะทั้งแถว
  'u1032h-kikyou': {
    skill1: s(2, 'single_front', 'damage:280', 'healBlock:2t'),
    skill2: s(3, 'row', 'damage:200', 'evadeDown:25:2t', 'skillEvadeDown:25:2t'),
  },
  // เการี่ · น้ำ/พลัง/ไฟเตอร์ — กินเนื้อ ฮีลแถว + แม่นยำ · โกรันโนว่า ดาบแสง ทะลุเกราะ + ลดหลบ
  'u1068h-gourry': {
    skill1: s(2, 'own_row', 'heal:20', 'regen:8:3t', 'hitUp:20:2t'),
    skill2: s(3, 'single_front', 'damage:300', 'trueDamage:60', 'evadeDown:25:2t'),
  },
  // นัทสึมิ · ไฟ/ว่องไว/นักฆ่า — อีจิส (โล่) สะท้อนทักษะ = บาเรีย · อีจิส (ปืน) ทะลุอมตะ + ชะงักทั้งแถว
  'u1096h-natsumi': {
    skill1: s(2, 'self', 'shield:20:2t', 'skillResUp:30:2t', 'skillEvadeUp:20:2t'),
    skill2: s(3, 'row', 'damage:120', 'breakInvincible', 'stun:1t'),
  },
  // อุลตร้าแมนไทกะ · ไม้/ไหวพริบ/นักเวท — สตรีอุมบลาสเตอร์ ลดแม่นยำทักษะ · เซเกอร์เฟลม ทะลุอมตะ + ยกเลิกบัฟ
  'u1103h-taiga': {
    skill1: s(2, 'single_front', 'damage:290', 'skillHitDown:30:2t'),
    skill2: s(3, 'row', 'damage:240', 'breakInvincible', 'dispelBuffs'),
  },
  // เซย์จูโร่ · ไม้/พลัง/ไฟเตอร์ — คำสั่งหัวหน้า ฮีลทั้งทีม + ล้างดาเมจต่อเนื่อง · พายุดาบ ลดความเร็วทั้งแถว
  'u1111h-seijuro': {
    skill1: s(3, 'ally_all', 'heal:25', 'cleanse'),
    skill2: s(3, 'row', 'damage:210', 'speedDown:25:2t'),
  },
  // ซากุระ · ไฟ/ว่องไว/นักฆ่า — จิตใจไม่ย่อท้อ โล่ทั้งพื้นที่ (บาเรียทั้งทีม) · พายุซากุระ ทะลุอมตะ + ยกเลิกบัฟ
  'u1112h-sakura': {
    skill1: s(4, 'ally_all', 'barrier:1t', 'skillEvadeUp:20:2t'),
    skill2: s(2, 'single_any', 'damage:250', 'breakInvincible', 'dispelBuffs'),
  },
  // ฮัตสึโฮะ · ไฟ/พลัง/ไฟเตอร์ — ให้ฮัตสึโฮะจัดการ โล่ + ฟื้นฟูทั้งทีม · ค้อนพิธี ไฟไหม้ + ลดแม่นยำทั้งแถว
  'u1113h-hatsuho': {
    skill1: s(2, 'ally_all', 'shield:15:2t', 'regen:6:2t'),
    skill2: s(3, 'row', 'damage:180', 'burn:30:2t', 'hitDown:25:2t'),
  },
  // อาซามิ · น้ำ/ว่องไว/นักฆ่า — จิตวิญญาณนินจา คริ/คริดาเมจ/ความเร็วแถว · ดาวกระจาย เลือดไหล + ห้ามฟื้นฟูทั้งแถว
  'u1114h-azami': {
    skill1: s(2, 'own_row', 'critUp:15:2t', 'critDmgUp:40:2t'),
    skill2: s(3, 'row', 'damage:130', 'bleed:30:2t', 'healBlock:2t'),
  },
  // อนาสตาเซีย · ไม้/ไหวพริบ/นักเวท — ตั้งสมาธิ ATK + แม่นยำทักษะทั้งทีม · กราดยิง ลดแม่นยำทักษะ + ห้ามใช้ทักษะทั้งแถว
  'u1115h-anastasia': {
    skill1: s(2, 'ally_all', 'atkUp:30:2t', 'skillHitUp:20:2t'),
    skill2: s(3, 'row', 'damage:240', 'skillHitDown:30:2t', 'silence:1t'),
  },
  // คลาริส · น้ำ/ไหวพริบ/นักเวท — ลิโบรแมนซี ลดหลบทักษะ/ต้านทักษะ · อาร์บิทร์ ทะลุอมตะ + ห้ามใช้ทักษะ + พิษ
  'u1116h-claris': {
    skill1: s(2, 'single_front', 'damage:270', 'skillEvadeDown:30:2t', 'skillResDown:30:2t'),
    skill2: s(3, 'row', 'damage:200', 'breakInvincible', 'silence:1t'),
  },
  // เมลิโอดัส · ไม้/พลัง/ไฟเตอร์ — ฟูลเคาน์เตอร์ ทะลุอมตะ + ชะงัก · เฮลเบลซ โล่ + หลบ/ต้านทักษะตัวเอง
  'u1129h-meliodas': {
    skill1: s(2, 'single_front', 'damage:250', 'breakInvincible', 'stun:1t'),
    skill2: s(2, 'self', 'shield:30:2t', 'skillEvadeUp:30:2t', 'skillResUp:30:2t', 'atkUp:20:2t'),
  },
  // เบนิมารุ · ไฟ/ไหวพริบ/นักเวท — เพลิงอสูร ไฟไหม้ + ลดหลบทักษะทั้งแถว · เฮลแฟลร์ ไฟดำ + ห้ามฟื้นฟู
  'u1147h-benimaru': {
    skill1: s(2, 'row', 'damage:160', 'burn:30:2t', 'skillEvadeDown:25:2t'),
    skill2: s(3, 'single_front', 'damage:290', 'burn:40:2t', 'healBlock:2t'),
  },
  // โซเอย์ · ไม้/ว่องไว/นักฆ่า — สายลับ หลบ/ต้านทักษะ + คริ · ดาบประกาย ลดความเร็ว
  'u1148h-souei': {
    skill1: s(2, 'self', 'skillEvadeUp:30:2t', 'skillResUp:30:2t', 'critUp:20:2t'),
    skill2: s(3, 'single_any', 'damage:260', 'speedDown:25:2t'),
  },
  // ชิออน (โอเกอร์) · ไม้/พลัง/แทงค์ — อาหารฝีมือชิออน พิษ + ลดหลบ/ต้านทักษะทั้งแถว · กิโยตินฟันทั้งแถว + ดูดเลือด
  'u1150h-shion': {
    skill1: s(2, 'row', 'poison:35:3t', 'skillEvadeDown:25:2t', 'skillResDown:25:2t'),
    skill2: s(3, 'row', 'damage:250', 'lifesteal:20:self'),
  },
  // อายส์ · น้ำ/ไหวพริบ/นักเวท — แอเรียล ความเร็ว + แม่นยำทักษะ + ATK · ลิลราฟากา ทะลุอมตะ + ลดต้านทักษะ
  'u1156h-ais': {
    skill1: s(2, 'self', 'speedUp:30:2t', 'skillHitUp:30:2t', 'atkUp:20:2t', 'shield:20:2t'),
    skill2: s(3, 'single_any', 'damage:230', 'trueDamage:50', 'breakInvincible', 'skillResDown:30:2t'),
  },
  // กีแลน · น้ำ/พลัง/ไฟเตอร์ — ดาบแสง เลือดไหล + ลดต้านทักษะ · ท่าเทพดาบ ลดหลบทั้งแถว
  'u1194h-ghislaine': {
    skill1: s(2, 'single_front', 'damage:250', 'bleed:30:2t', 'skillResDown:20:2t'),
    skill2: s(2, 'row', 'damage:160', 'evadeDown:25:2t'),
  },
  // เบนิมารุ (ดับเพลิง) · ไม้/ไหวพริบ/นักเวท — นิจิรินอากัตสึกิ ยกเลิกบัฟ + ห้ามใช้ทักษะทั้งแถว · ราชาสำราญ โล่ + แม่นยำทักษะ
  'u1209h-shinmon': {
    skill1: s(3, 'row', 'damage:200', 'dispelBuffs', 'silence:1t'),
    skill2: s(2, 'self', 'shield:25:2t', 'skillHitUp:30:2t', 'atkUp:25:2t'),
  },
  // โทวะ · น้ำ/พลัง/แทงค์ — คลื่นมังกรน้ำเงิน ทะลุอมตะ + ชะงัก + ลดต้านทักษะ · สวนกลับ บาเรีย + โล่แถว
  'u1216h-towa': {
    skill1: s(3, 'single_front', 'damage:280', 'breakInvincible', 'stun:1t', 'skillResDown:25:2t'),
    skill2: s(3, 'own_row', 'barrier:1t', 'shield:15:2t'),
  },
  // เซ็ตสึนะ · ไม้/ไหวพริบ/ซัพพอร์ต — พายุหมุน ทะลุอมตะ + ลดความเร็วทั้งหมด · ผีเสื้อราตรี ฟื้นฟู + หลบ/ต้านทักษะทั้งทีม
  'u1217h-setsuna': {
    skill1: s(3, 'all', 'damage:120', 'breakInvincible', 'speedDown:15:2t'),
    skill2: s(3, 'ally_all', 'regen:8:3t', 'skillEvadeUp:25:2t', 'skillResUp:25:2t'),
  },
  // อาดัม · ไม้/พลัง/แทงค์ — ขวานเทพ ทะลุอมตะ + ชะงัก · ผลไม้แห่งปัญญา ฮีล + หลบทักษะ + ความเร็วแถว
  'u1227h-adam': {
    skill1: s(2, 'single_front', 'damage:200', 'breakInvincible', 'stun:1t'),
    skill2: s(2, 'own_row', 'heal:20', 'skillEvadeUp:30:2t', 'speedUp:15:2t'),
  },
  // โย · ไฟ/พลัง/ไฟเตอร์ — โอเวอร์โซล ล้างผลด้านลบ + โล่ + ต้านทักษะ · ดาบพุทธสุญญตา ทะลุอมตะ + ห้ามฟื้นฟู
  'u1233h-yoh': {
    skill1: s(2, 'self', 'cleanse', 'shield:25:2t', 'skillResUp:30:2t', 'atkUp:20:2t'),
    skill2: s(3, 'single_front', 'damage:360', 'breakInvincible', 'healBlock:2t'),
  },
  // บากิ · ไฟ/ว่องไว/นักฆ่า — หมัดสามจังหวะ ชะงัก · ปลดปล่อยพลัง ATK + โล่แถว + คืน Cost
  'u1247e-bk': {
    skill1: s(2, 'single_any', 'damage:180', 'stun:1t'),
    skill2: s(3, 'own_row', 'atkUp:30:2t', 'shield:12:2t', 'energyGain:+1'),
  },
  // โอลิวา · ไม้/พลัง/แทงค์ — สวิตช์อัป หมัดทะลุอมตะ · บอล ฟื้นฟู + โล่ + หลบทักษะทั้งทีม
  'u1251e-ov': {
    skill1: s(2, 'single_front', 'damage:280', 'breakInvincible'),
    skill2: s(3, 'ally_all', 'regen:8:3t', 'shield:12:2t', 'skillEvadeUp:20:2t'),
  },
  // Brown ตำนานร็อค · แสง/ไหวพริบ/นักเวท — เดธเมทัล ทะลุอมตะ + ยกเลิกบัฟทั้งแถว · โยกหัว หลบทักษะ + คืน Cost
  'u1260e-brown': {
    skill1: s(2, 'row', 'damage:170', 'breakInvincible', 'dispelBuffs'),
    skill2: s(2, 'own_row', 'skillEvadeUp:30:2t', 'evadeUp:15:2t', 'energyGain:+1'),
  },
  // เอมิเลีย · ไม้/ไหวพริบ/นักเวท — ราตรีสวัสดิ์ ทะลุอมตะ + ห้ามใช้ทักษะ · คุยกับภูติ ฟื้นฟู + หลบ/ต้านทักษะทั้งทีม
  'u1263e-em': {
    skill1: s(2, 'single_any', 'damage:300', 'breakInvincible', 'silence:1t'),
    skill2: s(2, 'ally_all', 'heal:25', 'regen:8:2t', 'skillResUp:25:2t'),
  },
  // Brown แบล็คฮีโร่ · ไฟ/พลัง/แทงค์ — หมัดไฟ ทะลุอมตะ + ห้ามฟื้นฟู · สายฟ้า โล่ + ฮีล + ความเร็วแถว
  'u1277e-brown': {
    skill1: s(2, 'single_front', 'damage:260', 'breakInvincible', 'healBlock:2t'),
    skill2: s(2, 'own_row', 'shield:20:2t', 'heal:10', 'speedUp:15:2t'),
  },
  // เอเลน · ไม้/พลัง/แทงค์ — ค้อนศึก เข็มจากพื้นทะลุอมตะทั้งหมด · เกราะแข็ง โล่ + หลบทักษะทั้งทีม
  'u1279e-er': {
    skill1: s(3, 'all', 'damage:180', 'breakInvincible'),
    skill2: s(3, 'ally_all', 'shield:20:2t', 'skillEvadeUp:25:2t'),
  },
  // รีไว · ไฟ/ว่องไว/นักฆ่า — หอกฟ้าผ่า ทะลุอมตะ + ห้ามฟื้นฟู · กวาดล้าง ล้างผลด้านลบ + ฟื้นฟู + ดึงเทิร์นแถว
  'u1281e-lv': {
    skill1: s(2, 'single_any', 'damage:200', 'breakInvincible', 'healBlock:2t'),
    skill2: s(2, 'own_row', 'cleanse', 'regen:8:2t', 'actionAdvance:20'),
  },
  // Moon ชุดเอเลี่ยน · มืด/ว่องไว/นักยิง — ชิลๆ หลบทักษะแถว + คืน Cost · ขึ้นไปเลย ทะลุอมตะ + ชะงัก
  'u1292e-moon': {
    skill1: s(2, 'own_row', 'skillEvadeUp:25:2t', 'atkUp:20:2t', 'energyGain:+3'),
    skill2: s(3, 'row', 'damage:190', 'breakInvincible', 'stun:1t'),
  },
  // ริมุรุ · น้ำ/ไหวพริบ/นักเวท — เมกิดโด แสงนับไม่ถ้วน ทะลุอมตะ + ลดหลบทักษะทั้งหมด · ราฟาเอล ATK + แม่นยำทักษะ + คืน Cost
  // (ค่าพลังเดิมยังเป็นค่าเริ่มต้น 4000/400/250 → ตั้งแบบนักเวทสายอึด)
  'u1294e-rt': {
    base: { hp: 3600, atk: 555, def: 180, spd: 103, crit: 10, critDmg: 160, evade: 8, hit: 10, skillEvade: 9, skillHit: 30, skillRes: 22 },
    skill1: s(3, 'all', 'damage:130', 'breakInvincible', 'skillEvadeDown:20:2t'),
    skill2: s(3, 'ally_all', 'atkUp:25:2t', 'skillHitUp:25:2t', 'energyGain:+1'),
  },
  // ดิอาโบล · ไฟ/พลัง/ไฟเตอร์ — กระสุนเพลิงเวท ยกเลิกบัฟ · ภักดีต่อนาย หลบทักษะ + ฟื้นฟู + ฮีลตัวเอง
  'u1296e-db': {
    skill1: s(2, 'single_front', 'damage:280', 'dispelBuffs'),
    skill2: s(2, 'self', 'skillEvadeUp:30:2t', 'regen:10:3t', 'heal:15'),
  },
  // ชูนะ · ไฟ/ไหวพริบ/ซัพพอร์ต — ระฆังศักดิ์สิทธิ์ ATK + ต้านทักษะ + ล้างผลด้านลบทั้งทีม · บาเรียต้านมาร โล่ + คริ + แม่นยำทั้งทีม
  'u1297h-sn': {
    skill1: s(2, 'ally_all', 'atkUp:25:2t', 'skillResUp:25:2t', 'cleanse'),
    skill2: s(3, 'ally_all', 'shield:25:2t', 'critUp:15:2t', 'hitUp:20:2t', 'skillHitUp:20:2t'),
  },
  // เวลโดร่า · ไม้/ว่องไว/นักฆ่า — เฟาสต์ ลด ATK · ออร่าเต็มพิกัด คริ + คริดาเมจ + แม่นยำทั้งทีม
  'u1298h-vt': {
    skill1: s(2, 'single_any', 'damage:250', 'atkDown:25:2t'),
    skill2: s(3, 'ally_all', 'critUp:25:2t', 'critDmgUp:50:2t', 'hitUp:25:2t'),
  },
  // ไอนซ์ · ไฟ/ไหวพริบ/นักเวท — อัญเชิญเดมิเอิร์จ ทะลุอมตะ + ยกเลิกบัฟ · พิชิตโลก โล่ + ล้างผลด้านลบ + แม่นยำทักษะทั้งทีม
  // (ค่าพลังเดิมยังเป็นค่าเริ่มต้น → ตั้งแบบนักเวทสายแม่นยำทักษะ)
  'u1306e-az': {
    base: { hp: 3400, atk: 565, def: 175, spd: 99, crit: 11, critDmg: 165, evade: 7, hit: 11, skillEvade: 8, skillHit: 33, skillRes: 20 },
    skill1: s(2, 'row', 'damage:200', 'breakInvincible', 'dispelBuffs'),
    skill2: s(3, 'ally_all', 'shield:20:2t', 'cleanse', 'skillHitUp:25:2t', 'atkUp:15:2t'),
  },
  // Moon ราชาจระเข้ · ไฟ/พลัง/แทงค์ — เบ่งกล้าม โล่ + ต้านทักษะทั้งทีม · หางเหล็ก ห้ามฟื้นฟู + ลดหลบทักษะ
  'u1315e-moon': {
    skill1: s(2, 'ally_all', 'shield:15:2t', 'skillResUp:25:2t'),
    skill2: s(2, 'single_any', 'damage:260', 'healBlock:2t', 'skillEvadeDown:25:2t'),
  },
  // Brown พรานจระเข้ · แสง/ว่องไว/นักยิง — ทำสมาธิ แม่นยำทักษะ + ความเร็ว + คืน Cost · เทียนเวทมนตร์ ทะลุอมตะทั้งแถว
  'u1317e-brown': {
    skill1: s(2, 'ally_all', 'skillHitUp:25:2t', 'speedUp:15:2t', 'energyGain:+1'),
    skill2: s(2, 'row', 'damage:190', 'breakInvincible'),
  },
  // Moon นักล่าเงา · ไม้/ว่องไว/นักฆ่า — หีบสมบัติ ATK + คริดาเมจ · มิมิค ยกเลิกบัฟ + ลดหลบ
  'u1339e-moon': {
    skill1: s(2, 'self', 'atkUp:20:2t', 'critDmgUp:50:2t'),
    skill2: s(3, 'single_any', 'damage:230', 'dispelBuffs', 'evadeDown:25:2t'),
  },
  // Brown อัศวินแห่งแสง · แสง/พลัง/แทงค์ — บุก! ทะลุอมตะ + ชะงักทั้งแถว · พลังแห่งแสง โล่ + ต้านทักษะ + ความเร็วทั้งทีม
  'u1341e-brown': {
    skill1: s(3, 'row', 'damage:180', 'breakInvincible', 'stun:1t'),
    skill2: s(3, 'ally_all', 'shield:18:2t', 'skillResUp:30:2t', 'speedUp:10:2t'),
  },
  // ชากะ · น้ำ/ไหวพริบ/นักเวท — โล่อหิงสา บาเรีย + ล้างผลด้านลบทั้งทีม · โลกบาล ทะลุอมตะ + ยกเลิกบัฟทั้งแถว
  'u1342h-bd': {
    skill1: s(3, 'ally_all', 'barrier:1t', 'cleanse'),
    skill2: s(2, 'row', 'damage:250', 'breakInvincible', 'dispelBuffs'),
  },
  // เฮราเคลส · ไม้/พลัง/แทงค์ — สิงโตเนเมีย ลดหลบทักษะทั้งหมด · รักไม่เห็นแก่ตัว ฮีล + ฟื้นฟูทั้งทีม
  'u1347h-hc': {
    skill1: s(3, 'all', 'damage:140', 'skillEvadeDown:25:2t'),
    skill2: s(3, 'ally_all', 'heal:22', 'regen:6:2t'),
  },
  // อควอ · น้ำ/พลัง/แทงค์ — สร้างน้ำ ทะลุอมตะ + ห้ามฟื้นฟู + ห้ามใช้ทักษะทั้งแถว · ความงามแห่งธรรมชาติ ฮีล/โล่/บาเรียเพื่อน 1 ตัว
  'u1355e-aq': {
    skill1: s(2, 'row', 'damage:120', 'breakInvincible', 'healBlock:2t', 'silence:1t'),
    skill2: s(3, 'ally_single', 'heal:30', 'shield:20:2t', 'barrier:2t', 'skillResUp:30:2t', 'actionAdvance:100'),
  },
  // เมกุมิน · ไฟ/ไหวพริบ/นักเวท — ข้าคือเมกุมิน · เวทระเบิด ดาเมจมหาศาลทั้งหมด ทะลุอมตะ
  'u1357e-mg': {
    skill1: s(2, 'single_front', 'damage:290'),
    skill2: s(4, 'all', 'damage:200', 'breakInvincible'),
  },
  // ฟรีเรน · ไฟ/ไหวพริบ/นักเวท — โซลทราค เวทสังหารปีศาจ ทะลุอมตะทั้งแถว · ซื้อของไร้ประโยชน์ ล้างผลด้านลบ + หลบทักษะ + คืน Cost
  'u1372e-fr': {
    skill1: s(2, 'row', 'damage:240', 'breakInvincible'),
    skill2: s(2, 'own_row', 'cleanse', 'skillEvadeUp:30:2t', 'energyGain:+1'),
  },
  // ซายน์ · ไม้/ไหวพริบ/ซัพพอร์ต — หอกเทพธิดา ห้ามใช้ทักษะทั้งแถว · คาถาปลุก ฟื้นฟู + ล้างผลด้านลบ + หลบทักษะทั้งทีม
  'u1378e-se': {
    skill1: s(2, 'row', 'damage:180', 'silence:1t'),
    skill2: s(3, 'ally_all', 'heal:10', 'regen:8:3t', 'cleanse', 'skillEvadeUp:20:2t'),
  },
  // รูเดียส · ไม้/ไหวพริบ/นักเวท — ตาปีศาจ หลบ/หลบทักษะ + โล่ · เวทดีที่สุดตอนนี้ ทะลุอมตะ + ห้ามใช้ทักษะ
  'u1397e-rd': {
    skill1: s(2, 'self', 'evadeUp:25:2t', 'skillEvadeUp:25:2t', 'shield:25:2t', 'atkUp:25:2t'),
    skill2: s(2, 'single_any', 'damage:300', 'breakInvincible', 'silence:1t'),
  },
  // ทาเคมิจิ · ไม้/ว่องไว/นักยิง — ข้า...ไม่แพ้ ล้างผลด้านลบ + ต้านทักษะทั้งทีม · หมัดกล้า ลดแม่นยำทักษะ
  'u1421e-tk': {
    skill1: s(2, 'ally_all', 'cleanse', 'skillResUp:30:2t'),
    skill2: s(2, 'single_front', 'damage:260', 'skillHitDown:30:2t'),
  },
  // เคียวกะ · ไฟ/ว่องไว/นักฆ่า — ถึงเวลายอมแพ้ โล่ + หลบทักษะทั้งทีม · ดาบไขว้ ยกเลิกบัฟ + ลดต้านทักษะ
  'u1436e-uz': {
    skill1: s(2, 'ally_all', 'shield:12:2t', 'skillEvadeUp:20:2t'),
    skill2: s(3, 'single_any', 'damage:330', 'dispelBuffs', 'skillResDown:30:2t'),
  },
  // เทนกะ · น้ำ/ไหวพริบ/นักเวท — อาเมะโนะมิโทริ หลุมวาร์ป ทะลุอมตะ + พิษทั้งหมด · จัดการเธอก่อน ความเร็ว + แม่นยำ + คืน Cost
  'u1438e-iz': {
    skill1: s(3, 'all', 'damage:120', 'breakInvincible', 'poison:20:2t'),
    skill2: s(2, 'ally_all', 'speedUp:15:2t', 'energyGain:+1'),
  },
  // เจสสิก้า · ไฟ/ว่องไว/นักยิง — แปลงร่างจอมโจร ATK + คริ + ต้านทักษะ · ยิงหน้าไม้รัว ทะลุอมตะ + ยกเลิกบัฟ
  'u1447e-jessica': {
    skill1: s(2, 'self', 'atkUp:30:2t', 'critUp:20:2t', 'skillResUp:30:2t'),
    skill2: s(2, 'single_front', 'damage:270', 'breakInvincible', 'dispelBuffs'),
  },
  // Brown นักรบช้าง · มืด/พลัง/แทงค์ — อัญเชิญช้าง เท้ายักษ์ทะลุอมตะทั้งแถว · อัญเชิญสายฟ้า โล่ + ฟื้นฟู + หลบทักษะทั้งทีม
  'u1483e-brown': {
    skill1: s(3, 'row', 'damage:230', 'breakInvincible'),
    skill2: s(3, 'ally_all', 'shield:15:2t', 'regen:6:3t', 'skillEvadeUp:20:2t'),
  },
  // Moon โชกุน · ไม้/ว่องไว/นักฆ่า — ฟันไผ่ ความเร็ว + คริทั้งทีม · ชักดาบ เลือดไหล + ลดแม่นยำ
  'u1487e-moon': {
    skill1: s(2, 'ally_all', 'critUp:15:2t', 'hitUp:15:2t'),
    skill2: s(3, 'single_any', 'damage:220', 'bleed:40:2t', 'hitDown:25:2t'),
  },
  // ชิอง · ไฟ/ว่องไว/นักยิง — แฮ็ก ห้ามใช้ทักษะ · เคนโกะช่วยรบ ทะลุอมตะ + ชะงักทั้งแถว
  'u1505e-so': {
    skill1: s(2, 'own_row', 'atkUp:25:2t', 'critUp:20:2t', 'critDmgUp:40:2t'),
    skill2: s(3, 'row', 'damage:180', 'breakInvincible', 'stun:1t'),
  },
  // ชินโซ · ไม้/พลัง/แทงค์ — ลงทัณฑ์เจ็ดกลีบ ฮีล + ต้านทักษะทั้งทีม · นานาโอะช่วยรบ ยกเลิกบัฟ + ห้ามใช้ทักษะ
  'u1507e-sz': {
    skill1: s(4, 'ally_all', 'heal:15', 'skillResUp:20:2t'),
    skill2: s(2, 'single_front', 'damage:200', 'dispelBuffs', 'silence:1t'),
  },
  // เด็นจิ · น้ำ/พลัง/ไฟเตอร์ — หลีกไป! เลื่อยยนต์ทะลุอมตะทั้งแถว · ทำไม่ได้หรอก โล่ + ฮีลแถว
  'u1520e-de': {
    skill1: s(3, 'row', 'damage:260', 'breakInvincible'),
    skill2: s(2, 'own_row', 'shield:20:2t', 'heal:15'),
  },
  // อาคิ · ไฟ/ไหวพริบ/นักเวท — แอปเปิ้ลหายป่วย ล้างผลด้านลบ + ต้านทักษะ + โล่ทั้งทีม · คอน ปีศาจจิ้งจอก ทะลุอมตะ + ชะงักทั้งแถว
  'u1524e-ak': {
    skill1: s(2, 'ally_all', 'cleanse', 'skillResUp:25:2t', 'shield:10:2t', 'heal:10'),
    skill2: s(3, 'row', 'damage:210', 'breakInvincible', 'stun:1t'),
  },
  // ริโย · น้ำ/พลัง/ไฟเตอร์ — ทำความสะอาด ห้ามฟื้นฟู + ยกเลิกบัฟ · ปาร์ตี้พิซซ่า ฮีล + ฟื้นฟู + คืน Cost
  'u1541e-ri': {
    skill1: s(2, 'single_front', 'damage:250', 'healBlock:2t', 'dispelBuffs'),
    skill2: s(2, 'self', 'heal:20', 'regen:10:2t', 'energyGain:+1'),
  },
  // ซังกะ · ไฟ/ว่องไว/นักฆ่า — ไม้คทาคู่ใจ ล้างผลด้านลบ + ATK + แม่นยำทั้งทีม · ซาสึมาตะ ลดหลบทักษะ + ลดความเร็ว
  'u1543e-za': {
    skill1: s(2, 'ally_all', 'cleanse', 'atkUp:15:2t', 'hitUp:20:2t'),
    skill2: s(3, 'single_any', 'damage:320', 'skillEvadeDown:30:2t', 'speedDown:15:2t'),
  },
  // Brown หัวหน้าอสูร · ไฟ/พลัง/ไฟเตอร์ — กระบองเหล็ก ทะลุอมตะ + ลดต้านทักษะ · สายฟ้าอสูร ชะงักทั้งแถว
  'u1546e-brown': {
    skill1: s(2, 'single_front', 'damage:240', 'breakInvincible', 'skillResDown:25:2t'),
    skill2: s(2, 'ally_all', 'atkUp:25:2t'),
  },
  // Moon คัปปะ · มืด/ว่องไว/นักยิง — กระดองคัปปะ ทะลุอมตะ + ห้ามใช้ทักษะ · อัญมณีคัปปะ ATK + คริดาเมจแถว
  'u1550e-moon': {
    skill1: s(2, 'single_any', 'damage:260', 'breakInvincible', 'silence:1t'),
    skill2: s(2, 'own_row', 'atkUp:25:2t', 'critDmgUp:40:2t'),
  },
  // โซจิ · น้ำ/ไหวพริบ/นักเวท — จุดไฟ ATK + แม่นยำทั้งทีม · เตะขวานเพลิงอสูร ทะลุอมตะ + ห้ามใช้ทักษะ
  'u1588e-es': {
    skill1: s(2, 'ally_all', 'atkUp:30:2t', 'hitUp:15:2t', 'skillHitUp:15:2t'),
    skill2: s(3, 'row', 'damage:230', 'breakInvincible', 'silence:1t'),
  },
  // คาฟก้า · น้ำ/พลัง/แทงค์ — สู้สุดใจ โล่ + หลบทักษะทั้งทีม · ไคจูหมายเลข 8 ทะลุอมตะ + ชะงักทั้งแถว
  'u1618e-ka': {
    skill1: s(2, 'ally_all', 'shield:12:2t', 'skillEvadeUp:20:2t'),
    skill2: s(3, 'row', 'damage:160', 'breakInvincible', 'stun:1t'),
  },
  // Sally ปูแสงตะวัน · แสง/ไหวพริบ/นักเวท — พลุปู ATK ทั้งทีม · ซุ่มโจมตีใต้ดิน ทะลุอมตะ + ลดความเร็ว
  'u1631e-sally': {
    skill1: s(2, 'ally_all', 'atkUp:30:2t', 'critUp:15:2t'),
    skill2: s(3, 'row', 'damage:250', 'breakInvincible', 'speedDown:25:2t'),
  },
}

// ── ตัวคูณ HP + ATK รายตัว (จูนละเอียดจากผลจำลอง · scripts/analyze-rules.mjs --all) — 1 = ไม่ปรับ ──
const KNOB = {'u1438e-iz': 0.931, 'u1114h-azami': 0.85, 'u1487e-moon': 0.85, 'u1096h-natsumi': 0.85, 'u1281e-lv': 0.85, 'u1618e-ka': 0.89, 'u1339e-moon': 0.85, 'u1483e-brown': 0.87, 'u1546e-brown': 0.896, 'u1347h-hc': 0.85, 'u1543e-za': 0.85, 'u1294e-rt': 0.867, 'u1436e-uz': 0.85, 'u1247e-bk': 0.85, 'u1194h-ghislaine': 0.931, 'u1298h-vt': 0.895, 'u1507e-sz': 0.927, 'u1341e-brown': 0.85, 'u1148h-souei': 0.85, 'u1355e-aq': 0.934, 'u1251e-ov': 0.902, 'u1112h-sakura': 0.933, 'u1505e-so': 0.918, 'u1150h-shion': 0.95, 'u1357e-mg': 0.915, 'u1292e-moon': 0.938, 'u1277e-brown': 0.95, 'u1279e-er': 0.958, 'u1317e-brown': 0.98, 'u1029h-inu': 0.968, 'u1297h-sn': 1.021, 'u1520e-de': 1.01, 'u1227h-adam': 1.038, 'u1031h-kagome': 0.998, 'u1068h-gourry': 1.06, 'u1315e-moon': 0.984, 'u1260e-brown': 1.048, 'u1296e-db': 1.034, 'u1129h-meliodas': 1.106, 'u1147h-benimaru': 1.009, 'u1217h-setsuna': 1.038, 'u1111h-seijuro': 1.044, 'u1631e-sally': 1.125, 'u1032h-kikyou': 1.056, 'u1103h-taiga': 1.14, 'u1113h-hatsuho': 1.042, 'u1447e-jessica': 1.117, 'u1116h-claris': 1.099, 'u1233h-yoh': 1.06, 'u1372e-fr': 1.156, 'u1030h-setshou': 1.165, 'u1216h-towa': 1.174, 'u1524e-ak': 1.19, 'u1550e-moon': 1.131, 'u1209h-shinmon': 1.2, 'u1378e-se': 1.114, 'u1115h-anastasia': 1.2, 'u1397e-rd': 1.2, 'u1588e-es': 1.2, 'u1156h-ais': 1.2, 'u1263e-em': 1.2, 'u1342h-bd': 1.2, 'u1541e-ri': 0.998, 'u1023h-brown': 1.004, 'u1421e-tk': 1.034, 'u1306e-az': 1.006}

// ── เขียนไฟล์ ──
const ids = fs.readdirSync(DIR).filter(id => fs.existsSync(path.join(DIR, id, 'ranger.json')))
const approved = ids.filter(id => JSON.parse(fs.readFileSync(path.join(DIR, id, 'ranger.json'), 'utf8')).approved)
const missing = approved.filter(id => !BALANCE[id])
const extra = Object.keys(BALANCE).filter(id => !approved.includes(id))
if (missing.length || extra.length) throw new Error(`ไม่ครบ: ขาด ${missing.join(', ') || '-'} · เกิน ${extra.join(', ') || '-'}`)

if (!DRY) fs.mkdirSync(BACKUP, { recursive: true })
for (const id of approved) {
  const file = path.join(DIR, id, 'ranger.json')
  const raw = fs.readFileSync(file, 'utf8')
  const cfg = JSON.parse(raw)
  const b = BALANCE[id]
  for (const slot of ['skill1', 'skill2']) {
    const kind = cfg.skills[slot].kind
    const want = b[slot]
    const okArea = kind === 'attack' ? ATTACK_AREAS : BUFF_AREAS
    const okFx = kind === 'attack' ? ATTACK_FX : BUFF_FX
    if (!okArea.has(want.area)) throw new Error(`${id} ${slot}: ความกว้าง ${want.area} ไม่ใช่ของสกิล${kind}`)
    for (const e of want.effects) if (!okFx.has(e.type)) throw new Error(`${id} ${slot}: ${e.type} ไม่ใช่ความสามารถของสกิล${kind}`)
    cfg.skills[slot] = { kind, cost: want.cost, area: want.area, effects: want.effects }
  }
  // ค่าพลังตั้งต้น = ของเดิมก่อนปรับครั้งแรก (ไฟล์สำรอง) — รันซ้ำกี่รอบก็ได้ผลเท่ากัน ไม่ทบกัน
  const bakFile = path.join(BACKUP, id + '.json')
  const original = fs.existsSync(bakFile) ? JSON.parse(fs.readFileSync(bakFile, 'utf8')).stats : cfg.stats
  cfg.stats = normalizeStats(cfg.role, b.base ?? original, b.stats)
  const k = KNOB[id] ?? 1
  if (k !== 1) { cfg.stats.hp = round('hp', cfg.stats.hp * k); cfg.stats.atk = round('atk', cfg.stats.atk * k) }
  if (DRY) continue
  const bak = path.join(BACKUP, id + '.json')
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw)
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
}
console.log(`${DRY ? '(ลองดู) ' : ''}ตั้งค่าแล้ว ${approved.length} ตัว${DRY ? '' : ` · สำรองไฟล์เดิมที่ ${path.relative(ROOT, BACKUP)}`}`)
