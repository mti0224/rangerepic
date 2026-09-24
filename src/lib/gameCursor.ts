// ====================================================
// gameCursor.ts — เคอร์เซอร์เมาส์ของเกม (ถุงมือเกราะชี้นิ้ว) — ใช้เฉพาะหน้าดวล (.battle)
//
// รูปต้นฉบับ (500×500) ใหญ่เกินเคอร์เซอร์ → ย่อตอนเปิดแอปเป็น CURSOR_SIZE px
//   public/ui/cursor.png        ปกติ
//   public/ui/cursor_click.png  ตอนกดเมาส์ค้าง (.battle.pressing — หน้าดวลใส่คลาสนี้เองตอนกด)
// จุดคลิก = ปลายนิ้วชี้ของแต่ละรูป (หาอัตโนมัติ: พิกเซลทึบที่อยู่มุมซ้ายบนสุด)
// ใส่ด้วย stylesheet !important ให้ชนะ cursor ของทุกชิ้นในหน้าดวล · หน้าอื่น (จัดทีม/editor) ใช้เคอร์เซอร์ปกติ
// โหลดรูปไม่ได้ → ใช้เคอร์เซอร์ปกติของระบบต่อไป
// ====================================================

const CURSOR_SRC = '/ui/cursor.png'
const CURSOR_CLICK_SRC = '/ui/cursor_click.png'
/**
 * ขนาดเคอร์เซอร์ (px) — ห้ามเกิน 32: Chrome ไม่ยอมแสดงเคอร์เซอร์ที่ใหญ่กว่า 32×32 เมื่อรูปจะล้นขอบหน้าต่าง
 * (จุดคลิกอยู่มุมซ้ายบน รูปห้อยลงขวา → ใกล้ขอบล่าง/ขวาจะกลับเป็นเคอร์เซอร์ธรรมดา)
 */
export const CURSOR_SIZE = 32
const STYLE_ID = 'game-cursor'

export function installGameCursor(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  void Promise.all([cursorCss(CURSOR_SRC), cursorCss(CURSOR_CLICK_SRC)]).then(([normal, pressed]) => {
    if (!normal || document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    // หน้าดวล (.battle) + หน้าทดลองเล่นทั้งหน้า (.play-app) · editor ใช้เคอร์เซอร์ปกติ · ช่องพิมพ์ = เคอร์เซอร์พิมพ์
    style.textContent = `
      .battle, .battle *, .battle *::before, .battle *::after,
      .play-app, .play-app *, .play-app *::before, .play-app *::after { cursor: ${normal}, auto !important; }
      .battle.pressing, .battle.pressing *, .battle.pressing *::before, .battle.pressing *::after,
      .play-app.pressing, .play-app.pressing *, .play-app.pressing *::before, .play-app.pressing *::after { cursor: ${pressed ?? normal}, auto !important; }
      .play-app input[type=search], .play-app input[type=text] { cursor: text !important; }
    `
    document.head.appendChild(style)
  })
}

/** โหลดรูป → ย่อเป็นเคอร์เซอร์ → `url(...) x y` (โหลดไม่ได้ = null) */
function cursorCss(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onerror = () => resolve(null)
    img.onload = () => {
      const k = CURSOR_SIZE / Math.max(img.naturalWidth, img.naturalHeight)
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d', { willReadFrequently: true })
      if (!g) { resolve(null); return }
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, w, h)
      const { x, y } = fingertip(g, w, h)
      resolve(`url(${c.toDataURL('image/png')}) ${x} ${y}`)
    }
    img.src = src
  })
}

/** ปลายนิ้ว = พิกเซลทึบที่ x + y น้อยสุด (มุมซ้ายบนสุดของรูป) */
function fingertip(g: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number } {
  const d = g.getImageData(0, 0, w, h).data
  let best = { x: 0, y: 0, s: Infinity }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 160 && x + y < best.s) best = { x, y, s: x + y }
    }
  }
  return best.s === Infinity ? { x: 0, y: 0 } : { x: best.x, y: best.y }
}
