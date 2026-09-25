// ── คุยกับ dev API ใน vite.config.ts (อ่าน/เขียน ranger.json ลงดิสก์จริง) ──
import type { Category, Element, RangerConfig, Role } from './rangerConfig'

export interface RangerListItem {
  id: string
  name: string
  configured: boolean
  /** อนุมัติแล้ว = พร้อมเล่น → แสดงในหน้าจัดทีม */
  approved: boolean
  /** ระดับดาว 1–9 จากข้อมูลเกม (ไม่มีข้อมูล = null) · Evolution ดูจาก ID (lib/rangerGrade.ts) */
  grade: number | null
  bullets: string[]
  /** ตำแหน่ง/ธาตุจาก ranger.json — ใช้บอกความเข้ากันของช่องในหน้าจัดทีม (ยังไม่ตั้งค่า = null) */
  role: Role | null
  element: Element | null
  /** ชนิด: str พลัง / agi ว่องไว / int ไหวพริบ */
  category: Category | null
}

const json = async <T>(res: Response): Promise<T> => {
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}


export const listRangers = () =>
  fetch('/api/rangers').then(json<{ rangers: RangerListItem[] }>).then(d => d.rangers)
    // ไม่มี dev server (หน้าเล่นที่ build แล้ว) → รายชื่อไฟล์นิ่งที่สร้างตอน build
    .catch(() => fetch('/rangers/index.json').then(json<{ rangers: RangerListItem[] }>).then(d => d.rangers))

export const loadRangerConfig = (id: string) =>
  fetch(`/api/ranger/${id}`).then(json<{ ranger: RangerConfig | null }>).then(d => d.ranger)
    .catch(() => fetch(`/rangers/${encodeURIComponent(id)}/ranger.json`).then(r => (r.ok ? r.json() as Promise<RangerConfig> : null)).catch(() => null))

export const saveRangerConfig = (cfg: RangerConfig) =>
  fetch(`/api/ranger/${cfg.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).then(json<{ ok: true }>)

/** ลบเรนเจอร์ = ย้ายโฟลเดอร์ไปถังขยะ data/deleted-rangers/ (กู้คืนได้) */
export const deleteRanger = (id: string) =>
  fetch(`/api/ranger/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json<{ ok: true; movedTo: string }>)

export const fetchRangerAssets = (id: string) =>
  fetch('/api/fetch-ranger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).then(json<{ ok: boolean; written?: { file: string; bytes: number }[] }>)

export interface RefreshReport {
  ok: string[]; missing: string[]; sources: Record<string, string>; error: string | null
  /** ตัวที่เปลี่ยนชื่อตามข้อมูลเกม (id → ชื่อใหม่) — เฉพาะตัวที่ยังไม่ได้ตั้งชื่อเอง */
  renamed?: Record<string, string>
}

/** ดึงข้อมูลเกมจาก lerico ใหม่ (ธาตุ ชนิด สกิล ไอคอน) → public/rangers/<id>/stats.json */
export const refreshGameData = (ids?: string[]) =>
  fetch('/api/refresh-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  }).then(json<RefreshReport>)

/** ข้อมูลเกมของเรนเจอร์ (ไม่มีไฟล์ = null) */
export const loadGameInfo = (id: string): Promise<GameInfo | null> =>
  fetch(`/rangers/${encodeURIComponent(id)}/stats.json`)
    .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() as Promise<GameInfo> : null))
    .catch(() => null)

export interface GameSkillInfo {
  code: string
  name: { en: string | null; th: string | null; zh?: string | null }
  desc: { en: string | null; th: string | null; zh?: string | null }
  icon: string | null
  basis: { type: string; multiplier?: number | null } | null
}
export interface GameInfo {
  id: string
  name: { en: string; th: string | null; zh?: string | null }
  /** ระดับดาว 1–9 */
  grade?: number | null
  /** ขั้นในเกม เช่น "base9", "hyper" */
  tier?: string | null
  suggest: { element: Element | null; category: Category | null; role: Role | null }
  skills: { skill1: GameSkillInfo | null; skill2: GameSkillInfo | null; skill3: GameSkillInfo | null; passive: GameSkillInfo | null }
}

/** สำรอง: โหลด ranger.json เป็นไฟล์ เผื่อ dev server ไม่ได้รัน */
export function downloadConfig(cfg: RangerConfig): void {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${cfg.id}.ranger.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
