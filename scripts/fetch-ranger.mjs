// ====================================================
// fetch-ranger.mjs — โหลด asset เรนเจอร์จาก lerico มาเก็บในเครื่อง
//
//   node scripts/fetch-ranger.mjs u1607e-sh [u1229h-poseidon ...]
//
// ทำไมต้องโหลดเก็บ ไม่ดึงสด:
//   • rangers.lerico.net ไม่ส่ง Access-Control-Allow-Origin → เบราว์เซอร์ยิงตรงไม่ได้
//   • ไฟล์เล็ก (~340KB ต่อร่าง) เก็บเองคุ้มกว่าต้องมี proxy คอยรัน
//   • ไม่ต้องมีเน็ตตอนพัฒนา และไฟล์ไม่เปลี่ยนใต้เท้าเรา
//
// อ่านจาก directory listing แทนการเดาชื่อไฟล์ เพราะกระสุนมีไม่เท่ากันทุกตัว
// (บางตัวมี bul + bul3 แต่ข้าม bul2 บางตัวไม่มีเลย)
//   -bul  = กระสุนตีธรรมดา
//   -bul2 = กระสุนสกิล 1
//   -bul3 = กระสุนสกิล 2
// ====================================================

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeGameData } from './fetch-gamedata.mjs'

const ORIGIN = 'https://rangers.lerico.net/res'
const UA = { 'User-Agent': 'Mozilla/5.0' }

/** ส่วนของชื่อไฟล์ที่เราสนใจ (หลังตัด "<id>-" ออกแล้ว) → ชื่อที่เก็บในเครื่อง */
function localName(part, form) {
  const bodyPrefix = form === 'e-body' ? 'e-body' : 'body'
  const thumbName = form === 'e-body' ? 'e-thum' : 'thum'
  const bulPrefix = form === 'e-body' ? 'e-bul' : 'bul'

  const [stem, ext] = [part.replace(/\.[^.]+$/, ''), (part.match(/\.[^.]+$/) ?? [''])[0]]

  if (stem === bodyPrefix) return 'body' + ext
  if (stem === thumbName) return 'thumb' + ext
  if (stem === thumbName + '-140') return null                  // ไม่ใช้ thumbnail ตัวเล็ก
  if (stem.startsWith(bodyPrefix + '_')) return stem.slice(bodyPrefix.length - 4) + ext  // body_9x9.png
  // bul / bul2 / bul3 (และรุ่น e-)
  const m = stem.match(new RegExp('^' + bulPrefix + '(\\d*)$'))
  if (m) return 'bul' + m[1] + ext
  return null                                                    // ไฟล์ของอีกร่าง หรือของที่ไม่ใช้
}

async function grab(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** รายชื่อไฟล์ทั้งหมดของเรนเจอร์ตัวหนึ่งบนเซิร์ฟเวอร์ */
export async function listRemote(id) {
  const res = await fetch(`${ORIGIN}/${id}/`, { headers: { ...UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`${res.status} ไม่พบ ${id}`)
  const html = await res.text()
  return [...html.matchAll(/href="([^"]+)"/gi)]
    .map(m => m[1])
    .filter(h => !h.startsWith('.') && !h.startsWith('/') && !h.endsWith('/'))
}

/**
 * โหลดเรนเจอร์ 1 ตัวลง <rangersDir>/<id>/
 * @param {string} id  รหัสเรนเจอร์ เช่น 'u1607e-sh'
 * @param {string} rangersDir  โฟลเดอร์ปลายทาง (public/rangers)
 * @param {'body'|'e-body'} form  ร่างปกติ หรือร่างวิวัฒนาการ
 */
export async function fetchRanger(id, rangersDir, form = 'body') {
  const dir = path.join(rangersDir, id)
  try {
    const remote = await listRemote(id)

    // จับคู่ไฟล์ต้นทาง → ชื่อในเครื่อง
    const jobs = []
    for (const file of remote) {
      if (!file.startsWith(id + '-')) continue
      const to = localName(file.slice(id.length + 1), form)
      if (to) jobs.push({ from: file, to })
    }
    if (!jobs.some(j => j.to === 'body.sam')) {
      throw new Error(`ไม่มีไฟล์ ${form} ของ ${id}`)
    }

    await fs.mkdir(dir, { recursive: true })
    const written = []
    for (const j of jobs) {
      const buf = await grab(`${ORIGIN}/${id}/${j.from}`)
      await fs.writeFile(path.join(dir, j.to), buf)
      written.push({ file: j.to, bytes: buf.length })
    }

    const bullets = [...new Set(written
      .map(w => (w.file.match(/^(bul\d*)\./) ?? [])[1])
      .filter(Boolean))].sort()

    // ข้อมูลเกม (จุดปล่อย/ความเร็ว/เป้าของสกิล) — ขาดได้ ตัวละครยังเปิดใน editor ได้ตามปกติ
    const gamedata = await writeGameData(id, rangersDir).catch(e => ({ ok: false, error: String(e) }))

    return { ok: true, id, form, dir, written, bullets, gamedata: gamedata.ok }
  } catch (err) {
    // โหลดไม่สำเร็จ (เช่นพิมพ์รหัสผิด) — เก็บกวาดโฟลเดอร์ว่างทิ้ง ไม่ให้ค้างในรายการ
    const left = await fs.readdir(dir).catch(() => null)
    if (left && !left.length) await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    return { ok: false, id, form, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── รันจาก command line ──
const isCli = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isCli) {
  const ids = process.argv.slice(2)
  if (!ids.length) {
    console.error('ใช้: node scripts/fetch-ranger.mjs <ranger-id> [<ranger-id> ...]')
    process.exit(1)
  }
  const rangersDir = path.join(process.cwd(), 'public', 'rangers')
  for (const id of ids) {
    const r = await fetchRanger(id, rangersDir)
    if (r.ok) {
      const kb = r.written.reduce((s, w) => s + w.bytes, 0) / 1024
      const bul = r.bullets.length ? ' · กระสุน ' + r.bullets.join(',') : ''
      console.log(`✓ ${id.padEnd(18)} ${String(r.written.length).padStart(2)} ไฟล์ ${kb.toFixed(0).padStart(4)} KB${bul}`)
    } else {
      console.error(`✗ ${id.padEnd(18)} ${r.error}`)
    }
  }
}
