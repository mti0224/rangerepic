// ====================================================
// rangerGrade.ts — ระดับดาว (1–9) และ Evolution ของเรนเจอร์
//
// ระดับดาว = "grade" ในข้อมูลเกม (public/rangers/<id>/stats.json ที่ดึงจาก lerico)
// Evolution ดูจากตัวอักษรหลังเลขใน ID (ไม่ต้องโหลด):
//   e = Normal  เช่น u1631e-sally
//   u = Ultra   เช่น u1626u-cony
//   h = Hyper   เช่น u1628h-boss
// รูปดาว public/ui/: Normal = <n>star.png (ทอง) · Ultra = <n>star-ultra.png (ฟ้าเทอร์ควอยซ์) · Hyper = <n>star-hyper.png (ชมพู)
//   (ชื่อไฟล์ห้ามมี # หรือ + — dev server ของ Vite ไม่ถอดรหัส %23 ในชื่อไฟล์ ส่งหน้าเว็บกลับมาแทนรูป)
// ====================================================

export type Evolution = 'normal' | 'ultra' | 'hyper'

export const EVOLUTION_LABEL: Record<Evolution, string> = { normal: 'Normal', ultra: 'Ultra', hyper: 'Hyper' }

/** Evolution จาก ID เช่น u1628h-boss → hyper · รูปแบบไม่ตรง = normal */
export function evolutionOf(id: string): Evolution {
  const m = id.match(/^u\d+([euh])/i)
  const c = m?.[1].toLowerCase()
  return c === 'h' ? 'hyper' : c === 'u' ? 'ultra' : 'normal'
}

/** ระดับดาวที่มีรูปในแต่ละ Evolution (ตามไฟล์ใน public/ui/) */
const STAR_FILES: Record<Evolution, number> = { normal: 9, ultra: 8, hyper: 8 }
const SUFFIX: Record<Evolution, string> = { normal: '', ultra: '-ultra', hyper: '-hyper' }

/**
 * รูปดาวของระดับ + Evolution (null = ไม่รู้ระดับ)
 * ไม่มีรูปของ Evolution นั้นในระดับนี้ (เช่น 9 ดาว Ultra) → ใช้รูปแบบ Normal ของระดับเดียวกัน
 */
export function starImageUrl(grade: number | null | undefined, evo: Evolution): string | null {
  if (!grade || grade < 1) return null
  const g = Math.min(9, Math.round(grade))
  const e = g <= STAR_FILES[evo] ? evo : 'normal'
  return `/ui/${g}star${SUFFIX[e]}.png`
}

/** ข้อความสั้น เช่น "★9 · Hyper" */
export const gradeText = (grade: number | null | undefined, evo: Evolution): string =>
  `${grade ? `★${grade} · ` : ''}${EVOLUTION_LABEL[evo]}`
