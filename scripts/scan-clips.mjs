// ====================================================
// scan-clips.mjs — สแกนคลิปของเรนเจอร์ทุกตัวใน public/rangers/
// บอกว่าตัวไหนมีท่าอะไร ขาดอะไร และท่าโจมตีกินเวลากี่วินาที
//
//   node scripts/scan-clips.mjs
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'

// ── ถอดหัวไฟล์ .sam พอให้ได้ชื่อคลิปกับจำนวนเฟรม (ไม่เก็บ transform) ──
function parseClips(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 0
  const u8 = () => v.getUint8(p++)
  const u16 = () => { const x = v.getUint16(p, true); p += 2; return x }
  const i16 = () => { const x = v.getInt16(p, true); p += 2; return x }
  const i32 = () => { const x = v.getInt32(p, true); p += 4; return x }
  const str = () => { const L = u16(); const s = Buffer.from(buf.buffer, buf.byteOffset + p, L).toString('ascii'); p += L; return s }

  if (i32() !== 0x2E53414D) throw new Error('bad magic')
  if (i32() !== 1) throw new Error('bad version')
  const fps = u8()
  i32(); i32(); i32(); i32()

  const nImg = i16()
  for (let k = 0; k < nImg; k++) { str(); i16(); i16(); i32(); i32(); i32(); i32(); i16(); i16() }

  const FF_REM = 1, FF_ADD = 2, FF_MOV = 4, FF_NAME = 8
  const MF_ROT = 0x4000, MF_COL = 0x2000, MF_MAT = 0x1000, MF_LONG = 0x0800

  const nFrames = i16()
  const clips = {}
  let cur = '_intro', count = 0
  const flush = () => { if (count) clips[cur] = (clips[cur] ?? 0) + count }

  for (let f = 0; f < nFrames; f++) {
    const fl = u8()
    if (fl & FF_REM) { const n = u8(); for (let i = 0; i < n; i++) i16() }
    if (fl & FF_ADD) { const n = u8(); for (let i = 0; i < n; i++) { i16(); u8() } }
    if (fl & FF_MOV) {
      const n = u8()
      for (let i = 0; i < n; i++) {
        const mf = u16() & 0xF800
        if (mf & MF_MAT) { i32(); i32(); i32(); i32() } else if (mf & MF_ROT) { i16() }
        if (mf & MF_LONG) { i32(); i32() } else { i16(); i16() }
        if (mf & MF_COL) { u8(); u8(); u8(); u8() }
      }
    }
    if (fl & FF_NAME) { flush(); cur = str(); count = 0 }
    count++
  }
  flush()
  return { fps, nImg, nFrames, clips }
}

const WANTED = ['idle', 'walk', 'target', 'knockback']
const ACTIONS = [
  ['ตีธรรมดา', 'attack_ready', 'attack'],
  ['สกิล 1', 's_attack_ready', 's_attack'],
  ['สกิล 2', 's2_attack_ready', 's2_attack'],
]

const dir = path.join(process.cwd(), 'public', 'rangers')
const ids = (await fs.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()

const rows = []
const extras = new Set()

for (const id of ids) {
  try {
    const r = parseClips(await fs.readFile(path.join(dir, id, 'body.sam')))
    const row = { id, fps: r.fps, sprites: r.nImg, missing: [], actions: [], clips: r.clips }
    for (const w of WANTED) if (!r.clips[w]) row.missing.push(w)
    for (const [label, cast, rel] of ACTIONS) {
      if (!r.clips[rel]) { row.missing.push(label); continue }
      const c = r.clips[cast] ?? 0
      const t = (c + r.clips[rel]) / r.fps
      row.actions.push({ label, cast: c, rel: r.clips[rel], sec: t })
    }
    for (const k of Object.keys(r.clips)) {
      if (!WANTED.includes(k) && !ACTIONS.some(a => a[1] === k || a[2] === k)) extras.add(k)
    }
    rows.push(row)
  } catch (e) {
    rows.push({ id, error: String(e.message ?? e) })
  }
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('เรนเจอร์', 18), pad('fps', 4), pad('สไปรต์', 7), pad('ตีธรรมดา', 10), pad('สกิล1', 10), pad('สกิล2', 10), 'ขาด')
console.log('─'.repeat(96))
for (const r of rows) {
  if (r.error) { console.log(pad(r.id, 18), '✗', r.error); continue }
  const cell = (label) => {
    const a = r.actions.find(x => x.label === label)
    return a ? `${a.sec.toFixed(2)}s` : '—'
  }
  console.log(
    pad(r.id, 18), pad(r.fps, 4), pad(r.sprites, 7),
    pad(cell('ตีธรรมดา'), 10), pad(cell('สกิล 1'), 10), pad(cell('สกิล 2'), 10),
    r.missing.length ? r.missing.join(', ') : '-',
  )
}

const acts = rows.filter(r => !r.error).flatMap(r => r.actions.map(a => ({ ...a, fps: r.fps })))
if (acts.length) {
  const all = acts.map(a => a.sec)
  const avg = all.reduce((s, x) => s + x, 0) / all.length
  console.log('\nเวลาต่อแอ็กชัน (x1): สั้นสุด ' + Math.min(...all).toFixed(2) + 's · เฉลี่ย ' + avg.toFixed(2) + 's · ยาวสุด ' + Math.max(...all).toFixed(2) + 's')

  // ตัวคูณต่อเฟสเดียวกับ SPEED_PROFILES ใน src/lib/samPlayer.ts
  const PROFILES = { 1: [1, 1], 2: [2.5, 1.5], 3: [6, 2] }
  console.log('\nจังหวะเกมจริง (รบ 5v5 = 10 ตัวลงมือ 1 รอบ)')
  console.log('ความเร็ว   เฉลี่ย/แอ็กชัน   ยาวสุด    รอบละ')
  console.log('─'.repeat(52))
  for (const [sp, [mc, mr]] of Object.entries(PROFILES)) {
    const t = acts.map(a => a.cast / (a.fps * mc) + a.rel / (a.fps * mr))
    const m = t.reduce((s, x) => s + x, 0) / t.length
    console.log(
      ('x' + sp).padEnd(10),
      (m.toFixed(2) + 's').padEnd(16),
      (Math.max(...t).toFixed(2) + 's').padEnd(9),
      (m * 10).toFixed(0) + 's',
    )
  }
}
if (extras.size) console.log('\nคลิปอื่นที่เจอ: ' + [...extras].sort().join(', '))
