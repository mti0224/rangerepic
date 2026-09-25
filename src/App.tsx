// ── หน้า Editor · ปุ่ม "ทดลองเล่น" เปิดหน้าเล่น (play.html) ในแท็บใหม่ — คนละหน้า คนละ bundle ──
import RangerEditor from './editor/RangerEditor'

export default function App() {
  return (
    <div className="app">
      <nav className="topnav">
        <b>LINE Rangers 回合制戰鬥</b>
        <button className="sel">Ranger 編輯器</button>
        <button onClick={() => window.open('/play.html', '_blank', 'noopener')}>⚔ ทดลองเล่น 5v5 ↗</button>
      </nav>
      <div className="page"><RangerEditor /></div>
    </div>
  )
}
