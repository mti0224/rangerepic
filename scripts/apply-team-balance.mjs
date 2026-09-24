// ====================================================
// apply-team-balance.mjs — เขียนค่าสมดุลของ 10 ตัว (ทีมทดลอง) ลง ranger.json
//   node scripts/apply-team-balance.mjs
//
// คงไว้ตามที่ผู้ใช้ตั้ง: ธาตุ · ชนิด · ตำแหน่ง · ประเภทสกิล (โจมตี/บัฟ) · ความกว้าง
// ปรับ: Cost = 2 ทุกสกิล · ตัวเลขของความสามารถ · ค่าพลัง (เฉพาะตัวที่ระบุ)
//
// งบพลังของสกิล Cost 2 (ใช้คิดตัวเลขด้านล่าง แล้วยืนยันด้วย scripts/sim-teams.mjs)
//   โจมตีเดี่ยว ~280% · ทั้งแถว ~190% · ทั้งหมด ~130%
//   ติดชะงักหักราว 60% · ลดค่าต่างๆ / ยกเลิกบัฟ / ห้ามฟื้นฟู หักราว 20–30% · ยกเลิกอมตะ หักราว 20%
//   บัฟทั้งทีม: ฮีล ~18% · โล่ ~15% · เพิ่ม ATK ~20% · บาเรียทั้งทีมแพงมาก (ใช้แทนความสามารถอื่นเกือบหมด)
// ไฟล์เดิมสำรองไว้ที่ data/backup/before-team-balance/
//
// การจัดทีมที่สมดุลที่สุดตอนนี้ (วัดด้วย scripts/sim-teams.mjs สลับฝั่ง: ซ้ายชนะ ~55% · ~49 เทิร์น — จูนใหม่กับกติกาชุดที่ 2)
// กติกาชุดที่ 2 (ชะงักวงกว้างติดยากขึ้น · เพดานดาเมจ 50% · ความแรงเกม ×1.7): ไฟล์ก่อนปรับ 3 ตัวสำรองที่ data/backup/before-rules-v2/
//   ซ้าย  แถวหน้า u1618e-ka (แทงค์) · u1296e-db (ไฟเตอร์)   แถวหลัง u1260e-brown · u1524e-ak · u1438e-iz (นักเวททั้งหมด)
//   ขวา   แถวหน้า u1541e-ri (ไฟเตอร์) · u1483e-brown (แทงค์) แถวหลัง u1550e-moon · u1317e-brown (นักยิง) · u1631e-sally (นักเวท)
// เทียบกับทีมเดิมของผู้ใช้คือสลับ 2 คู่: u1618e-ka ↔ u1541e-ri และ u1438e-iz ↔ u1631e-sally
// (แถวหน้า/แถวหลังมีโบนัสต่างกัน — ดู src/lib/formation.ts · ความสามารถตำแหน่ง ดู src/lib/roleTraits.ts)
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'

const e = (type, over = {}) => ({ type, ...over })

