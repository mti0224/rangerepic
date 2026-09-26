// Ranger Editor 管理後台；正式環境由 server/admin-server.mjs 處理登入驗證。
import { useState } from 'react'
import RangerEditor from './editor/RangerEditor'
import GameplayEditor from './editor/GameplayEditor'
import EncounterEditor from './editor/EncounterEditor'
import { ELANGS, ELANG_LABEL, e, setELang, useELang } from './editor/i18n'

export default function App() {
  useELang()
  const [view, setView] = useState<'assets' | 'gameplay' | 'encounters'>('assets')
  const showLogout = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)

  return (
    <div className="app">
      <nav className="topnav">
        <b>LINE Rangers 回合制戰鬥</b>
        <button className={view === 'assets' ? 'sel' : ''} onClick={() => setView('assets')}>圖資管理</button>
        <button className={view === 'gameplay' ? 'sel' : ''} onClick={() => setView('gameplay')}>角色數據管理</button>
        <button className={view === 'encounters' ? 'sel' : ''} onClick={() => setView('encounters')}>敵人／關卡設計</button>
        <button onClick={() => window.open('/play.html', '_blank', 'noopener')}>{e('navPlay')}</button>
        <LangSwitch />
        {showLogout && (
          <form action="/logout" method="post" style={{ display: 'contents' }}>
            <button type="submit">登出</button>
          </form>
        )}
      </nav>
      <div className="page">{view === 'assets' ? <RangerEditor /> : view === 'gameplay' ? <GameplayEditor /> : <EncounterEditor />}</div>
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
