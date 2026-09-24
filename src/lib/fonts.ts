// ====================================================
// fonts.ts — โหลดฟอนต์ล่วงหน้า: LINE Bold (ตัวเลข/ภาษาอังกฤษ) + Krub SemiBold (ภาษาไทย)
// canvas ไม่รอฟอนต์เอง: ถ้ายังโหลดไม่เสร็จจะวาดด้วยฟอนต์สำรองไปก่อน จึงสั่งโหลดตั้งแต่เปิดแอป
// ====================================================

export const GAME_FONT = 'LineBold'
export const THAI_FONT = 'Krub'

export function preloadFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  // ต้องมีตัวอักษรในช่วง unicode-range ถึงจะโหลดจริง
  return Promise.all([
    document.fonts.load(`bold 16px ${GAME_FONT}`, '0123456789 ABC'),
    document.fonts.load(`bold 16px ${THAI_FONT}`, 'ภาษาไทย'),
  ]).catch(() => undefined)
}
