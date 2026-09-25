// Ranger Editor 管理後台；正式環境由 server/admin-server.mjs 處理登入驗證。
import RangerEditor from './editor/RangerEditor'
import { ELANGS, ELANG_LABEL, e, setELang, useELang } from './editor/i18n'

export default function App() {
  useELang()
  const showLogout = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)

  return (
    <div className="app">
      <nav className="topnav">
        <b>LINE Rangers 回合制戰鬥</b>
        <button className="sel">Ranger 編輯器</button>
        <button onClick={() => window.open('/play.html', '_blank', 'noopener')}>{e('navPlay')}</button>
        <LangSwitch />
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

function LangSwitch() {
  const lang = useELang()
  return (
    <div className="lang-seg" role="group" aria-label={e('language')}>
      {ELANGS.map(l => (
        <button key={l} className={l === lang ? 'sel' : ''} aria-pressed={l === lang} onClick={() => setELang(l)}>
          {ELANG_LABEL[l]}
        </button>
      ))}
    </div>
  )
}
