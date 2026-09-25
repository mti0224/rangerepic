// Ranger Editor 後台；正式環境由 server/admin-server.mjs 在外層處理登入驗證。
import RangerEditor from './editor/RangerEditor'

export default function App() {
  const showLogout = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)

  return (
    <div className="app">
      <nav className="topnav">
        <b>LINE Rangers 回合制戰鬥</b>
        <button className="sel">Ranger 編輯器</button>
        <button onClick={() => window.open('/play.html', '_blank', 'noopener')}>⚔ 試玩 5v5 ↗</button>
        {showLogout && (
          <form action="/logout" method="post" style={{ display: 'contents' }}>
            <button type="submit">登出</button>
          </form>
        )}
      </nav>
      <div className="page"><RangerEditor /></div>
    </div>
  )
}
