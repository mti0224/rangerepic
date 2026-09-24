// ====================================================
// theme.ts — ธีมหน้าตาของเกม (หน้าหลัก/จัดทีม) · จำไว้ในเครื่อง (localStorage 'lr:theme')
//
//   neon  = ค่าเริ่มต้น: มืด-ฟ้านีออน มุมมน มีเงาฟุ้ง
//   pixel = เผื่อไว้สำหรับฮีโร่พิกเซลในอนาคต: มุมเหลี่ยม ขอบหนา ไม่มีเบลอ ฟอนต์พิกเซล
//
// ธีมทำงานด้วย data-theme บน <html> แล้วให้ CSS (lobby.css) เปลี่ยนค่าตัวแปรทั้งชุด
// อยากเพิ่มธีมใหม่: เพิ่มชื่อใน THEMES + บล็อก :root[data-theme="…"] ใน lobby.css เท่านั้น
// ====================================================

export type Theme = 'neon' | 'pixel'
export const THEMES: Theme[] = ['neon', 'pixel']

const KEY = 'lr:theme'

let theme: Theme = (() => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return v === 'pixel' ? 'pixel' : 'neon'
  } catch { return 'neon' }
})()

const listeners = new Set<(t: Theme) => void>()

function apply(t: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
}
apply(theme)

export const getTheme = (): Theme => theme

export function setTheme(next: Theme): void {
  theme = next
  apply(next)
  try { localStorage.setItem(KEY, next) } catch { /* จำไม่ได้ก็ใช้ได้แค่รอบนี้ */ }
  for (const fn of listeners) fn(next)
}

/** ฟังการเปลี่ยนธีม (คืนฟังก์ชันเลิกฟัง) */
export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
