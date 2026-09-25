// ====================================================
// icons.tsx — ไอคอนเส้น (SVG) ของหน้าทดลองเล่น แทนอีโมจิ · สีตาม currentColor · ขนาดตาม size (px)
// ====================================================

import type { ReactNode } from 'react'

type IconProps = { size?: number; className?: string; title?: string }

const svg = (paths: ReactNode, { size = 16, className, title }: IconProps) => (
  <svg className={'ico' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title && <title>{title}</title>}
    {paths}
  </svg>
)

/** ดาบไขว้ — โลโก้ / เริ่มดวล */
export const IconSwords = (p: IconProps) => svg(<>
  <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
  <path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" />
  <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
  <path d="m5 14 4 4" /><path d="m7 17-3 3" /><path d="m3 19 2 2" />
</>, p)

/** ลูกเต๋า — สุ่มทีม */
export const IconDice = (p: IconProps) => svg(<>
  <rect x="3" y="3" width="18" height="18" rx="3" />
  <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
  <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
  <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
  <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
</>, p)

/** ถังขยะ — ลบ / ล้าง */
export const IconTrash = (p: IconProps) => svg(<>
  <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v5" /><path d="M14 11v5" />
</>, p)

/** ลูกศรสลับ — เปลี่ยนตัว */
export const IconSwap = (p: IconProps) => svg(<>
  <path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" />
</>, p)

/** กากบาท — ปิด */
export const IconClose = (p: IconProps) => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p)

/** เครื่องหมายถูก */
export const IconCheck = (p: IconProps) => svg(<path d="M20 6 9 17l-5-5" />, p)

/** เครื่องหมายคำถามในวงกลม — วิธีเล่น */
export const IconHelp = (p: IconProps) => svg(<>
  <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
</>, p)

/** i ในวงกลม — ดูข้อมูล */
export const IconInfo = (p: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.6" fill="currentColor" /></>, p)

/** แว่นขยาย — ค้นหา */
export const IconSearch = (p: IconProps) => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p)

/** บวก — เพิ่มลงทีม */
export const IconPlus = (p: IconProps) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p)

/** ดาว — ฮีโร่ที่ชอบ (filled = เติมสีด้านใน) */
export const IconStar = ({ filled, ...p }: IconProps & { filled?: boolean }) => svg(
  <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" fill={filled ? 'currentColor' : 'none'} />, p)

/** ลบ — ลดค่า (เลเวล / ตีบวก) */
export const IconMinus = (p: IconProps) => svg(<path d="M5 12h14" />, p)

// ── หน้าหลัก (Lobby) ──

/** ลูกศรซ้าย — ย้อนกลับ */
export const IconBack = (p: IconProps) => svg(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>, p)

/** คน — โปรไฟล์ผู้เล่น */
export const IconUser = (p: IconProps) => svg(<><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>, p)

/** คนสามคน — ฮีโร่ทั้งหมด */
export const IconHeroes = (p: IconProps) => svg(<>
  <circle cx="9" cy="8.5" r="3" /><path d="M3 19a6 6 0 0 1 12 0" />
  <path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17.5 14.2A6 6 0 0 1 21 19" />
</>, p)

/** ธงประจำทีม — จัดทีม */
export const IconTeam = (p: IconProps) => svg(<><path d="M5 21V4" /><path d="M5 4h11l-2 3.5L16 11H5" /></>, p)

/** กระเป๋า — ไอเทม */
export const IconBag = (p: IconProps) => svg(<>
  <path d="M4 8h16l-1.2 12H5.2L4 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
</>, p)

/** ถุงเงิน/ป้ายราคา — ร้านค้า */
export const IconShop = (p: IconProps) => svg(<>
  <path d="M4 9h16l-1 11H5L4 9Z" /><path d="M4 9 6 4h12l2 5" /><path d="M9 13a3 3 0 0 0 6 0" />
</>, p)

/** ตู้กาชา — สุ่มฮีโร่ */
export const IconGacha = (p: IconProps) => svg(<>
  <circle cx="12" cy="9" r="5.5" /><path d="M6.5 9h11" /><circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none" />
  <path d="M6 14.5h12l-1 6H7l-1-6Z" />
</>, p)

/** เฟือง — ตั้งค่า */
export const IconGear = (p: IconProps) => svg(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
</>, p)

/** ซองจดหมาย — กล่องข้อความ */
export const IconMail = (p: IconProps) => svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>, p)

/** เหรียญ — เงิน */
export const IconCoin = (p: IconProps) => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9" /><path d="M14.5 9.8a2.6 2.6 0 0 0-5 .9c0 2.6 5 1.2 5 3.6a2.6 2.6 0 0 1-5 .5" /></>, p)

/** เพชร — เงินพรีเมียม */
export const IconGem = (p: IconProps) => svg(<><path d="m12 21-9-11 3-6h12l3 6-9 11Z" /><path d="M3 10h18" /><path d="m9 4 3 6 3-6" /></>, p)

/** สายฟ้า — พลังงาน */
export const IconBolt = (p: IconProps) => svg(<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />, p)

/** แม่กุญแจ — ยังไม่เปิดให้เล่น */
export const IconLock = (p: IconProps) => svg(<><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>, p)

/** ถ้วยรางวัล — สนามประลอง */
export const IconTrophy = (p: IconProps) => svg(<>
  <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 5.5H4.5V8a3 3 0 0 0 3 3" /><path d="M17 5.5h2.5V8a3 3 0 0 1-3 3" />
  <path d="M12 14v3.5" /><path d="M8.5 20.5h7" /><path d="M10 17.5h4v3h-4z" />
</>, p)

/** แผนที่ — โหมดเนื้อเรื่อง */
export const IconMap = (p: IconProps) => svg(<>
  <path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5Z" /><path d="M9 4v13.5" /><path d="M15 6.5V20" />
</>, p)

/** หัวกะโหลก — บอส */
export const IconSkull = (p: IconProps) => svg(<>
  <path d="M5 11a7 7 0 1 1 14 0v3.5l-2 1V19H7v-3.5l-2-1V11Z" />
  <circle cx="9.5" cy="11" r="1.4" fill="currentColor" stroke="none" /><circle cx="14.5" cy="11" r="1.4" fill="currentColor" stroke="none" />
</>, p)

/** ปฏิทิน — ภารกิจประจำวัน */
export const IconCalendar = (p: IconProps) => svg(<>
  <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3.5v3" /><path d="M16 3.5v3" />
</>, p)
