// ── หน้าทดลองเล่น (แยกจาก editor) — bundle นี้ไม่มีโค้ด editor เลย ──
import React from 'react'
import ReactDOM from 'react-dom/client'
// โหลด CSS กลางก่อน แล้วค่อยโหลดหน้า (lobby.css มากับ PlayMode) — สไตล์หน้าหลักจะได้ทับค่ากลางได้
import './styles.css'
import './play/play.css'
import PlayMode from './play/PlayMode'
import { preloadFonts } from './lib/fonts'
import { installGameCursor } from './lib/gameCursor'
import { installNoZoom } from './play/screen'

void preloadFonts()
installGameCursor()
installNoZoom()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlayMode />
  </React.StrictMode>,
)
