import { useState } from 'react'
import { ClassSelection, characterNameOf, nameOf } from './ClassSelection'
import { SLOT_KEYS, emptyTeam, placeClass, type Formation, type RangerData, type SlotKey } from './playerRoster'
export { SLOT_KEYS, emptyTeam, type Formation, type RangerData, type TeamSlots } from './playerRoster'

export default function TeamBuilder({ data, formation, setFormation, onStart, busy, message, playerOnly = false, stageName = '' }: {
  data: RangerData[]; formation: Formation; setFormation: (f: Formation | ((f: Formation) => Formation)) => void; onStart: () => void; busy: boolean; message: string
  playerOnly?: boolean; stageName?: string
}) {
  const [picker, setPicker] = useState<{ side: 0 | 1; slot: SlotKey } | null>(null)
  const rowOf = (id: string | null) => data.find(d => d.playId === id)
  const canStart = playerOnly ? SLOT_KEYS.some(k => rowOf(formation[0][k])) : formation.every(team => SLOT_KEYS.some(k => rowOf(team[k])))
  if (picker) return <ClassSelection key={`${picker.side}:${picker.slot}`} data={data} initialClassId={formation[picker.side][picker.slot]} onBack={() => setPicker(null)} confirmLabel="確認加入隊伍" onConfirm={row => {
    setFormation(f => placeClass(f, data, picker.side, picker.slot, row.playId)); setPicker(null)
  }} />
  return <main className="ep-team-page">
    <div className="ep-page-heading"><span className="ep-eyebrow">{playerOnly ? 'TEAM / STAGE' : 'TEAM / PRACTICE'}</span><h1>{playerOnly ? '編組出戰隊伍' : '編組隊伍'}</h1><p>{playerOnly ? `準備挑戰「${stageName}」。選擇我方最多 5 位角色，同一角色限出場一次。` : '點選空位，依序選擇角色與職業。每隊最多 5 位角色，同一角色每隊限出場一次。'}</p></div>
    <div className="ep-team-boards">{(playerOnly ? [0] as const : [0, 1] as const).map(side => <section className={'ep-team-board side-' + side} key={side}>
      <header><h2>{side === 0 ? '我方隊伍' : '對手隊伍'} <small>{SLOT_KEYS.filter(k => rowOf(formation[side][k])).length} / 5</small></h2><button disabled={busy} onClick={() => setFormation(f => side === 0 ? [emptyTeam(), f[1]] : [f[0], emptyTeam()])}>清空</button></header>
      <div className="ep-slots">{SLOT_KEYS.map((slot, i) => {
        const row = rowOf(formation[side][slot])
        return <div className={'ep-slot' + (row ? ' filled' : '')} key={slot}>
          <button className="ep-slot-select" disabled={busy || !data.length} onClick={() => setPicker({ side, slot })} aria-label={`${side === 0 ? '我方' : '對手'}位置 ${i + 1}${row ? '：更換職業' : '：選擇角色'}`}>
            <small>位置 {i + 1}</small>{row ? <><img src={`/rangers/${row.item.id}/thumb.png`} alt="" /><strong>{characterNameOf(row)}</strong><span>{nameOf(row)}</span><em>更換職業</em></> : <><b className="ep-plus">＋</b><span>選擇角色</span></>}
          </button>
          {row && <button className="ep-slot-remove" disabled={busy} aria-label={`移除${characterNameOf(row)}`} onClick={() => setFormation(f => placeClass(f, data, side, slot, null))}>×</button>}
        </div>
      })}</div>
    </section>)}</div>
    {message && <p className="ep-error" role="alert">{message}</p>}
    <footer className="ep-team-footer"><p>{canStart ? '隊伍已準備完成。' : (playerOnly ? '請選擇至少 1 位出戰角色。' : '請替雙方各選擇至少 1 位角色。')}</p><button className="ep-primary" disabled={busy || !canStart} onClick={onStart}>{busy ? '載入中…' : (playerOnly ? '開始關卡 →' : '開始對戰 →')}</button></footer>
  </main>
}