/** skill1 / skill2: effects ใหม่ (ความกว้าง/ประเภทใช้ของเดิมในไฟล์) · stats: ค่าที่เปลี่ยน */
export const BALANCE = {
  'u1260e-brown': { // แสง · นักเวท
    skill1: [e('damage', { pct: 180 }), e('breakInvincible'), e('dispelBuffs')],
    skill2: [e('skillEvadeUp', { pct: 20, turns: 2 }), e('evadeUp', { pct: 20, turns: 2 })],
  },
  'u1317e-brown': { // แสง · นักยิง
    skill1: [e('evadeUp', { pct: 15, turns: 2 }), e('skillHitUp', { pct: 20, turns: 2 })],
    skill2: [e('damage', { pct: 180 }), e('evadeDown', { pct: 20, turns: 2 }), e('breakInvincible')],
  },
  'u1524e-ak': { // ไฟ · นักเวท
    skill1: [e('cleanse'), e('energyGain', { amount: 1 }), e('shield', { pct: 12, turns: 2 })],
    skill2: [e('damage', { pct: 150 }), e('evadeDown', { pct: 20, turns: 2 }), e('stun', { turns: 1 })],
  },
  'u1296e-db': { // ไฟ · ไฟเตอร์
    skill1: [e('damage', { pct: 320 }), e('dispelBuffs')],
    skill2: [e('skillEvadeUp', { pct: 25, turns: 2 }), e('heal', { pct: 24 })],
    stats: { hp: 5950, def: 335, spd: 106 },
  },
  'u1483e-brown': { // มืด · แทงค์ — บาเรียทั้งทีม (Cost 2) ทำให้ทั้งทีมตีไม่เข้าสลับกันไป → เปลี่ยนเป็นโล่
    skill1: [e('damage', { pct: 190 }), e('stun', { turns: 1 }), e('skillResDown', { pct: 20, turns: 2 })],
    skill2: [e('heal', { pct: 10 }), e('shield', { pct: 12, turns: 2 })],   // กติกาชุดใหม่ (ห้ามฟื้นฟู/เพดานดาเมจ) — ลดจาก 15/16
  },
  'u1618e-ka': { // น้ำ · แทงค์
    skill1: [e('shield', { pct: 12, turns: 2 }), e('atkUp', { pct: 12, turns: 2 })],
    // กติกาชุดใหม่: ชะงักจากสกิลทั้งหมดติดแค่ครึ่งเดียว → เปลี่ยนเป็นทั้งแถว (ความกว้างแก้ใน ranger.json แล้ว) 150%
    skill2: [e('damage', { pct: 150 }), e('stun', { turns: 1 })],
  },
  'u1541e-ri': { // น้ำ · ไฟเตอร์
    skill1: [e('damage', { pct: 260 }), e('healBlock', { turns: 2 })],
    skill2: [e('heal', { pct: 16 }), e('shield', { pct: 16, turns: 2 })],
  },
  'u1550e-moon': { // มืด · นักยิง
    skill1: [e('damage', { pct: 240 }), e('breakInvincible'), e('healBlock', { turns: 2 })],
    skill2: [e('critUp', { pct: 20, turns: 2 }), e('skillHitUp', { pct: 20, turns: 2 })],
  },
  'u1631e-sally': { // แสง · นักเวท
    skill1: [e('atkUp', { pct: 20, turns: 2 })],
    skill2: [e('damage', { pct: 230 }), e('breakInvincible'), e('silence', { turns: 1 })],
  },
  'u1438e-iz': { // น้ำ · นักเวท
    skill1: [e('damage', { pct: 160 }), e('evadeDown', { pct: 20, turns: 2 })],   // กติกาชุดใหม่ (ความแรงเกม ×1.7) — จาก 100
    skill2: [e('skillResUp', { pct: 25, turns: 2 }), e('hitUp', { pct: 20, turns: 2 })],
  },
}

/** ดาเมจสกิลทุกตัว ×ค่านี้ (ปัดลงหลัก 5) — ให้เกมจบเร็วขึ้นโดยสัดส่วนระหว่างตัวเท่าเดิม */
export const SKILL_DAMAGE_MULT = 1

const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isCli) {
  for (const [id, b] of Object.entries(BALANCE)) {
    const file = path.join(process.cwd(), 'public', 'rangers', id, 'ranger.json')
    const cfg = JSON.parse(await fs.readFile(file, 'utf8'))
    for (const slot of ['skill1', 'skill2']) {
      const effects = b[slot].map(x => (x.type === 'damage' ? { ...x, pct: Math.round(x.pct * SKILL_DAMAGE_MULT / 5) * 5 } : x))
      cfg.skills[slot] = { ...cfg.skills[slot], cost: 2, effects }
    }
    if (b.stats) cfg.stats = { ...cfg.stats, ...b.stats }
    await fs.writeFile(file, JSON.stringify(cfg, null, 2), 'utf8')
    console.log('✓', id)
  }
}
