import { useMemo, useState } from 'react'
import type { GameplayEnemy, GameplayStage } from '@/lib/gameplaySchema'
import { SLOT_KEYS, placeClass, type Formation, type RangerData, type SlotKey } from './playerRoster'
import { localizedName, nameOf } from './ClassSelection'

const slotLabel: Record<SlotKey, string> = {
  'front-0': '前排 1', 'front-1': '前排 2', 'back-0': '後排 1', 'back-1': '後排 2', 'back-2': '後排 3',
}

export function StageSelection({ stages, enemies, onChoose }: { stages: GameplayStage[]; enemies: GameplayEnemy[]; onChoose: (stage: GameplayStage) => void }) {
  const enemyMap = useMemo(() => new Map(enemies.map(enemy => [enemy.id, enemy])), [enemies])
  const chapters = useMemo(() => {
    const rows = new Map<number, GameplayStage[]>()
    for (const stage of stages) {
      if (!rows.has(stage.chapter)) rows.set(stage.chapter, [])
      rows.get(stage.chapter)!.push(stage)
    }
    for (const list of rows.values()) list.sort((a,b) => a.order - b.order)
    return [...rows.entries()].sort((a,b) => a[0] - b[0])
  }, [stages])
  const [chapter, setChapter] = useState(() => chapters[0]?.[0] ?? 1)
  const current = chapters.find(([no]) => no === chapter)?.[1] ?? []
  const background = current[0]?.background || '/maps/map1_full.jpg'

  return <section className="ep-stages">
    <div className="ep-page-heading">
      <span className="ep-eyebrow">STAGE / WAVES</span>
      <h1>選擇關卡</h1>
      <p>每個關卡可包含多個波次；清除目前波次全部敵人後，才會進入下一波。</p>
    </div>
    {!stages.length ? <div className="ep-empty"><h2>目前尚未建立關卡</h2><p>可在管理平台的「敵人／關卡設計」建立第一個關卡。</p></div> : <>
      <div className="ep-chapter-tabs">{chapters.map(([no]) => <button key={no} className={chapter === no ? 'on' : ''} onClick={() => setChapter(no)}>第 {no} 章</button>)}</div>
      <div className="ep-stage-map" style={{ backgroundImage: `linear-gradient(180deg, rgba(8,13,24,.18), rgba(8,13,24,.72)), url("${background}")` }}>
        <div className="ep-stage-path">
          {current.map((stage, index) => {
            const count = stage.waves.reduce((n, wave) => n + wave.enemies.length, 0)
            const last = stage.waves.at(-1)?.enemies.at(-1)
            const boss = last ? enemyMap.get(last.enemyId) : null
            return <button key={stage.id} className="ep-stage-node" onClick={() => onChoose(stage)} style={{ marginTop: `${[70,10,105,35,85][index % 5]}px` }}>
              <span className="ep-stage-button"><img src="/stage/area2-btn-on.png" alt="" /><b>{stage.order}</b></span>
              {boss && <img className="ep-stage-enemy" src={`/rangers/${boss.assetVariantId}/thumb.png`} alt="" />}
              <strong>{localizedName(stage.names, stage.id)}</strong>
              <small>{stage.waves.length} 波 · {count} 名敵人</small>
            </button>
          })}
        </div>
      </div>
    </>}
  </section>
}

export function StagePartySetup({ stage, data, formation, setFormation, onStart, onBack, busy, message }: {
  stage: GameplayStage
  data: RangerData[]
  formation: Formation
  setFormation: React.Dispatch<React.SetStateAction<Formation>>
  onStart: () => void
  onBack: () => void
  busy: boolean
  message: string
}) {
  const [selected, setSelected] = useState<SlotKey>('front-0')
  const team = formation[0]
  const filled = SLOT_KEYS.filter(slot => !!team[slot]).length
  const choose = (classId: string) => setFormation(current => placeClass(current, data, 0, selected, classId))
  const remove = (slot: SlotKey) => setFormation(current => placeClass(current, data, 0, slot, null))

  return <section className="ep-stage-setup">
    <div className="ep-page-heading">
      <button className="ep-back" onClick={onBack}>← 返回關卡</button>
      <span className="ep-eyebrow">PARTY / {stage.waves.length} WAVES</span>
      <h1>{localizedName(stage.names, stage.id)}</h1>
      <p>{stage.description || '編組要出戰的角色。角色在同一關卡的波次之間會保留剩餘體力與技能條。'}</p>
    </div>
    <div className="epset-layout">
      <div className="epset-board">
        <header><b>出戰隊伍</b><span>{filled}/5</span></header>
        <div className="epset-row back">{SLOT_KEYS.filter(slot => slot.startsWith('back')).map(slot => <PartySlot key={slot} slot={slot} playId={team[slot]} data={data} active={selected === slot} onSelect={() => setSelected(slot)} onRemove={() => remove(slot)} />)}</div>
        <div className="epset-row front">{SLOT_KEYS.filter(slot => slot.startsWith('front')).map(slot => <PartySlot key={slot} slot={slot} playId={team[slot]} data={data} active={selected === slot} onSelect={() => setSelected(slot)} onRemove={() => remove(slot)} />)}</div>
      </div>
      <aside className="epset-summary">
        <h3>關卡波次</h3>
        {stage.waves.map((wave, i) => <div key={wave.id}><b>Wave {i + 1}</b><span>{wave.enemies.length} 名敵人</span></div>)}
      </aside>
    </div>
    <div className="epset-pool">
      <h3>選擇「{slotLabel[selected]}」角色</h3>
      <div className="epset-cards">{data.map(row => {
        const used = Object.values(team).includes(row.playId)
        return <button key={row.playId} className={used ? 'used' : ''} onClick={() => choose(row.playId)}>
          <img src={`/rangers/${row.item.id}/thumb.png`} alt="" /><strong>{nameOf(row)}</strong><small>{row.gameplayClass.role}</small>
        </button>
      })}</div>
    </div>
    {message && <p className="ep-notice">{message}</p>}
    <div className="epset-start"><span>{filled ? '準備完成後開始第一波。' : '至少需要一名角色出戰。'}</span><button className="ep-primary" disabled={!filled || busy} onClick={onStart}>{busy ? '載入中…' : '開始關卡'}</button></div>
  </section>
}

function PartySlot({ slot, playId, data, active, onSelect, onRemove }: { slot: SlotKey; playId: string | null; data: RangerData[]; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const row = playId ? data.find(item => item.playId === playId) : null
  return <div className={'epset-slot' + (active ? ' active' : '') + (row ? ' filled' : '')}>
    <button onClick={onSelect}>{row ? <><img src={`/rangers/${row.item.id}/thumb.png`} alt="" /><strong>{nameOf(row)}</strong></> : <><span>＋</span><strong>{slotLabel[slot]}</strong></>}</button>
    {row && <button className="epset-remove" onClick={onRemove} aria-label="移除">×</button>}
  </div>
}
